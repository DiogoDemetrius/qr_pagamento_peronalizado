/**
 * Leitura de comissões em outro banco de dados (Postgres ou MySQL), configurado no .env.
 * A consulta recebe o parâmetro :competencia (AAAA-MM) e deve devolver a coluna "valor"
 * e uma coluna que identifique o funcionário: funcionario_id, documento, ref_externa ou email.
 * Use um usuário somente leitura nesse banco.
 */
const knex = require('knex');
const config = require('../config');
const { ErroHttp } = require('../lib/util');

let conexao = null;

const configurada = () => Boolean(config.bancoExterno.url && config.bancoExterno.consulta);

function obterConexao() {
  if (!configurada()) {
    throw new ErroHttp(400, 'Banco externo não configurado. Defina EXTERNAL_DB_URL e EXTERNAL_DB_QUERY no .env.');
  }
  if (!conexao) {
    conexao = knex({
      client: config.bancoExterno.client,
      connection: config.bancoExterno.url,
      pool: { min: 0, max: 2 },
    });
  }
  return conexao;
}

async function buscarComissoes(competencia) {
  const banco = obterConexao();
  const resultado = await banco.raw(config.bancoExterno.consulta, { competencia });
  // pg devolve { rows }, mysql2 devolve [rows, fields]
  const linhas = Array.isArray(resultado) ? resultado[0] : resultado.rows;
  return (linhas || []).map((l) =>
    Object.fromEntries(Object.entries(l).map(([k, v]) => [k.toLowerCase(), v])),
  );
}

module.exports = { configurada, buscarComissoes };
