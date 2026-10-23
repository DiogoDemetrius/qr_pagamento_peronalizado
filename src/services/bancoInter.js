/**
 * Consulta de extrato pela API Banking do Inter Empresas (PJ), para confirmar
 * automaticamente os Pix pagos pela conta da empresa.
 *
 * Requisitos (gerados no Internet Banking PJ, em Soluções para sua empresa > Nova integração):
 *   - client_id e client_secret com o escopo extrato.read
 *   - certificado (.crt) e chave (.key) da integração, usados em mTLS
 *
 * Endpoints usados:
 *   POST {base}/oauth/v2/token                 (client_credentials, escopo extrato.read)
 *   GET  {base}/banking/v2/extrato/completo    (dataInicio, dataFim, tipoOperacao=D, tipoTransacao=PIX, pagina)
 *
 * O limite da API é de poucas chamadas por minuto; consulte períodos curtos.
 */
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const config = require('../config');
const { ErroHttp, paraNumero, paraData } = require('../lib/util');
const { extrairTxid } = require('../lib/extrato');

const cfg = config.inter;
let agente = null;
let token = null;

const configurado = () => Boolean(cfg.clientId && cfg.clientSecret && cfg.certPath && cfg.keyPath);

function obterAgente() {
  if (!configurado()) {
    throw new ErroHttp(400, 'API do banco não configurada. Defina INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PATH e INTER_KEY_PATH.');
  }
  if (!agente) {
    try {
      agente = new https.Agent({ cert: fs.readFileSync(cfg.certPath), key: fs.readFileSync(cfg.keyPath), keepAlive: true });
    } catch (e) {
      throw new ErroHttp(500, `Não foi possível ler o certificado do banco: ${e.message}`);
    }
  }
  return agente;
}

function requisitar(metodo, caminho, { headers = {}, corpo } = {}) {
  const url = new URL(cfg.baseUrl + caminho);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: metodo, agent: obterAgente(), headers, timeout: 30000 },
      (res) => {
        let dados = '';
        res.on('data', (c) => (dados += c));
        res.on('end', () => {
          let json = null;
          try {
            json = dados ? JSON.parse(dados) : null;
          } catch {
            /* resposta sem JSON */
          }
          if (res.statusCode >= 400) {
            const detalhe = json?.detail || json?.title || json?.message || dados.slice(0, 300);
            return reject(new ErroHttp(502, `Banco respondeu ${res.statusCode}: ${detalhe}`));
          }
          resolve(json);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao falar com o banco.')));
    req.on('error', (e) => reject(e instanceof ErroHttp ? e : new ErroHttp(502, `Falha ao falar com o banco: ${e.message}`)));
    if (corpo) req.write(corpo);
    req.end();
  });
}

async function obterToken() {
  if (token && token.expiraEm > Date.now() + 60000) return token.valor;
  const corpo = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'client_credentials',
    scope: 'extrato.read',
  }).toString();
  const r = await requisitar('POST', '/oauth/v2/token', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo) },
    corpo,
  });
  if (!r?.access_token) throw new ErroHttp(502, 'O banco não devolveu um token de acesso.');
  token = { valor: r.access_token, expiraEm: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
  return token.valor;
}

/** Converte uma transação da API para o formato usado na conciliação. */
function converter(t) {
  const d = t.detalhes || {};
  const valor = Math.abs(paraNumero(t.valor) || 0);
  const data = paraData(t.dataTransacao || t.dataEntrada || t.dataInclusao);
  const nome = d.nomeRecebedor || d.nomeFavorecido || d.nomeDestinatario || d.nomeEmpresa || null;
  const descricao = [t.titulo, t.descricao, nome, d.chavePixRecebedor || d.chave].filter(Boolean).join(' - ');
  const id =
    t.idTransacao ||
    d.endToEndId ||
    'h:' + crypto.createHash('sha1').update([data, valor, descricao].join('|')).digest('hex').slice(0, 32);
  return {
    id_externo: `inter:${id}`,
    data,
    valor,
    descricao,
    nome_destino: nome,
    txid: d.txId || d.txid || extrairTxid(descricao),
  };
}

/** Saídas Pix da conta entre duas datas (AAAA-MM-DD). */
async function buscarSaidasPix(dataInicio, dataFim) {
  if (!paraData(dataInicio) || !paraData(dataFim)) throw new ErroHttp(400, 'Informe data inicial e final.');
  const acesso = await obterToken();
  const headers = { Authorization: `Bearer ${acesso}` };
  if (cfg.contaCorrente) headers['x-conta-corrente'] = cfg.contaCorrente;

  const saidas = [];
  for (let pagina = 0; pagina < 50; pagina++) {
    const q = new URLSearchParams({
      dataInicio,
      dataFim,
      tipoOperacao: 'D',
      tipoTransacao: 'PIX',
      pagina: String(pagina),
      tamanhoPagina: '1000',
    });
    const r = await requisitar('GET', `/banking/v2/extrato/completo?${q}`, { headers });
    const itens = r?.transacoes || [];
    for (const t of itens) {
      if (String(t.tipoOperacao || 'D').toUpperCase() !== 'D') continue;
      const s = converter(t);
      if (s.data && s.valor > 0) saidas.push(s);
    }
    const ultima =
      r?.ultimaPagina === true ||
      (r?.totalPaginas != null && pagina + 1 >= r.totalPaginas) ||
      itens.length < 1000;
    if (ultima) break;
  }
  return saidas;
}

module.exports = { configurado, buscarSaidasPix, converter };
