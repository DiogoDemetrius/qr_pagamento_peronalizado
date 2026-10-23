const knex = require('knex');
const knexfile = require('../knexfile');
const { types } = require('pg');

// numeric (valores em reais) e count(*) chegam como texto no driver pg; converte para número
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// date (sem hora) volta como 'aaaa-mm-dd', sem conversão de fuso
types.setTypeParser(1082, (v) => v);

module.exports = knex(knexfile);
