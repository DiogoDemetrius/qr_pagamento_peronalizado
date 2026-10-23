const express = require('express');
const db = require('../db');
const { CAMPOS, validar } = require('../services/funcionarios');
const { ErroHttp, rota, paginacao } = require('../lib/util');

const r = express.Router();

r.get('/', rota(async (req, res) => {
  const { limite, offset } = paginacao(req.query, 100, 1000);
  const q = db('funcionarios');
  if (req.query.ativo === 'true') q.where({ ativo: true });
  if (req.query.ativo === 'false') q.where({ ativo: false });
  if (req.query.modo) q.where({ modo_comissao: req.query.modo });
  if (req.query.busca) {
    const termo = `%${String(req.query.busca).trim()}%`;
    q.where((w) =>
      w.whereILike('nome', termo).orWhereILike('chave_pix', termo).orWhereILike('documento', termo)
        .orWhereILike('ref_externa', termo).orWhereILike('email', termo),
    );
  }
  const [{ total }] = await q.clone().count({ total: '*' });
  const itens = await q.select(CAMPOS).orderBy('nome').limit(limite).offset(offset);
  res.json({ total: Number(total), itens });
}));

r.get('/:id', rota(async (req, res) => {
  const f = await db('funcionarios').where({ id: req.params.id }).first(CAMPOS);
  if (!f) throw new ErroHttp(404, 'Funcionário não encontrado.');
  const pagamentos = await db('pagamentos')
    .where({ funcionario_id: f.id })
    .orderBy('created_at', 'desc')
    .limit(24)
    .select('id', 'competencia', 'valor', 'status', 'pago_em', 'confirmacao', 'created_at');
  res.json({ ...f, pagamentos });
}));

r.post('/', rota(async (req, res) => {
  const dados = validar(req.body);
  const [criado] = await db('funcionarios').insert(dados).returning(CAMPOS);
  res.status(201).json(criado);
}));

r.put('/:id', rota(async (req, res) => {
  const dados = validar(req.body);
  const [atualizado] = await db('funcionarios').where({ id: req.params.id }).update(dados).returning(CAMPOS);
  if (!atualizado) throw new ErroHttp(404, 'Funcionário não encontrado.');
  res.json(atualizado);
}));

/** Funcionário com histórico de pagamentos é desativado em vez de excluído. */
r.delete('/:id', rota(async (req, res) => {
  const usado = await db('pagamentos').where({ funcionario_id: req.params.id }).first('id');
  if (usado) {
    const n = await db('funcionarios').where({ id: req.params.id }).update({ ativo: false });
    if (!n) throw new ErroHttp(404, 'Funcionário não encontrado.');
    return res.json({ desativado: true });
  }
  const n = await db('funcionarios').where({ id: req.params.id }).del();
  if (!n) throw new ErroHttp(404, 'Funcionário não encontrado.');
  res.json({ excluido: true });
}));

module.exports = r;
