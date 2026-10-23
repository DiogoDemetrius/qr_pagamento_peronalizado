/**
 * Leitura de extratos bancários (OFX e CSV) para conciliação.
 * Devolve só as SAÍDAS, no formato:
 *   { id_externo, data: 'aaaa-mm-dd', valor: number (positivo), descricao, nome_destino, txid }
 */
const crypto = require('crypto');
const { lerCsv } = require('./csv');
const { paraNumero, paraData } = require('./util');

const hash = (...partes) =>
  'h:' + crypto.createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 32);

/** Procura um txid gerado por este sistema (ex.: C202610F12AB12CD34) dentro de um texto. */
function extrairTxid(texto) {
  const m = String(texto || '').toUpperCase().match(/\bC\d{6}F\d+[0-9A-F]{8}\b/);
  return m ? m[0].slice(0, 25) : null;
}

function lerOfx(conteudo) {
  const texto = String(conteudo);
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const contagem = new Map();
  const saidas = [];
  for (const bruto of blocos) {
    const bloco = bruto.split(/<\/STMTTRN>/i)[0];
    const valor = paraNumero(tag(bloco, 'TRNAMT'));
    const tipo = tag(bloco, 'TRNTYPE').toUpperCase();
    if (valor == null || valor === 0) continue;
    if (valor > 0 && tipo !== 'DEBIT' && tipo !== 'PAYMENT') continue;
    const data = paraData(tag(bloco, 'DTPOSTED'));
    if (!data) continue;
    const nome = tag(bloco, 'NAME');
    const memo = tag(bloco, 'MEMO');
    const descricao = [nome, memo].filter(Boolean).join(' - ');
    let id = tag(bloco, 'FITID');
    if (!id) {
      const base = hash(data, valor, descricao);
      const n = (contagem.get(base) || 0) + 1;
      contagem.set(base, n);
      id = `${base}:${n}`;
    }
    saidas.push({
      id_externo: `ofx:${id}`,
      data,
      valor: Math.abs(valor),
      descricao,
      nome_destino: nome || null,
      txid: extrairTxid(descricao),
    });
  }
  return saidas;
}

const pegar = (linha, nomes) => {
  for (const n of nomes) if (linha[n] != null && linha[n] !== '') return linha[n];
  return '';
};

function lerExtratoCsv(conteudo) {
  const linhas = lerCsv(conteudo);
  const temTipo = linhas.some((l) => pegar(l, ['tipo', 'tipo_operacao', 'natureza', 'd_c', 'dc']));
  const temNegativo = linhas.some((l) => (paraNumero(pegar(l, ['valor', 'amount', 'valor_r'])) || 0) < 0);
  const contagem = new Map();
  const saidas = [];

  for (const l of linhas) {
    const valor = paraNumero(pegar(l, ['valor', 'amount', 'valor_r']));
    const data = paraData(pegar(l, ['data', 'data_lancamento', 'data_movimento', 'date', 'data_entrada']));
    if (valor == null || valor === 0 || !data) continue;

    const tipo = pegar(l, ['tipo', 'tipo_operacao', 'natureza', 'd_c', 'dc']).toUpperCase();
    let saida;
    if (temTipo && tipo) saida = tipo.startsWith('D') || tipo.includes('SAIDA') || tipo.includes('DEBITO');
    else if (temNegativo) saida = valor < 0;
    else saida = true; // arquivo sem sinal nem tipo: considera tudo saída
    if (!saida) continue;

    const nome = pegar(l, ['nome', 'favorecido', 'destinatario', 'recebedor', 'beneficiario']);
    const descricao = [pegar(l, ['descricao', 'historico', 'description', 'titulo', 'lancamento', 'memo']), nome]
      .filter(Boolean)
      .join(' - ');
    let id = pegar(l, ['id', 'identificador', 'id_transacao', 'documento', 'codigo', 'fitid']);
    if (!id) {
      const base = hash(data, valor, descricao);
      const n = (contagem.get(base) || 0) + 1;
      contagem.set(base, n);
      id = `${base}:${n}`;
    }
    saidas.push({
      id_externo: `csv:${id}`,
      data,
      valor: Math.abs(valor),
      descricao,
      nome_destino: nome || null,
      txid: extrairTxid(descricao) || extrairTxid(pegar(l, ['txid', 'identificador'])),
    });
  }
  return saidas;
}

function lerExtrato(nomeArquivo, conteudo) {
  const texto = String(conteudo);
  const ehOfx = /\.ofx$/i.test(nomeArquivo || '') || /<OFX>|OFXHEADER/i.test(texto.slice(0, 2000));
  return ehOfx
    ? { fonte: 'ofx', saidas: lerOfx(texto) }
    : { fonte: 'csv', saidas: lerExtratoCsv(texto) };
}

module.exports = { lerExtrato, lerOfx, lerExtratoCsv, extrairTxid };
