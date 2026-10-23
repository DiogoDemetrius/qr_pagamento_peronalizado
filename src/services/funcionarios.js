const db = require('../db');
const { normalizarChave, validarChave, TIPOS_CHAVE } = require('../lib/pix');
const { ErroHttp, paraNumero } = require('../lib/util');

const CAMPOS = [
  'id', 'nome', 'documento', 'email', 'tipo_chave', 'chave_pix', 'cidade',
  'modo_comissao', 'valor_fixo', 'ref_externa', 'ativo', 'observacao', 'created_at', 'updated_at',
];

const vazioParaNull = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
};

/** Valida e normaliza os dados vindos do formulário. Lança ErroHttp 400 com a lista de problemas. */
function validar(dados) {
  const erros = {};
  const f = {};

  f.nome = vazioParaNull(dados.nome);
  if (!f.nome) erros.nome = 'Informe o nome.';
  else if (f.nome.length > 120) erros.nome = 'Nome com no máximo 120 caracteres.';

  f.documento = vazioParaNull(dados.documento);
  if (f.documento) {
    f.documento = f.documento.replace(/\D/g, '');
    if (![11, 14].includes(f.documento.length)) erros.documento = 'CPF com 11 dígitos ou CNPJ com 14.';
  }

  f.email = vazioParaNull(dados.email);
  if (f.email) {
    f.email = f.email.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) erros.email = 'E-mail inválido.';
  }

  f.tipo_chave = dados.tipo_chave;
  if (!TIPOS_CHAVE.includes(f.tipo_chave)) erros.tipo_chave = 'Escolha o tipo de chave.';
  else {
    f.chave_pix = normalizarChave(f.tipo_chave, dados.chave_pix);
    const erroChave = validarChave(f.tipo_chave, f.chave_pix);
    if (erroChave) erros.chave_pix = erroChave;
  }

  f.cidade = vazioParaNull(dados.cidade);
  if (f.cidade && f.cidade.length > 60) erros.cidade = 'Cidade com no máximo 60 caracteres.';

  f.modo_comissao = dados.modo_comissao === 'variavel' ? 'variavel' : 'fixa';
  const valor = paraNumero(dados.valor_fixo);
  f.valor_fixo = valor && valor > 0 ? Math.round(valor * 100) / 100 : null;
  if (f.modo_comissao === 'fixa' && !f.valor_fixo) erros.valor_fixo = 'Informe o valor da comissão fixa.';

  f.ref_externa = vazioParaNull(dados.ref_externa);
  f.ativo = dados.ativo === undefined ? true : dados.ativo === true || dados.ativo === 'true';
  f.observacao = vazioParaNull(dados.observacao);

  if (Object.keys(erros).length) throw new ErroHttp(400, 'Confira os campos do funcionário.', erros);
  return f;
}

/**
 * Identifica funcionários a partir de linhas importadas (planilha, webhook, outro banco).
 * Cada linha pode trazer funcionario_id, documento (ou cpf/cnpj), ref_externa (ou referencia) ou email,
 * além de valor (ou comissao).
 */
async function resolverLinhas(linhas) {
  const todos = await db('funcionarios').select('id', 'nome', 'documento', 'ref_externa', 'email', 'ativo', 'modo_comissao');
  const porId = new Map(todos.map((f) => [String(f.id), f]));
  const porDoc = new Map(todos.filter((f) => f.documento).map((f) => [f.documento, f]));
  const porRef = new Map(todos.filter((f) => f.ref_externa).map((f) => [String(f.ref_externa).toLowerCase(), f]));
  const porEmail = new Map(todos.filter((f) => f.email).map((f) => [f.email.toLowerCase(), f]));

  const resolvidos = [];
  const erros = [];
  const avisos = [];

  linhas.forEach((l, i) => {
    const n = i + 1;
    const id = vazioParaNull(l.funcionario_id ?? l.id);
    const doc = vazioParaNull(l.documento ?? l.cpf ?? l.cnpj ?? l.cpf_cnpj);
    const ref = vazioParaNull(l.ref_externa ?? l.referencia ?? l.ref ?? l.codigo);
    const email = vazioParaNull(l.email);

    const f =
      (id && porId.get(String(id))) ||
      (doc && porDoc.get(String(doc).replace(/\D/g, ''))) ||
      (ref && porRef.get(String(ref).toLowerCase())) ||
      (email && porEmail.get(String(email).toLowerCase()));

    if (!f) {
      erros.push({ linha: n, motivo: `Funcionário não encontrado (${id || doc || ref || email || 'sem identificador'}).` });
      return;
    }
    const valor = paraNumero(l.valor ?? l.comissao ?? l.valor_comissao);
    if (!(valor > 0)) {
      erros.push({ linha: n, motivo: `Valor inválido para ${f.nome}.` });
      return;
    }
    if (!f.ativo) avisos.push({ linha: n, motivo: `${f.nome} está inativo.` });
    if (f.modo_comissao === 'fixa') {
      avisos.push({ linha: n, motivo: `${f.nome} tem comissão fixa; o valor importado só vale se mudar o cadastro para variável.` });
    }
    resolvidos.push({ funcionario_id: f.id, nome: f.nome, valor: Math.round(valor * 100) / 100, linha: n });
  });

  return { resolvidos, erros, avisos };
}

module.exports = { CAMPOS, validar, resolverLinhas };
