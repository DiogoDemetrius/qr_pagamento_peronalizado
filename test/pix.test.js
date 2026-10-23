const test = require('node:test');
const assert = require('node:assert');
const { crc16, montarPayload, normalizarChave, validarChave, gerarTxid } = require('../src/lib/pix');

test('CRC16 bate com o exemplo do manual do Banco Central', () => {
  const p =
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.strictEqual(crc16(p), '1D3D');
});

test('payload com valor, nome e cidade sem acento', () => {
  const { payload, nome, cidade } = montarPayload({
    chave: '+5511999999999',
    valor: 1250.5,
    nome: 'José da Conceição',
    cidade: 'São Paulo',
    txid: 'C202610F1ABCD1234',
  });
  assert.ok(payload.includes('54071250.50'));
  assert.strictEqual(nome, 'JOSE DA CONCEICAO');
  assert.strictEqual(cidade, 'SAO PAULO');
  assert.ok(payload.includes('0517C202610F1ABCD1234'));
  const semCrc = payload.slice(0, -4);
  assert.strictEqual(payload.slice(-4), crc16(semCrc));
});

test('descrição entra no campo 26 sem passar de 99 caracteres', () => {
  const { payload } = montarPayload({
    chave: 'alguem@exemplo.com',
    valor: 10,
    nome: 'Teste',
    cidade: 'Rio',
    descricao: 'Comissao 2026-10',
  });
  const tamanho26 = Number(payload.slice(payload.indexOf('26') + 2, payload.indexOf('26') + 4));
  assert.ok(tamanho26 <= 99);
  assert.ok(payload.includes('0216Comissao 2026-10'));
});

test('normaliza e valida chaves', () => {
  assert.strictEqual(normalizarChave('cpf', '111.444.777-35'), '11144477735');
  assert.strictEqual(normalizarChave('telefone', '(11) 98765-4321'), '+5511987654321');
  assert.strictEqual(normalizarChave('telefone', '+55 11 98765-4321'), '+5511987654321');
  assert.strictEqual(normalizarChave('email', 'Fulano@Exemplo.COM'), 'fulano@exemplo.com');
  assert.strictEqual(validarChave('cpf', '11144477735'), null);
  assert.ok(validarChave('cpf', '123'));
  assert.ok(validarChave('telefone', '+551199'));
  assert.strictEqual(validarChave('aleatoria', '123e4567-e12b-12d1-a456-426655440000'), null);
});

test('txid tem no máximo 25 caracteres alfanuméricos', () => {
  const t = gerarTxid('2026-10', 123456);
  assert.match(t, /^[A-Z0-9]{1,25}$/);
});
