const db = require('../db');
const { resolverLinhas } = require('./funcionarios');
const { validarCompetencia } = require('../lib/util');

/**
 * Grava (ou substitui) os valores de comissão de uma competência.
 * @param {string} competencia AAAA-MM
 * @param {Array<object>} linhas linhas brutas com identificador do funcionário e valor
 * @param {'manual'|'planilha'|'webhook'|'banco_externo'} origem
 * @param {string} [referencia] nome do arquivo, id da requisição etc.
 */
async function importar(competencia, linhas, origem, referencia) {
  validarCompetencia(competencia);
  const { resolvidos, erros, avisos } = await resolverLinhas(linhas);

  // Se a mesma pessoa aparece mais de uma vez, os valores são somados
  const somados = new Map();
  for (const r of resolvidos) {
    const atual = somados.get(r.funcionario_id);
    somados.set(r.funcionario_id, {
      ...r,
      valor: Math.round(((atual?.valor || 0) + r.valor) * 100) / 100,
    });
  }

  const registros = [...somados.values()].map((r) => ({
    funcionario_id: r.funcionario_id,
    competencia,
    valor: r.valor,
    origem,
    referencia: referencia ? String(referencia).slice(0, 160) : null,
  }));

  if (registros.length) {
    await db('comissoes')
      .insert(registros)
      .onConflict(['funcionario_id', 'competencia'])
      .merge(['valor', 'origem', 'referencia']);

    const comPagamento = await db('pagamentos')
      .join('funcionarios', 'funcionarios.id', 'pagamentos.funcionario_id')
      .whereIn('pagamentos.funcionario_id', registros.map((r) => r.funcionario_id))
      .andWhere('pagamentos.competencia', competencia)
      .andWhereNot('pagamentos.status', 'cancelado')
      .select('funcionarios.nome', 'pagamentos.status');
    for (const p of comPagamento) {
      avisos.push({
        motivo:
          p.status === 'pago'
            ? `${p.nome} já foi pago nesta competência; o novo valor não altera o pagamento.`
            : `${p.nome} já tem QR gerado; cancele e gere de novo para usar o novo valor.`,
      });
    }
  }

  return {
    competencia,
    gravadas: registros.length,
    total: registros.reduce((s, r) => s + r.valor, 0),
    erros,
    avisos,
  };
}

module.exports = { importar };
