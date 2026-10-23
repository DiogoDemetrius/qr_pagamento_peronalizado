/**
 * Conciliação: saídas do extrato do banco pagador (arquivo OFX/CSV ou API)
 * e o pagamento a que cada uma corresponde.
 */
exports.up = (knex) =>
  knex.raw(`
    create table importacoes_extrato (
      id             serial primary key,
      fonte          varchar(3) not null check (fonte in ('ofx', 'csv', 'api')),
      arquivo        varchar(255),
      periodo_inicio date,
      periodo_fim    date,
      total          integer not null default 0,  -- saídas lidas
      novas          integer not null default 0,  -- saídas que ainda não existiam
      conciliadas    integer not null default 0,
      created_at     timestamptz not null default now()
    );

    create table transacoes_extrato (
      id            serial primary key,
      importacao_id integer not null references importacoes_extrato (id) on delete cascade,
      id_externo    varchar(160) not null unique, -- FITID, id da transação ou hash do lançamento
      data          date not null,
      valor         numeric(12, 2) not null check (valor > 0), -- valor da saída
      descricao     text,
      nome_destino  varchar(160),
      txid          varchar(35),
      pagamento_id  integer references pagamentos (id) on delete set null,
      situacao      varchar(19) not null default 'sem_correspondencia'
                    check (situacao in ('conciliada', 'sem_correspondencia', 'ignorada')),
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now()
    );

    create index transacoes_extrato_situacao_idx on transacoes_extrato (situacao);
    create index transacoes_extrato_data_idx on transacoes_extrato (data);
    create unique index transacoes_extrato_pagamento_idx
      on transacoes_extrato (pagamento_id) where pagamento_id is not null;

    create trigger transacoes_extrato_updated_at
      before update on transacoes_extrato
      for each row execute function atualiza_updated_at();
  `);

exports.down = (knex) =>
  knex.raw(`
    drop table if exists transacoes_extrato;
    drop table if exists importacoes_extrato;
  `);
