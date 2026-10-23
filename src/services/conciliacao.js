const db = require('../db');
const { escolherPagamento } = require('../lib/regrasConciliacao');
const { marcarPago } = require('./pagamentos');
const { ErroHttp, centavos } = require('../lib/util');

/**
 * Tenta casar todas as saídas sem correspondência com pagamentos pendentes.
 * Cada pagamento é usado no máximo uma vez. Retorna a lista de conciliações feitas.
 */
async function conciliarPendentes() {
  const transacoes = await db('transacoes_extrato as t')
    .join('importacoes_extrato as i', 'i.id', 't.importacao_id')
    .where('t.situacao', 'sem_correspondencia')
    .orderBy([{ column: 't.data' }, { column: 't.id' }])
    .select('t.*', 'i.fonte');
  if (!transacoes.length) return [];

  const pendentes = await db('pagamentos')
    .where({ status: 'pendente' })
    .select('id', 'valor', 'txid', 'nome_recebedor', 'chave_pix', 'created_at');

  const disponiveis = [...pendentes];
  const feitas = [];

  for (const t of transacoes) {
    const escolha = escolherPagamento(t, disponiveis);
    if (!escolha) continue;
    const { pagamento, motivo } = escolha;

    await db.transaction(async (trx) => {
      await marcarPago(
        pagamento.id,
        {
          pago_em: new Date(`${t.data}T12:00:00`),
          confirmacao: t.fonte === 'api' ? 'api' : 'extrato',
          comprovante: t.id_externo,
        },
        trx,
      );
      await trx('transacoes_extrato')
        .where({ id: t.id })
        .update({ pagamento_id: pagamento.id, situacao: 'conciliada' });
    });

    disponiveis.splice(disponiveis.indexOf(pagamento), 1);
    feitas.push({ transacao_id: t.id, pagamento_id: pagamento.id, nome: pagamento.nome_recebedor, valor: t.valor, motivo });
  }
  return feitas;
}

/**
 * Grava as saídas lidas de um extrato (arquivo ou API), ignora as que já existem
 * e roda a conciliação automática.
 */
async function importarSaidas({ fonte, arquivo, saidas, periodoInicio, periodoFim }) {
  const datas = saidas.map((s) => s.data).sort();
  const [importacao] = await db('importacoes_extrato')
    .insert({
      fonte,
      arquivo: arquivo || null,
      periodo_inicio: periodoInicio || datas[0] || null,
      periodo_fim: periodoFim || datas[datas.length - 1] || null,
      total: saidas.length,
    })
    .returning('*');

  let novas = 0;
  for (let i = 0; i < saidas.length; i += 500) {
    const lote = saidas.slice(i, i + 500).map((s) => ({
      importacao_id: importacao.id,
      id_externo: String(s.id_externo).slice(0, 160),
      data: s.data,
      valor: s.valor,
      descricao: s.descricao || null,
      nome_destino: s.nome_destino ? String(s.nome_destino).slice(0, 160) : null,
      txid: s.txid ? String(s.txid).slice(0, 35) : null,
    }));
    const inseridas = await db('transacoes_extrato').insert(lote).onConflict('id_externo').ignore().returning('id');
    novas += inseridas.length;
  }

  const conciliadas = await conciliarPendentes();
  await db('importacoes_extrato')
    .where({ id: importacao.id })
    .update({ novas, conciliadas: conciliadas.length });

  const semCorrespondencia = await db('transacoes_extrato')
    .where({ importacao_id: importacao.id, situacao: 'sem_correspondencia' })
    .count({ n: '*' })
    .first();

  return {
    importacao_id: importacao.id,
    fonte,
    lidas: saidas.length,
    novas,
    repetidas: saidas.length - novas,
    conciliadas,
    sem_correspondencia: Number(semCorrespondencia.n),
  };
}

/** Vincula manualmente uma saída do extrato a um pagamento pendente de mesmo valor. */
async function vincular(transacaoId, pagamentoId) {
  return db.transaction(async (trx) => {
    const t = await trx('transacoes_extrato as t')
      .join('importacoes_extrato as i', 'i.id', 't.importacao_id')
      .where('t.id', transacaoId)
      .first('t.*', 'i.fonte');
    if (!t) throw new ErroHttp(404, 'Transação não encontrada.');
    if (t.situacao === 'conciliada') throw new ErroHttp(409, 'Transação já está conciliada.');
    const p = await trx('pagamentos').where({ id: pagamentoId }).first();
    if (!p) throw new ErroHttp(404, 'Pagamento não encontrado.');
    if (centavos(p.valor) !== centavos(t.valor)) {
      throw new ErroHttp(400, 'O valor da transação é diferente do valor do pagamento.');
    }
    const pago = await marcarPago(
      p.id,
      {
        pago_em: new Date(`${t.data}T12:00:00`),
        confirmacao: t.fonte === 'api' ? 'api' : 'extrato',
        comprovante: t.id_externo,
      },
      trx,
    );
    await trx('transacoes_extrato').where({ id: t.id }).update({ pagamento_id: p.id, situacao: 'conciliada' });
    return pago;
  });
}

async function alterarSituacao(transacaoId, situacao) {
  const [t] = await db('transacoes_extrato')
    .where({ id: transacaoId })
    .whereNot('situacao', 'conciliada')
    .update({ situacao })
    .returning('*');
  if (!t) throw new ErroHttp(409, 'Transação não encontrada ou já conciliada.');
  return t;
}

module.exports = { conciliarPendentes, importarSaidas, vincular, alterarSituacao };
