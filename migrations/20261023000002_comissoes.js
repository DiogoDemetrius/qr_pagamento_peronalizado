/**
 * Valores de comissão variável por competência (mês no formato AAAA-MM).
 * Um lançamento por funcionário e competência: uma nova importação substitui o valor anterior.
 */
exports.up = (knex) =>
  knex.raw(`
    create table comissoes (
      id             serial primary key,
      funcionario_id integer not null references funcionarios (id) on delete cascade,
      competencia    char(7) not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      valor          numeric(12, 2) not null check (valor > 0),
      origem         varchar(13) not null
                     check (origem in ('manual', 'planilha', 'webhook', 'banco_externo')),
      referencia     varchar(160),                 -- nome do arquivo, id da requisição etc.
      created_at     timestamptz not null default now(),
      updated_at     timestamptz not null default now(),
      unique (funcionario_id, competencia)
    );

    create index comissoes_competencia_idx on comissoes (competencia);

    create trigger comissoes_updated_at
      before update on comissoes
      for each row execute function atualiza_updated_at();
  `);

exports.down = (knex) => knex.raw('drop table if exists comissoes;');
