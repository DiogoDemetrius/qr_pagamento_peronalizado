/* Funções compartilhadas pelas telas. Sem build, sem dependências. */

const App = (() => {
  const PAGINAS = [
    ['/', 'Painel'],
    ['/funcionarios', 'Funcionários'],
    ['/comissoes', 'Comissões'],
    ['/pagamentos', 'Pagamentos'],
    ['/conciliacao', 'Conciliação'],
    ['/gerador', 'Gerador avulso'],
  ];

  function montarTopo() {
    const atual = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
    const topo = document.createElement('header');
    topo.className = 'topo';
    topo.innerHTML = `
      <div class="topo-inner">
        <a class="marca" href="/">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
            <path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="currentColor"/>
          </svg>
          Comissões Pix
        </a>
        <nav class="nav" aria-label="Seções">
          ${PAGINAS.map(([href, nome]) => `<a href="${href}" ${href === atual ? 'aria-current="page"' : ''}>${nome}</a>`).join('')}
        </nav>
      </div>`;
    document.body.prepend(topo);
  }

  async function api(caminho, opcoes = {}) {
    const init = { ...opcoes, headers: { ...(opcoes.headers || {}) } };
    if (opcoes.json !== undefined) {
      init.method = init.method || 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opcoes.json);
    }
    const res = await fetch(caminho, init);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) {
      const e = new Error(corpo?.erro || `Erro ${res.status}`);
      e.detalhes = corpo?.detalhes;
      e.corpo = corpo;
      throw e;
    }
    return corpo;
  }

  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (n) => fmtBRL.format(Number(n) || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function data(iso) {
    if (!iso) return '';
    const s = String(iso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/');
    return new Date(s).toLocaleDateString('pt-BR');
  }
  function dataHora(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function competenciaNome(c) {
    if (!c) return '';
    const [a, m] = c.split('-').map(Number);
    const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  const ROTULOS = {
    pendente: 'Pendente', pago: 'Pago', cancelado: 'Cancelado',
    conciliada: 'Conciliada', sem_correspondencia: 'Sem correspondência', ignorada: 'Ignorada',
    manual: 'Manual', extrato: 'Extrato', api: 'API do banco',
    planilha: 'Planilha', webhook: 'Webhook', banco_externo: 'Outro banco',
    fixa: 'Fixa', variavel: 'Variável',
  };
  const rotulo = (v) => ROTULOS[v] || v || '';
  const pill = (status, texto) => `<span class="pill ${esc(status)}">${esc(texto || rotulo(status))}</span>`;

  let timerToast;
  function toast(msg, tipo) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = msg;
    el.className = tipo === 'erro' ? 'erro' : '';
    el.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => (el.hidden = true), tipo === 'erro' ? 6000 : 3500);
  }
  const erro = (e) => toast(e.message || String(e), 'erro');

  /** Confirmação dentro da página (o navegador pode bloquear confirm()). */
  function confirmar(mensagem, textoBotao = 'Confirmar', perigo = false) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.innerHTML = `<div class="conteudo">
        <p style="margin:0">${esc(mensagem)}</p>
        <div class="rodape">
          <button type="button" class="secundario" data-r="0">Voltar</button>
          <button type="button" class="${perigo ? 'perigo' : ''}" data-r="1">${esc(textoBotao)}</button>
        </div></div>`;
      document.body.append(d);
      d.addEventListener('click', (ev) => {
        const r = ev.target.closest('[data-r]');
        if (r) { d.close(); resolve(r.dataset.r === '1'); }
      });
      d.addEventListener('close', () => { d.remove(); resolve(false); });
      d.showModal();
    });
  }

  async function copiar(texto, alvo) {
    try {
      await navigator.clipboard.writeText(texto);
      toast('Copiado.');
    } catch {
      if (alvo) {
        const range = document.createRange();
        range.selectNodeContents(alvo);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      toast('Texto selecionado. Use Ctrl+C para copiar.');
    }
  }

  let configCache;
  const config = () => (configCache ||= api('/api/config'));

  /** Liga um <input type="month"> à competência da URL (?competencia=) ou ao mês atual. */
  async function campoCompetencia(input, aoMudar) {
    const url = new URLSearchParams(location.search).get('competencia');
    input.value = url || (await config()).competencia_atual;
    input.addEventListener('change', () => {
      if (!input.value) return;
      const p = new URLSearchParams(location.search);
      p.set('competencia', input.value);
      history.replaceState(null, '', `${location.pathname}?${p}`);
      aoMudar(input.value);
    });
    return input.value;
  }

  /** Mostra resumo de importação (gravadas, erros, avisos) dentro de um elemento. */
  function mostrarResultado(el, titulo, linhas, erros = [], avisos = []) {
    el.hidden = false;
    el.innerHTML = `
      <strong>${esc(titulo)}</strong>
      ${linhas.length ? `<ul>${linhas.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      ${erros.length ? `<div class="erro"><strong>Não importado (${erros.length})</strong><ul>${erros.slice(0, 50).map((e) => `<li>${e.linha ? `Linha ${e.linha}: ` : ''}${esc(e.motivo)}</li>`).join('')}</ul></div>` : ''}
      ${avisos.length ? `<div class="aviso"><strong>Avisos (${avisos.length})</strong><ul>${avisos.slice(0, 50).map((a) => `<li>${a.linha ? `Linha ${a.linha}: ` : ''}${esc(a.motivo)}</li>`).join('')}</ul></div>` : ''}`;
  }

  document.addEventListener('DOMContentLoaded', montarTopo);

  return { api, brl, esc, data, dataHora, competenciaNome, rotulo, pill, toast, erro, confirmar, copiar, config, campoCompetencia, mostrarResultado };
})();
