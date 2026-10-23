const test = require('node:test');
const assert = require('node:assert');
const { converter } = require('../src/services/bancoInter');

test('converte uma transação Pix do extrato completo da API', () => {
  const s = converter({
    idTransacao: 'abc-123',
    dataTransacao: '2026-10-20',
    tipoTransacao: 'PIX',
    tipoOperacao: 'D',
    valor: '850.00',
    titulo: 'Pix enviado',
    descricao: 'PIX ENVIADO - Ana Souza',
    detalhes: { nomeRecebedor: 'Ana Souza', chavePixRecebedor: '11144477735', txId: 'C202610F1AAAAAAAA' },
  });
  assert.deepStrictEqual(
    { id: s.id_externo, data: s.data, valor: s.valor, nome: s.nome_destino, txid: s.txid },
    { id: 'inter:abc-123', data: '2026-10-20', valor: 850, nome: 'Ana Souza', txid: 'C202610F1AAAAAAAA' },
  );
});

test('usa dataEntrada e gera id quando a API não manda idTransacao', () => {
  const s = converter({ dataEntrada: '2026-10-21', valor: '-300.00', descricao: 'PIX ENVIADO' });
  assert.strictEqual(s.valor, 300);
  assert.strictEqual(s.data, '2026-10-21');
  assert.match(s.id_externo, /^inter:h:/);
});
