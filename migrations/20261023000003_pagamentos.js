/**
 * Cada Pix gerado (QR Code) e o seu ciclo: pendente -> pago | cancelado.
 *
 * Nome, chave e cidade ficam gravados como estavam no momento da geração,
 * para o histórico não mudar se o cadastro do funcionário for alterado depois.
 */
exports.up = (knex) =>
  knex.raw(`
    create table pagamentos (
      id             serial primary key,
      funcionario_id integer not null references funcionarios (id) on delete restrict,
      comissao_id    integer references comissoes (id) on delete set null,
      competencia    char(7) not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      valor          numeric(12, 2) not null check (valor > 0),
      nome_recebedor varchar(25) not null,
      chave_pix      varchar(77) not null,
      cidade         varchar(15) not null,
      txid           varchar(25) not null unique,
      payload        text not null,                -- BR Code (Pix copia e cola)
      status         varchar(9) not null default 'pendente'
                     check (status in ('pendente', 'pago', 'cancelado')),
      pago_em        timestamptz,
      confirmacao    varchar(7) check (confirmacao in ('manual', 'extrato', 'api')),
      comprovante    varchar(255),                 -- id da transação no banco, end-to-end etc.
      observacao     text,
      created_at     timestamptz not null default now(),
      updated_at     timestamptz not null default now(),
      constraint pagamentos_pago_tem_data
        check (status <> 'pago' or (pago_em is not null and confirmacao is not null))
    );

    create index pagamentos_status_idx on pagamentos (status);
    create index pagamentos_competencia_idx on pagamentos (competencia);
    create index pagamentos_funcionario_idx on pagamentos (funcionario_id);

    -- No máximo um pagamento ativo (não cancelado) por funcionário em cada competência
    create unique index pagamentos_funcionario_competencia_ativo
      on pagamentos (funcionario_id, competencia)
      where status <> 'cancelado';

    create trigger pagamentos_updated_at
      before update on pagamentos
      for each row execute function atualiza_updated_at();
  `);

exports.down = (knex) => knex.raw('drop table if exists pagamentos;');
