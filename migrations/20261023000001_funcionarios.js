/**
 * Funcionários que recebem comissão por Pix.
 *
 * modo_comissao:
 *   - fixa:     usa valor_fixo, digitado no cadastro
 *   - variavel: usa o valor lançado em "comissoes" para a competência
 *               (manual, planilha, webhook ou outro banco de dados)
 */
exports.up = (knex) =>
  knex.raw(`
    create or replace function atualiza_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;

    create table funcionarios (
      id            serial primary key,
      nome          varchar(120) not null,
      documento     varchar(14) unique,            -- CPF ou CNPJ, só números
      email         varchar(160),
      tipo_chave    varchar(10) not null
                    check (tipo_chave in ('email', 'cpf', 'cnpj', 'telefone', 'aleatoria')),
      chave_pix     varchar(77) not null,
      cidade        varchar(60),
      modo_comissao varchar(8) not null default 'fixa'
                    check (modo_comissao in ('fixa', 'variavel')),
      valor_fixo    numeric(12, 2) check (valor_fixo is null or valor_fixo > 0),
      ref_externa   varchar(64) unique,            -- id do funcionário em outro sistema
      ativo         boolean not null default true,
      observacao    text,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now(),
      constraint funcionarios_fixa_tem_valor
        check (modo_comissao <> 'fixa' or valor_fixo is not null)
    );

    create index funcionarios_ativo_idx on funcionarios (ativo);

    create trigger funcionarios_updated_at
      before update on funcionarios
      for each row execute function atualiza_updated_at();
  `);

exports.down = (knex) =>
  knex.raw(`
    drop table if exists funcionarios;
    drop function if exists atualiza_updated_at();
  `);
