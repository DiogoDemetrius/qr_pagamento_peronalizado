/**
 * Entrada de comissões vinda de outros sistemas (CRM, ERP, automações).
 *
 * POST /api/webhooks/comissoes
 * Header: X-Api-Key: <WEBHOOK_TOKEN>
 * Corpo:
 * {
 *   "competencia": "2026-10",
 *   "referencia": "fechamento-outubro",          (opcional)
 *   "itens": [
 *     { "ref_externa": "VEND-02", "valor": 1534.90 },
 *     { "documento": "11144477735", "valor": "850,00" }
 *   ]
 * }
 */
const express = require('express');
const comissoes = require('../services/comissoes');
const { ErroHttp, rota } = require('../lib/util');

const r = express.Router();

r.post('/comissoes', rota(async (req, res) => {
  const { competencia, itens, referencia } = req.body || {};
  if (!Array.isArray(itens) || !itens.length) throw new ErroHttp(400, 'Envie "itens" com pelo menos um valor.');
  if (itens.length > 5000) throw new ErroHttp(400, 'Máximo de 5000 itens por envio.');
  const resultado = await comissoes.importar(competencia, itens, 'webhook', referencia || `webhook ${new Date().toISOString()}`);
  res.status(resultado.erros.length && !resultado.gravadas ? 422 : 200).json(resultado);
}));

module.exports = r;
