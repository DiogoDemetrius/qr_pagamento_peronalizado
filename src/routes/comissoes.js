const express = require('express');
const multer = require('multer');
const db = require('../db');
const comissoes = require('../services/comissoes');
const fonteExterna = require('../services/fonteExterna');
const { lerPlanilha } = require('../services/planilha');
const { ErroHttp, rota, validarCompetencia, competenciaAtual } = require('../lib/util');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const r = express.Router();

r.get('/', rota(async (req, res) => {
  const competencia = validarCompetencia(req.query.competencia || competenciaAtual());
  const itens = await db('comissoes as c')
    .join('funcionarios as f', 'f.id', 'c.funcionario_id')
    .leftJoin('pagamentos as p', function () {
      this.on('p.funcionario_id', 'c.funcionario_id')
        .andOn('p.competencia', 'c.competencia')
        .andOnVal('p.status', '<>', 'cancelado');
    })
    .where('c.competencia', competencia)
    .orderBy('f.nome')
    .select(
      'c.id', 'c.funcionario_id', 'c.competencia', 'c.valor', 'c.origem', 'c.referencia', 'c.updated_at',
      'f.nome', 'f.modo_comissao', 'f.ativo',
      'p.id as pagamento_id', 'p.status as pagamento_status', 'p.valor as pagamento_valor',
    );
  res.json({ competencia, total: itens.reduce((s, i) => s + Number(i.valor), 0), itens });
}));

/** Lançamento manual de um ou mais valores: { competencia, itens: [{ funcionario_id, valor }] } */
r.post('/', rota(async (req, res) => {
  const { competencia } = req.body;
  const itens = Array.isArray(req.body.itens) ? req.body.itens : [req.body];
  res.json(await comissoes.importar(competencia, itens, 'manual', 'lançamento manual'));
}));

r.delete('/:id', rota(async (req, res) => {
  const n = await db('comissoes').where({ id: req.params.id }).del();
  if (!n) throw new ErroHttp(404, 'Lançamento não encontrado.');
  res.json({ excluido: true });
}));

/** Planilha CSV ou XLSX. Colunas: um identificador (funcionario_id, documento, ref_externa ou email) e valor. */
r.post('/importar', upload.single('arquivo'), rota(async (req, res) => {
  const linhas = await lerPlanilha(req.file);
  if (!linhas.length) throw new ErroHttp(400, 'A planilha está vazia.');
  const competencia = req.body.competencia || linhas[0].competencia;
  res.json(await comissoes.importar(competencia, linhas, 'planilha', req.file.originalname));
}));

/** Busca os valores da competência no outro banco de dados configurado no .env. */
r.post('/sincronizar-externo', rota(async (req, res) => {
  const competencia = validarCompetencia(req.body.competencia);
  const linhas = await fonteExterna.buscarComissoes(competencia);
  const resultado = await comissoes.importar(competencia, linhas, 'banco_externo', `consulta em ${new Date().toISOString()}`);
  res.json({ ...resultado, linhas_lidas: linhas.length });
}));

module.exports = r;
