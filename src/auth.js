const crypto = require('crypto');
const config = require('./config');

const igual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Acesso ao painel e à API interna por HTTP Basic. */
function exigirLogin(req, res, next) {
  if (config.auth.desativada) return next();
  const [tipo, valor] = String(req.headers.authorization || '').split(' ');
  if (tipo === 'Basic' && valor) {
    const [usuario, ...resto] = Buffer.from(valor, 'base64').toString().split(':');
    if (igual(usuario, config.auth.usuario) && igual(resto.join(':'), config.auth.senha)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Comissoes Pix", charset="UTF-8"');
  res.status(401).send('Acesso restrito.');
}

/** Rotas de webhook: token no header X-Api-Key (ou Authorization: Bearer). */
function exigirToken(req, res, next) {
  if (!config.webhookToken) {
    return res.status(503).json({ erro: 'Webhook desativado. Defina WEBHOOK_TOKEN no .env.' });
  }
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.headers['x-api-key'] || bearer;
  if (token && igual(token, config.webhookToken)) return next();
  res.status(401).json({ erro: 'Token inválido.' });
}

module.exports = { exigirLogin, exigirToken };
