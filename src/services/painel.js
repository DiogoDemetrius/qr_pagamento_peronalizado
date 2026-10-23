/**
 * Números do painel de monitoramento. As consultas ficam em SQL puro
 * (parâmetros posicionais "?") para serem fáceis de revisar e testar no psql.
 */
const db = require('../db');
const config = require('../config');
const { validarCompetencia } = require('../lib/util');

const SQL = {
  resumo: `
    select status, count(*)::int as qtd, coalesce(sum(valor), 0) as valor
    from pagamentos
    where competencia = ?
    group by status`,

  semPagamento: `
    select f.id, f.nome, f.modo_comissao, f.valor_fixo, c.valor as comissao
    from funcionarios f
    left join comissoes c on c.funcionario_id = f.id and c.competencia = ?
    where f.ativo
      and not exists (
        select 1 from pagamentos p
        where p.funcionario_id = f.id and p.competencia = ? and p.status <> 'cancelado'
      )
    order by f.nome`,

  atrasados: `
    select p.id, p.competencia, p.valor, p.nome_recebedor, p.created_at,
           (current_date - p.created_at::date) as dias
    from pagamentos p
    where p.status = 'pendente'
      and p.created_at < now() - make_interval(days => ?)
    order by p.created_at
    limit 20`,

  extratoAberto: `
    select t.id, t.data, t.valor, t.descricao, t.nome_destino
    from transacoes_extrato t
    where t.situacao = 'sem_correspondencia'
    order by t.data desc, t.id desc
    limit 10`,

  extratoAbertoTotal: `
    select count(*)::int as qtd, coalesce(sum(valor), 0) as valor
    from transacoes_extrato
    where situacao = 'sem_correspondencia'`,

  pagosPorDia: `
    select to_char(d, 'YYYY-MM-DD') as dia,
           coalesce(sum(p.valor), 0) as valor,
           count(p.id)::int as qtd
    from generate_series(current_date - 29, current_date, interval '1 day') as d
    left join pagamentos p on p.status = 'pago' and p.pago_em::date = d::date
    group by d
    order by d`,

  porCompetencia: `
    select competencia,
           coalesce(sum(valor) filter (where status <> 'cancelado'), 0) as previsto,
           coalesce(sum(valor) filter (where status = 'pago'), 0) as pago,
           count(*) filter (where status = 'pendente')::int as pendentes
    from pagamentos
    where competencia >= ?
    group by competencia
    order by competencia`,

  ultimosPagos: `
    select p.id, p.nome_recebedor, p.valor, p.pago_em, p.confirmacao, p.competencia
    from pagamentos p
    where p.status = 'pago'
    order by p.pago_em desc
    limit 8`,

  funcionariosAtivos: `select count(*)::int as qtd from funcionarios where ativo`,
};

function competenciaMenos(competencia, meses) {
  const [a, m] = competencia.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - meses, 1));
  return d.toISOString().slice(0, 7);
}

async function montar(competencia) {
  validarCompetencia(competencia);
  const q = (sql, params = []) => db.raw(sql, params).then((r) => r.rows);

  const [resumo, semPagamento, atrasados, extratoAberto, [extratoTotal], pagosPorDia, porCompetencia, ultimosPagos, [ativos]] =
    await Promise.all([
      q(SQL.resumo, [competencia]),
      q(SQL.semPagamento, [competencia, competencia]),
      q(SQL.atrasados, [config.diasAlertaPendente]),
      q(SQL.extratoAberto),
      q(SQL.extratoAbertoTotal),
      q(SQL.pagosPorDia),
      q(SQL.porCompetencia, [competenciaMenos(competencia, 5)]),
      q(SQL.ultimosPagos),
      q(SQL.funcionariosAtivos),
    ]);

  const porStatus = Object.fromEntries(['pendente', 'pago', 'cancelado'].map((s) => [s, { qtd: 0, valor: 0 }]));
  for (const r of resumo) porStatus[r.status] = { qtd: r.qtd, valor: Number(r.valor) };

  const prontos = [];
  const semValor = [];
  for (const f of semPagamento) {
    const valor = f.modo_comissao === 'fixa' ? f.valor_fixo : f.comissao;
    if (valor > 0) prontos.push({ id: f.id, nome: f.nome, valor: Number(valor) });
    else semValor.push({ id: f.id, nome: f.nome, motivo: 'Sem comissão lançada' });
  }

  const previsto = porStatus.pendente.valor + porStatus.pago.valor;
  return {
    competencia,
    funcionarios_ativos: ativos.qtd,
    resumo: {
      ...porStatus,
      previsto,
      percentual_pago: previsto ? porStatus.pago.valor / previsto : 0,
    },
    pendencias: {
      prontos_para_gerar: prontos,
      sem_valor: semValor,
      atrasados: atrasados.map((a) => ({ ...a, valor: Number(a.valor) })),
      dias_alerta: config.diasAlertaPendente,
      extrato_sem_correspondencia: { ...extratoTotal, valor: Number(extratoTotal.valor), itens: extratoAberto },
    },
    pagos_por_dia: pagosPorDia.map((d) => ({ ...d, valor: Number(d.valor) })),
    por_competencia: porCompetencia.map((c) => ({ ...c, previsto: Number(c.previsto), pago: Number(c.pago) })),
    ultimos_pagos: ultimosPagos,
  };
}

module.exports = { SQL, montar, competenciaMenos };
