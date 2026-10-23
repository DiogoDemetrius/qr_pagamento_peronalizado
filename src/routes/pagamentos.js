const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const pagamentos = require('../services/pagamentos');
const { rota, paginacao, validarCompetencia } = require('../lib/util');

const r = express.Router();

r.get('/', rota(async (req, res) => {
  const { limite, offset } = paginacao(req.query, 100, 1000);
  const q = db('pagamentos as p').join('funcionarios as f', 'f.id', 'p.funcionario_id');
  if (req.query.competencia) q.where('p.competencia', validarCompetencia(req.query.competencia));
  if (req.query.status) q.whereIn('p.status', String(req.query.status).split(','));
  if (req.query.funcionario_id) q.where('p.funcionario_id', req.query.funcionario_id);
  if (req.query.busca) {
    const termo = `%${String(req.query.busca).trim()}%`;
    q.where((w) => w.whereILike('f.nome', termo).orWhereILike('p.txid', termo).orWhereILike('p.chave_pix', termo));
  }
  const [totais] = await q.clone().select(
    db.raw('count(*)::int as total'),
    db.raw('coalesce(sum(p.valor), 0) as valor'),
  );
  const itens = await q
    .select(
      'p.id', 'p.funcionario_id', 'f.nome as funcionario_nome', 'p.competencia', 'p.valor', 'p.status',
      'p.txid', 'p.chave_pix', 'p.pago_em', 'p.confirmacao', 'p.comprovante', 'p.created_at',
    )
    .orderByRaw("case p.status when 'pendente' then 0 when 'pago' then 1 else 2 end, f.nome, p.id")
    .limit(limite)
    .offset(offset);
  res.json({ total: totais.total, valor: Number(totais.valor), itens });
}));

r.post('/gerar-lote', rota(async (req, res) => {
  res.json(await pagamentos.gerarLote(req.body.competencia, req.body.funcionario_ids));
}));

r.post('/', rota(async (req, res) => {
  res.status(201).json(await pagamentos.criarAvulso(req.body));
}));

r.get('/:id', rota(async (req, res) => {
  const p = await pagamentos.buscar(req.params.id);
  const transacao = await db('transacoes_extrato').where({ pagamento_id: p.id }).first('id', 'data', 'valor', 'descricao');
  res.json({ ...p, transacao: transacao || null });
}));

r.get('/:id/qr.png', rota(async (req, res) => {
  const p = await pagamentos.buscar(req.params.id);
  const png = await QRCode.toBuffer(p.payload, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
  res.set('Cache-Control', 'private, max-age=86400').type('png').send(png);
}));

r.post('/:id/pagar', rota(async (req, res) => {
  res.json(await pagamentos.marcarPago(req.params.id, { ...req.body, confirmacao: 'manual' }));
}));

r.post('/:id/cancelar', rota(async (req, res) => {
  res.json(await pagamentos.cancelar(req.params.id, req.body.observacao));
}));

r.post('/:id/reabrir', rota(async (req, res) => {
  res.json(await pagamentos.reabrir(req.params.id));
}));

module.exports = r;
