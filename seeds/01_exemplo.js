/**
 * Dados de exemplo para testar as telas. Rode só em ambiente de teste:
 *   npm run seed
 * Apaga e recria funcionários, comissões, pagamentos e extratos.
 */
exports.seed = async function (knex) {
  await knex('transacoes_extrato').del();
  await knex('importacoes_extrato').del();
  await knex('pagamentos').del();
  await knex('comissoes').del();
  await knex('funcionarios').del();

  const funcionarios = await knex('funcionarios')
    .insert([
      { nome: 'Ana Souza (exemplo)', documento: '11144477735', tipo_chave: 'cpf', chave_pix: '11144477735', cidade: 'Sao Paulo', modo_comissao: 'fixa', valor_fixo: 850 },
      { nome: 'Bruno Lima (exemplo)', email: 'bruno@exemplo.com', tipo_chave: 'email', chave_pix: 'bruno@exemplo.com', cidade: 'Campinas', modo_comissao: 'variavel', ref_externa: 'VEND-02' },
      { nome: 'Carla Dias (exemplo)', tipo_chave: 'telefone', chave_pix: '+5511987654321', cidade: 'Santos', modo_comissao: 'variavel', ref_externa: 'VEND-03' },
      { nome: 'Diego Alves (exemplo)', tipo_chave: 'aleatoria', chave_pix: '123e4567-e12b-12d1-a456-426655440000', cidade: 'Sao Paulo', modo_comissao: 'fixa', valor_fixo: 1200 },
    ])
    .returning(['id', 'ref_externa']);

  const competencia = new Date().toISOString().slice(0, 7);
  const bruno = funcionarios.find((f) => f.ref_externa === 'VEND-02');
  await knex('comissoes').insert([
    { funcionario_id: bruno.id, competencia, valor: 1534.9, origem: 'manual', referencia: 'exemplo' },
  ]);
};
