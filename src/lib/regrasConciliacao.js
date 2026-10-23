/**
 * Regras para decidir a qual pagamento pendente uma saída do extrato corresponde.
 * Função pura, sem banco de dados, para poder ser testada isoladamente.
 *
 * Ordem de confiança:
 *   1. txid do pagamento aparece na transação
 *   2. chave Pix do recebedor aparece na descrição
 *   3. primeiro e último nome do recebedor aparecem na transação
 *   4. só existe um pagamento pendente com aquele valor e a transação não traz nome
 * Se houver empate em qualquer etapa, nada é conciliado automaticamente.
 */
const { centavos, textoComparavel } = require('./util');

const DIA = 24 * 60 * 60 * 1000;

function nomeBate(nomeRecebedor, texto) {
  const partes = textoComparavel(nomeRecebedor)
    .split(' ')
    .filter((p) => p.length >= 3 && !['DOS', 'DAS', 'DES'].includes(p));
  if (!partes.length) return false;
  const palavras = new Set(texto.split(' '));
  const primeiro = partes[0];
  const ultimo = partes[partes.length - 1];
  return palavras.has(primeiro) && palavras.has(ultimo);
}

function chaveBate(chave, textoOriginal) {
  if (!chave) return false;
  const t = String(textoOriginal || '').toLowerCase();
  if (chave.includes('@')) return t.includes(chave.toLowerCase());
  const digitosChave = chave.replace(/\D/g, '');
  if (digitosChave.length >= 11) return t.replace(/\D/g, '').includes(digitosChave);
  return t.includes(chave.toLowerCase());
}

/**
 * @param {{data:string, valor:number, descricao?:string, nome_destino?:string, txid?:string}} transacao
 * @param {Array<{id:number, valor:number|string, txid:string, nome_recebedor:string, chave_pix:string, created_at:string|Date}>} pendentes
 * @returns {{pagamento: object, motivo: string} | null}
 */
function escolherPagamento(transacao, pendentes) {
  const valor = centavos(transacao.valor);
  const dataTransacao = new Date(transacao.data + 'T23:59:59Z').getTime();

  // Mesmo valor e QR gerado até 1 dia depois da data do lançamento (fuso e data de compensação)
  const candidatos = pendentes.filter(
    (p) =>
      centavos(p.valor) === valor &&
      new Date(p.created_at).getTime() <= dataTransacao + DIA,
  );
  if (!candidatos.length) return null;

  const original = [transacao.nome_destino, transacao.descricao, transacao.txid].filter(Boolean).join(' ');
  const texto = textoComparavel(original);
  const unico = (lista, motivo) => (lista.length === 1 ? { pagamento: lista[0], motivo } : null);

  const porTxid = candidatos.filter(
    (p) => (transacao.txid && transacao.txid.toUpperCase() === p.txid) || texto.includes(p.txid),
  );
  if (porTxid.length) return unico(porTxid, 'txid');

  const porChave = candidatos.filter((p) => chaveBate(p.chave_pix, original));
  if (porChave.length) return unico(porChave, 'chave');

  const porNome = candidatos.filter((p) => nomeBate(p.nome_recebedor, texto));
  if (porNome.length) return unico(porNome, 'nome');

  if (!transacao.nome_destino) return unico(candidatos, 'valor');
  return null;
}

module.exports = { escolherPagamento, nomeBate, chaveBate };
