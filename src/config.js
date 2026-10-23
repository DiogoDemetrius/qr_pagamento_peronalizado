require('dotenv').config();

const env = process.env;

module.exports = {
  porta: Number(env.PORT) || 3000,
  databaseUrl: env.DATABASE_URL,

  auth: {
    usuario: env.ADMIN_USER,
    senha: env.ADMIN_PASSWORD,
    desativada: env.AUTH_DISABLED === 'true',
  },

  pix: {
    cidadePadrao: env.PIX_CIDADE_PADRAO || 'BRASIL',
    descricao: env.PIX_DESCRICAO || '',
  },

  diasAlertaPendente: Number(env.DIAS_ALERTA_PENDENTE) || 3,

  webhookToken: env.WEBHOOK_TOKEN || '',

  bancoExterno: {
    client: env.EXTERNAL_DB_CLIENT || 'pg',
    url: env.EXTERNAL_DB_URL || '',
    consulta: env.EXTERNAL_DB_QUERY || '',
  },

  inter: {
    clientId: env.INTER_CLIENT_ID || '',
    clientSecret: env.INTER_CLIENT_SECRET || '',
    certPath: env.INTER_CERT_PATH || '',
    keyPath: env.INTER_KEY_PATH || '',
    contaCorrente: env.INTER_CONTA_CORRENTE || '',
    baseUrl: (env.INTER_BASE_URL || 'https://cdpj.partners.bancointer.com.br').replace(/\/$/, ''),
  },
};
