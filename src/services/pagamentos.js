const db = require('../db');
const config = require('../config');
const { montarPayload, validarChave, gerarTxid } = require('../lib/pix');
const { ErroHttp, validarCompetencia } = require('../lib/util');

/** Valor que o funcionário deve receber na competência, ou o motivo de não haver valor. */
function valorDevido(funcionario, comissao) {
  if (funcionario.modo_comissao === 'fixa') {
    return funcionario.valor_fixo > 0
      ? { valor: Number(funcionario.valor_fixo), comissao_id: null }
      : { motivo: 'Comissão fixa sem valor no cadastro.' };
  }
  return comissao
    ? { valor: Number(comissao.valor), comissao_id: comissao.id }
    : { motivo: 'Sem comissão lançada para a competência.' };
}

/** Monta a linha da tabela pagamentos (ainda não gravada). */
function montarRegistro(funcionario, competencia, valor, comissaoId) {
  const erroChave = validarChave(funcionario.tipo_chave, funcionario.chave_pix);
  if (erroChave) throw new ErroHttp(400, `${funcionario.nome}: ${erroChave}`);

  const txid = gerarTxid(competencia, funcionario.id);
  const descricao = config.pix.descricao.replace('{competencia}', competencia);
  const { payload, nome, cidade } = montarPayload({
    chave: funcionario.chave_pix,
    valor,
    nome: funcionario.nome,
    cidade: funcionario.cidade || config.pix.cidadePadrao,
    txid,
    descricao,
  });

  return {
    funcionario_id: funcionario.id,
    comissao_id: comissaoId || null,
    competencia,
    valor: Math.round(Number(valor) * 100) / 100,
    nome_recebedor: nome,
    chave_pix: funcionario.chave_pix,
    cidade,
    txid,
    payload,
  };
}

/**
 * Gera os QR Codes da competência para todos os funcionários ativos
 * (ou só para os ids informados) que ainda não têm pagamento ativo nela.
 */
async function gerarLote(competencia, funcionarioIds) {
  validarCompetencia(competencia);

  let consulta = db('funcionarios').where({ ativo: true }).orderBy('nome');
  if (Array.isArray(funcionarioIds) && funcionarioIds.length) consulta = consulta.whereIn('id', funcionarioIds);
  const funcionarios = await consulta;

  const [existentes, comissoes] = await Promise.all([
    db('pagamentos').where({ competencia }).whereNot('status', 'cancelado').pluck('funcionario_id'),
    db('comissoes').where({ competencia }),
  ]);
  const jaTem = new Set(existentes);
  const comissaoPor = new Map(comissoes.map((c) => [c.funcionario_id, c]));

  const registros = [];
  const ignorados = [];
  for (const f of funcionarios) {
    if (jaTem.has(f.id)) {
      ignorados.push({ funcionario_id: f.id, nome: f.nome, motivo: 'Já tem pagamento nesta competência.' });
      continue;
    }
    const devido = valorDevido(f, comissaoPor.get(f.id));
    if (devido.motivo) {
      ignorados.push({ funcionario_id: f.id, nome: f.nome, motivo: devido.motivo });
      continue;
    }
    try {
      registros.push(montarRegistro(f, competencia, devido.valor, devido.comissao_id));
    } catch (e) {
      ignorados.push({ funcionario_id: f.id, nome: f.nome, motivo: e.message });
    }
  }

  // "on conflict ... do nothing" ignora quem ganhou um pagamento entre a leitura e a gravação
  // (dois cliques seguidos em "Gerar lote"), usando o índice único parcial da migration
  let criados = [];
  if (registros.length) {
    const { sql, bindings } = db('pagamentos').insert(registros).toSQL();
    const r = await db.raw(
      `${sql} on conflict (funcionario_id, competencia) where status <> 'cancelado' do nothing
       returning id, funcionario_id, nome_recebedor, valor`,
      bindings,
    );
    criados = r.rows;
  }

  return {
    competencia,
    criados: criados.length,
    total: criados.reduce((s, p) => s + Number(p.valor), 0),
    ignorados,
  };
}

/** Gera um pagamento avulso. Sem valor informado, usa o valor fixo ou a comissão da competência. */
async function criarAvulso({ funcionario_id, competencia, valor }) {
  validarCompetencia(competencia);
  const f = await db('funcionarios').where({ id: funcionario_id }).first();
  if (!f) throw new ErroHttp(404, 'Funcionário não encontrado.');
  if (!f.ativo) throw new ErroHttp(400, 'Funcionário inativo.');

  let comissaoId = null;
  let v = Number(valor);
  if (!(v > 0)) {
    const comissao = await db('comissoes').where({ funcionario_id: f.id, competencia }).first();
    const devido = valorDevido(f, comissao);
    if (devido.motivo) throw new ErroHttp(400, devido.motivo);
    v = devido.valor;
    comissaoId = devido.comissao_id;
  }

  const ativo = await db('pagamentos')
    .where({ funcionario_id: f.id, competencia })
    .whereNot('status', 'cancelado')
    .first();
  if (ativo) throw new ErroHttp(409, `${f.nome} já tem pagamento nesta competência (${ativo.status}).`);

  const [criado] = await db('pagamentos').insert(montarRegistro(f, competencia, v, comissaoId)).returning('*');
  return criado;
}

async function buscar(id) {
  const p = await db('pagamentos')
    .join('funcionarios', 'funcionarios.id', 'pagamentos.funcionario_id')
    .where('pagamentos.id', id)
    .first('pagamentos.*', 'funcionarios.nome as funcionario_nome');
  if (!p) throw new ErroHttp(404, 'Pagamento não encontrado.');
  return p;
}

async function marcarPago(id, { pago_em, comprovante, observacao, confirmacao = 'manual' } = {}, trx = db) {
  const quando = pago_em ? new Date(pago_em) : new Date();
  if (isNaN(quando)) throw new ErroHttp(400, 'Data de pagamento inválida.');
  const linhas = await trx('pagamentos')
    .where({ id, status: 'pendente' })
    .update({
      status: 'pago',
      pago_em: quando,
      confirmacao,
      comprovante: comprovante ? String(comprovante).slice(0, 255) : null,
      ...(observacao ? { observacao } : {}),
    })
    .returning('*');
  if (!linhas.length) {
    const atual = await trx('pagamentos').where({ id }).first('status');
    if (!atual) throw new ErroHttp(404, 'Pagamento não encontrado.');
    throw new ErroHttp(409, `Pagamento já está ${atual.status}.`);
  }
  return linhas[0];
}

async function cancelar(id, observacao) {
  const linhas = await db('pagamentos')
    .where({ id, status: 'pendente' })
    .update({ status: 'cancelado', ...(observacao ? { observacao } : {}) })
    .returning('*');
  if (!linhas.length) {
    const atual = await db('pagamentos').where({ id }).first('status');
    if (!atual) throw new ErroHttp(404, 'Pagamento não encontrado.');
    throw new ErroHttp(409, `Só é possível cancelar pagamentos pendentes (este está ${atual.status}).`);
  }
  return linhas[0];
}

/** Desfaz uma confirmação de pagamento e solta a transação do extrato vinculada, se houver. */
async function reabrir(id) {
  return db.transaction(async (trx) => {
    const linhas = await trx('pagamentos')
      .where({ id, status: 'pago' })
      .update({ status: 'pendente', pago_em: null, confirmacao: null, comprovante: null })
      .returning('*');
    if (!linhas.length) throw new ErroHttp(409, 'Só é possível reabrir pagamentos marcados como pagos.');
    await trx('transacoes_extrato')
      .where({ pagamento_id: id })
      .update({ pagamento_id: null, situacao: 'sem_correspondencia' });
    return linhas[0];
  });
}

module.exports = { valorDevido, gerarLote, criarAvulso, buscar, marcarPago, cancelar, reabrir };
