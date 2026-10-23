const { ascii } = require('./pix');

class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function competenciaAtual(data = new Date()) {
  return data.toISOString().slice(0, 7);
}

function validarCompetencia(c) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(c || ''))) {
    throw new ErroHttp(400, 'Competência deve estar no formato AAAA-MM, ex.: 2026-10.');
  }
  return c;
}

/**
 * Converte valores escritos de várias formas para número:
 * "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "-12,30", 1234.56
 */
function paraNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (!s) return null;
  const negativo = /^-|-$|^\(.*\)$/.test(s);
  s = s.replace(/[()\-+]/g, '');
  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

const centavos = (v) => Math.round(Number(v) * 100);

/** Data em dd/mm/aaaa, aaaa-mm-dd ou aaaammdd -> 'aaaa-mm-dd' */
function paraData(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Texto em maiúsculas, sem acento, só letras/números/espaço. Para comparar nomes. */
function textoComparavel(s) {
  return ascii(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function paginacao(query, padrao = 50, maximo = 500) {
  const limite = Math.min(Math.max(parseInt(query.limite, 10) || padrao, 1), maximo);
  const pagina = Math.max(parseInt(query.pagina, 10) || 1, 1);
  return { limite, offset: (pagina - 1) * limite, pagina };
}

module.exports = {
  ErroHttp,
  rota,
  competenciaAtual,
  validarCompetencia,
  paraNumero,
  centavos,
  paraData,
  textoComparavel,
  paginacao,
};
