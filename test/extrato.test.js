const test = require('node:test');
const assert = require('node:assert');
const { lerExtrato } = require('../src/lib/extrato');
const { lerCsv } = require('../src/lib/csv');
const { paraNumero } = require('../src/lib/util');

test('converte valores no formato brasileiro', () => {
  assert.strictEqual(paraNumero('1.234,56'), 1234.56);
  assert.strictEqual(paraNumero('R$ 850,00'), 850);
  assert.strictEqual(paraNumero('-12,30'), -12.3);
  assert.strictEqual(paraNumero('1234.5'), 1234.5);
  assert.strictEqual(paraNumero('abc'), null);
});

test('lê CSV com ponto e vírgula, aspas e acentos no cabeçalho', () => {
  const linhas = lerCsv('﻿Documento;Comissão\n"111.444.777-35";"1.500,00"\n');
  assert.deepStrictEqual(linhas, [{ documento: '111.444.777-35', comissao: '1.500,00' }]);
});

test('lê OFX e mantém só as saídas', () => {
  const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261020120000[-3:BRT]<TRNAMT>-850.00<FITID>abc1<NAME>PIX ENVIADO<MEMO>Ana Souza
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261020<TRNAMT>300.00<FITID>abc2<MEMO>PIX RECEBIDO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const { fonte, saidas } = lerExtrato('extrato.ofx', ofx);
  assert.strictEqual(fonte, 'ofx');
  assert.strictEqual(saidas.length, 1);
  assert.deepStrictEqual(
    { id: saidas[0].id_externo, data: saidas[0].data, valor: saidas[0].valor },
    { id: 'ofx:abc1', data: '2026-10-20', valor: 850 },
  );
  assert.match(saidas[0].descricao, /Ana Souza/);
});

test('lê extrato CSV com valores negativos e encontra o txid', () => {
  const csv = [
    'Data;Descrição;Valor',
    '20/10/2026;PIX ENVIADO Bruno Lima C202610F2A1B2C3D4;-1.534,90',
    '20/10/2026;PIX RECEBIDO Cliente;2.000,00',
  ].join('\n');
  const { fonte, saidas } = lerExtrato('extrato.csv', csv);
  assert.strictEqual(fonte, 'csv');
  assert.strictEqual(saidas.length, 1);
  assert.strictEqual(saidas[0].valor, 1534.9);
  assert.strictEqual(saidas[0].txid, 'C202610F2A1B2C3D4');
});

test('lê extrato CSV com coluna de tipo D/C', () => {
  const csv = 'data,historico,valor,tipo\n2026-10-21,Pix Carla Dias,300.00,D\n2026-10-21,Estorno,10.00,C\n';
  const { saidas } = lerExtrato('x.csv', csv);
  assert.strictEqual(saidas.length, 1);
  assert.strictEqual(saidas[0].valor, 300);
});

test('ids gerados por hash não colidem para lançamentos iguais', () => {
  const csv = 'data;descricao;valor\n20/10/2026;PIX;-10,00\n20/10/2026;PIX;-10,00\n';
  const { saidas } = lerExtrato('x.csv', csv);
  assert.strictEqual(saidas.length, 2);
  assert.notStrictEqual(saidas[0].id_externo, saidas[1].id_externo);
});
