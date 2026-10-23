/**
 * Lê planilhas de comissão em CSV ou Excel (.xlsx) e devolve linhas como objetos,
 * com o cabeçalho em minúsculas e sem acento (ex.: "Comissão" -> "comissao").
 */
const ExcelJS = require('exceljs');
const { lerCsv, chaveCabecalho } = require('../lib/csv');
const { ErroHttp } = require('../lib/util');

function valorCelula(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return valorCelula(v.result); // fórmula
    if ('text' in v) return String(v.text); // hyperlink
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  }
  return v;
}

async function lerXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const aba = wb.worksheets[0];
  if (!aba) return [];
  const linhas = [];
  let cabecalho = null;
  aba.eachRow({ includeEmpty: false }, (row) => {
    const valores = row.values.slice(1).map(valorCelula);
    if (!cabecalho) {
      cabecalho = valores.map((v) => chaveCabecalho(String(v)));
      return;
    }
    linhas.push(Object.fromEntries(cabecalho.map((k, i) => [k, valores[i] ?? ''])));
  });
  return linhas;
}

async function lerPlanilha(arquivo) {
  if (!arquivo) throw new ErroHttp(400, 'Envie um arquivo CSV ou XLSX.');
  const nome = arquivo.originalname || '';
  if (/\.xlsx$/i.test(nome)) return lerXlsx(arquivo.buffer);
  if (/\.xls$/i.test(nome)) throw new ErroHttp(400, 'Formato .xls antigo não é aceito. Salve como .xlsx ou .csv.');
  return lerCsv(arquivo.buffer.toString('utf8'));
}

module.exports = { lerPlanilha };
