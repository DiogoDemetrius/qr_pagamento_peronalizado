/**
 * Geração do BR Code (Pix estático) conforme o Manual de Padrões para Iniciação do Pix
 * do Banco Central (EMV QRCPS-MPM). Sem dependências externas.
 */
const crypto = require('crypto');

const TIPOS_CHAVE = ['email', 'cpf', 'cnpj', 'telefone', 'aleatoria'];

const tlv = (id, valor) => {
  const v = String(valor);
  if (v.length > 99) throw new Error(`Campo ${id} passou de 99 caracteres`);
  return id + String(v.length).padStart(2, '0') + v;
};

function crc16(texto) {
  let crc = 0xffff;
  for (const ch of texto) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove acentos e qualquer caractere fora do ASCII imprimível. */
function ascii(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function normalizarChave(tipo, chave) {
  const v = String(chave || '').trim();
  switch (tipo) {
    case 'cpf':
    case 'cnpj':
      return v.replace(/\D/g, '');
    case 'email':
      return v.toLowerCase();
    case 'telefone': {
      let d = v.replace(/\D/g, '');
      if (!(d.startsWith('55') && (d.length === 12 || d.length === 13))) d = '55' + d;
      return '+' + d;
    }
    case 'aleatoria':
      return v.toLowerCase();
    default:
      return v;
  }
}

/** Retorna a mensagem de erro ou null se a chave for válida para o tipo. */
function validarChave(tipo, chave) {
  if (!TIPOS_CHAVE.includes(tipo)) return 'Tipo de chave inválido.';
  if (!chave) return 'Informe a chave Pix.';
  const regras = {
    cpf: [/^\d{11}$/, 'CPF deve ter 11 dígitos.'],
    cnpj: [/^\d{14}$/, 'CNPJ deve ter 14 dígitos.'],
    email: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'E-mail inválido.'],
    telefone: [/^\+55\d{10,11}$/, 'Celular deve ter DDD + número, ex.: 11 99999-9999.'],
    aleatoria: [
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'Chave aleatória deve ter o formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.',
    ],
  };
  const [re, msg] = regras[tipo];
  if (!re.test(chave)) return msg;
  if (chave.length > 77) return 'Chave Pix muito longa.';
  return null;
}

/** Identificador único do pagamento: até 25 caracteres alfanuméricos. */
function gerarTxid(competencia, funcionarioId) {
  const sufixo = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `C${String(competencia).replace('-', '')}F${funcionarioId}${sufixo}`.slice(0, 25);
}

/**
 * Monta o BR Code.
 * @param {object} p
 * @param {string} p.chave      chave já normalizada
 * @param {number} p.valor      em reais
 * @param {string} p.nome       nome do recebedor
 * @param {string} p.cidade     cidade do recebedor
 * @param {string} [p.txid]     identificador (alfanumérico, até 25)
 * @param {string} [p.descricao] texto curto mostrado a quem paga
 */
function montarPayload({ chave, valor, nome, cidade, txid, descricao }) {
  const nomeQr = ascii(nome).toUpperCase().slice(0, 25) || 'RECEBEDOR';
  const cidadeQr = ascii(cidade).toUpperCase().slice(0, 15) || 'BRASIL';
  const txidQr = ascii(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  let conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave);
  const desc = ascii(descricao);
  if (desc) {
    // O campo 26 inteiro não pode passar de 99 caracteres
    const espaco = 99 - conta.length - 4;
    if (espaco > 0) conta += tlv('02', desc.slice(0, espaco));
  }

  const campos = [tlv('00', '01'), tlv('26', conta), tlv('52', '0000'), tlv('53', '986')];
  if (valor != null) {
    const n = Number(valor);
    if (!(n > 0)) throw new Error('Valor do Pix deve ser maior que zero.');
    campos.push(tlv('54', n.toFixed(2)));
  }
  campos.push(tlv('58', 'BR'), tlv('59', nomeQr), tlv('60', cidadeQr), tlv('62', tlv('05', txidQr)));

  const semCrc = campos.join('') + '6304';
  return {
    payload: semCrc + crc16(semCrc),
    nome: nomeQr,
    cidade: cidadeQr,
    txid: txidQr,
  };
}

module.exports = {
  TIPOS_CHAVE,
  ascii,
  crc16,
  normalizarChave,
  validarChave,
  gerarTxid,
  montarPayload,
};
