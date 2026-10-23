/**
 * Leitor de CSV simples, sem dependências.
 * Aceita separador ";" ou "," (detectado pela primeira linha), aspas duplas e BOM.
 * Retorna uma lista de objetos com as chaves do cabeçalho em minúsculas, sem acento.
 */
const { ascii } = require('./pix');

function detectarSeparador(primeiraLinha) {
  const pv = (primeiraLinha.match(/;/g) || []).length;
  const v = (primeiraLinha.match(/,/g) || []).length;
  const tab = (primeiraLinha.match(/\t/g) || []).length;
  if (tab > pv && tab > v) return '\t';
  return pv >= v ? ';' : ',';
}

function lerLinhas(texto, sep) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

const chaveCabecalho = (s) =>
  ascii(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function lerCsv(conteudo) {
  const texto = String(conteudo).replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0] || '';
  const sep = detectarSeparador(primeira);
  const [cabecalho, ...resto] = lerLinhas(texto, sep);
  if (!cabecalho) return [];
  const chaves = cabecalho.map(chaveCabecalho);
  return resto.map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? '').trim()])));
}

module.exports = { lerCsv, chaveCabecalho };
