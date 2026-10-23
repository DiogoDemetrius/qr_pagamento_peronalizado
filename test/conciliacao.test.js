const test = require('node:test');
const assert = require('node:assert');
const { escolherPagamento } = require('../src/lib/regrasConciliacao');

const pendentes = [
  { id: 1, valor: '850.00', txid: 'C202610F1AAAAAAAA', nome_recebedor: 'ANA SOUZA', chave_pix: '11144477735', created_at: '2026-10-19T10:00:00Z' },
  { id: 2, valor: '850.00', txid: 'C202610F2BBBBBBBB', nome_recebedor: 'BRUNO LIMA', chave_pix: 'bruno@exemplo.com', created_at: '2026-10-19T10:00:00Z' },
  { id: 3, valor: '300.00', txid: 'C202610F3CCCCCCCC', nome_recebedor: 'CARLA DIAS', chave_pix: '+5511987654321', created_at: '2026-10-19T10:00:00Z' },
];

test('concilia pelo txid', () => {
  const r = escolherPagamento({ data: '2026-10-20', valor: 850, descricao: 'PIX C202610F2BBBBBBBB' }, pendentes);
  assert.strictEqual(r.pagamento.id, 2);
  assert.strictEqual(r.motivo, 'txid');
});

test('concilia pelo nome quando o valor se repete', () => {
  const r = escolherPagamento({ data: '2026-10-20', valor: 850, descricao: 'PIX ENVIADO - Ana Souza' }, pendentes);
  assert.strictEqual(r.pagamento.id, 1);
  assert.strictEqual(r.motivo, 'nome');
});

test('concilia pela chave (CPF formatado na descrição)', () => {
  const r = escolherPagamento({ data: '2026-10-20', valor: 850, descricao: 'Pix para 111.444.777-35' }, pendentes);
  assert.strictEqual(r.pagamento.id, 1);
});

test('não concilia quando o valor se repete e não há como desempatar', () => {
  assert.strictEqual(escolherPagamento({ data: '2026-10-20', valor: 850, descricao: 'PIX ENVIADO' }, pendentes), null);
});

test('concilia pelo valor quando só há um candidato e a transação não traz nome', () => {
  const r = escolherPagamento({ data: '2026-10-20', valor: 300, descricao: 'PIX ENVIADO' }, pendentes);
  assert.strictEqual(r.pagamento.id, 3);
  assert.strictEqual(r.motivo, 'valor');
});

test('não concilia quando o nome do destino é de outra pessoa', () => {
  const r = escolherPagamento({ data: '2026-10-20', valor: 300, nome_destino: 'Fornecedor XPTO' }, pendentes);
  assert.strictEqual(r, null);
});

test('ignora pagamento gerado depois da transação', () => {
  const r = escolherPagamento({ data: '2026-10-10', valor: 300, descricao: 'Carla Dias' }, pendentes);
  assert.strictEqual(r, null);
});
