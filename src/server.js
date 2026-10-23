const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { exigirLogin, exigirToken } = require('./auth');
const { rota, competenciaAtual } = require('./lib/util');
const painel = require('./services/painel');
const fonteExterna = require('./services/fonteExterna');
const bancoInter = require('./services/bancoInter');

if (!config.databaseUrl) {
  console.error('Defina DATABASE_URL no arquivo .env (veja .env.example).');
  process.exit(1);
}
if (!config.auth.desativada && (!config.auth.usuario || !config.auth.senha)) {
  console.error('Defina ADMIN_USER e ADMIN_PASSWORD no .env (ou AUTH_DISABLED=true só em desenvolvimento).');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/health', rota(async (req, res) => {
  await db.raw('select 1');
  res.json({ ok: true });
}));

// Webhook usa token próprio, fora do login do painel
app.use('/api/webhooks', exigirToken, require('./routes/webhooks'));

app.use(exigirLogin);

app.get('/api/config', (req, res) => {
  res.json({
    competencia_atual: competenciaAtual(),
    webhook_ativo: Boolean(config.webhookToken),
    banco_externo_configurado: fonteExterna.configurada(),
    api_banco_configurada: bancoInter.configurado(),
    dias_alerta_pendente: config.diasAlertaPendente,
  });
});

app.get('/api/painel', rota(async (req, res) => {
  res.json(await painel.montar(req.query.competencia || competenciaAtual()));
}));

app.use('/api/funcionarios', require('./routes/funcionarios'));
app.use('/api/comissoes', require('./routes/comissoes'));
app.use('/api/pagamentos', require('./routes/pagamentos'));
app.use('/api/conciliacao', require('./routes/conciliacao'));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Mensagens de erro em português, inclusive para restrições do banco
const MENSAGENS_UNICAS = {
  funcionarios_documento_key: 'Já existe um funcionário com este CPF/CNPJ.',
  funcionarios_ref_externa_key: 'Já existe um funcionário com esta referência externa.',
  pagamentos_funcionario_competencia_ativo: 'Este funcionário já tem pagamento nesta competência.',
  comissoes_funcionario_id_competencia_key: 'Já existe comissão para este funcionário nesta competência.',
};

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === '23505') {
    return res.status(409).json({ erro: MENSAGENS_UNICAS[err.constraint] || 'Registro duplicado.' });
  }
  if (err.code === '23503') return res.status(409).json({ erro: 'Registro está em uso por outro cadastro.' });
  if (err.code === '23514') return res.status(400).json({ erro: 'Dados fora das regras do cadastro.', detalhes: err.constraint });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ erro: 'Arquivo grande demais.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: status >= 500 && !err.status ? 'Erro interno.' : err.message, detalhes: err.detalhes });
});

app.listen(config.porta, () => {
  console.log(`Painel em http://localhost:${config.porta}`);
});
