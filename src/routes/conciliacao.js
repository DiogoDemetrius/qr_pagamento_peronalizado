const express = require('express');
const multer = require('multer');
const db = require('../db');
const conciliacao = require('../services/conciliacao');
const bancoInter = require('../services/bancoInter');
const { lerExtrato } = require('../lib/extrato');
const { ErroHttp, rota, paginacao, paraData } = require('../lib/util');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const r = express.Router();

/** Arquivo OFX ou CSV exportado do internet banking da conta que paga. */
r.post('/extrato', upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) throw new ErroHttp(400, 'Envie o arquivo do extrato (OFX ou CSV).');
  const texto = req.file.buffer.toString(/<OFX>|OFXHEADER/i.test(req.file.buffer.slice(0, 500).toString('latin1')) ? 'latin1' : 'utf8');
  const { fonte, saidas } = lerExtrato(req.file.originalname, texto);
  if (!saidas.length) throw new ErroHttp(400, 'Nenhuma saída encontrada no arquivo. Confira se é o extrato da conta que paga as comissões.');
  res.json(await conciliacao.importarSaidas({ fonte, arquivo: req.file.originalname, saidas }));
}));

/** Busca as saídas Pix pela API do banco e concilia. */
r.post('/api-banco', rota(async (req, res) => {
  const inicio = paraData(req.body.data_inicio);
  const fim = paraData(req.body.data_fim);
  if (!inicio || !fim) throw new ErroHttp(400, 'Informe data inicial e final.');
  if (inicio > fim) throw new ErroHttp(400, 'A data inicial é depois da final.');
  const saidas = await bancoInter.buscarSaidasPix(inicio, fim);
  res.json(await conciliacao.importarSaidas({ fonte: 'api', arquivo: 'API do banco', saidas, periodoInicio: inicio, periodoFim: fim }));
}));

/** Roda de novo a conciliação automática (útil depois de gerar novos QR). */
r.post('/reprocessar', rota(async (req, res) => {
  res.json({ conciliadas: await conciliacao.conciliarPendentes() });
}));

r.get('/transacoes', rota(async (req, res) => {
  const { limite, offset } = paginacao(req.query, 100, 500);
  const q = db('transacoes_extrato as t')
    .leftJoin('pagamentos as p', 'p.id', 't.pagamento_id')
    .leftJoin('importacoes_extrato as i', 'i.id', 't.importacao_id');
  if (req.query.situacao) q.where('t.situacao', req.query.situacao);
  const [{ total }] = await q.clone().count({ total: '*' });
  const itens = await q
    .select('t.*', 'p.nome_recebedor as pagamento_nome', 'p.competencia as pagamento_competencia', 'i.fonte')
    .orderBy([{ column: 't.data', order: 'desc' }, { column: 't.id', order: 'desc' }])
    .limit(limite)
    .offset(offset);

  // Para cada transação em aberto, sugere os pagamentos pendentes de mesmo valor
  const abertas = itens.filter((t) => t.situacao === 'sem_correspondencia');
  if (abertas.length) {
    const valores = [...new Set(abertas.map((t) => t.valor))];
    const pendentes = await db('pagamentos')
      .where({ status: 'pendente' })
      .whereIn('valor', valores)
      .select('id', 'valor', 'nome_recebedor', 'competencia');
    for (const t of abertas) t.sugestoes = pendentes.filter((p) => p.valor === t.valor);
  }
  res.json({ total: Number(total), itens });
}));

r.post('/transacoes/:id/vincular', rota(async (req, res) => {
  res.json(await conciliacao.vincular(req.params.id, req.body.pagamento_id));
}));

r.post('/transacoes/:id/ignorar', rota(async (req, res) => {
  res.json(await conciliacao.alterarSituacao(req.params.id, 'ignorada'));
}));

r.post('/transacoes/:id/restaurar', rota(async (req, res) => {
  res.json(await conciliacao.alterarSituacao(req.params.id, 'sem_correspondencia'));
}));

r.get('/importacoes', rota(async (req, res) => {
  res.json(await db('importacoes_extrato').orderBy('created_at', 'desc').limit(30));
}));

module.exports = r;
