// Radar de Reação · site estático. Lê só dados.json (números agregados, sem textos nem autores).

const estado = { dados: null, evento: null, graficos: {} };

// Modo incorporado: dentro de um iframe (site da Ceará Finance) ou com ?incorporado=1 no endereço.
const INCORPORADO = new URLSearchParams(location.search).has('incorporado') || window.self !== window.top;
if (INCORPORADO) {
  document.documentElement.classList.add('incorporado');
  document.documentElement.setAttribute('data-theme', 'light');  // o site da liga é claro
}

// Avisa a página da liga a altura do Radar, para o iframe crescer sem barra de rolagem.
function avisarAltura() {
  if (window.self === window.top) return;
  window.parent.postMessage({ tipo: 'radar-altura', altura: document.documentElement.scrollHeight }, '*');
}
if (INCORPORADO && 'ResizeObserver' in window) {
  new ResizeObserver(avisarAltura).observe(document.documentElement);
}

const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function sinal(v, casas = 1) {
  if (v === null || v === undefined) return '—';
  const t = v.toFixed(casas).replace('.', ',');
  return v > 0 ? `+${t}` : t;
}

function el(tag, texto, classe) {
  const e = document.createElement(tag);
  if (texto !== undefined) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
}

async function iniciar() {
  try {
    const resp = await fetch('dados.json', { cache: 'no-store' });
    estado.dados = await resp.json();
  } catch (erro) {
    document.getElementById('evento-titulo').textContent = 'Não foi possível carregar os dados.';
    return;
  }
  const d = estado.dados;
  const quando = `Atualizado em ${dataBR(d.atualizado_em)}`;
  document.getElementById('atualizado').textContent = quando;
  document.getElementById('atualizado-incorporado').textContent = quando;
  document.getElementById('aviso-classificacao').hidden = !!d.classificacao_pronta;

  const nav = document.getElementById('eventos');
  d.eventos.forEach((ev, i) => {
    const b = el('button', ev.titulo);
    b.type = 'button';
    b.addEventListener('click', () => escolherEvento(i));
    nav.appendChild(b);
  });
  document.getElementById('semana').addEventListener('input', (e) => mostrarSemana(Number(e.target.value)));
  mostrarQualidade(d.qualidade || {});
  escolherEvento(0);
}

function escolherEvento(i) {
  const ev = estado.dados.eventos[i];
  estado.evento = ev;
  document.querySelectorAll('#eventos button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  document.getElementById('evento-titulo').textContent = ev.titulo;
  const det = document.getElementById('evento-detalhe');
  det.textContent = `Anunciado em ${dataBR(ev.data)}. `;
  if (ev.fonte_url) {
    const a = el('a', 'Ler a notícia de origem');
    a.href = ev.fonte_url; a.target = '_blank'; a.rel = 'noopener';
    det.appendChild(a);
  }
  if (ev.encerrado_na_semana) {
    det.appendChild(document.createTextNode(` Monitoramento encerrado na semana ${ev.encerrado_na_semana} (duas semanas seguidas com pouca reação).`));
  }
  const slider = document.getElementById('semana');
  const total = Math.max(ev.semanas.length, 1);
  slider.max = total;
  slider.value = 1;
  document.getElementById('secao-semana').hidden = ev.semanas.length === 0;
  mostrarSemana(1);
  desenharSaldo(ev);
  desenharPrecos(ev);
}

function preencherPublico(bloco, r, nome) {
  const barra = bloco.querySelector('.barra');
  const numeros = bloco.querySelector('.numeros');
  barra.replaceChildren();
  numeros.replaceChildren();
  bloco.classList.toggle('baixa', !r || r.amostra_baixa);
  if (!r || r.n === 0) {
    numeros.textContent = 'Sem textos com posição nesta semana.';
    barra.setAttribute('aria-label', `${nome}: sem dados`);
    return;
  }
  for (const [classe, valor] of [['pos', r.pos], ['neu', r.neu], ['neg', r.neg]]) {
    const s = el('span', undefined, classe);
    s.style.width = `${valor}%`;
    s.title = `${valor.toFixed(1).replace('.', ',')}%`;
    barra.appendChild(s);
  }
  barra.setAttribute('aria-label',
    `${nome}: ${r.pos}% favorável, ${r.neu}% neutro, ${r.neg}% contrário`);
  numeros.appendChild(el('strong', `Saldo ${sinal(r.saldo)} p.p.`));
  numeros.appendChild(document.createTextNode(r.amostra_baixa
    ? ' (poucos textos: sem margem de erro) · '
    : ` (margem ±${String(r.margem).replace('.', ',')}) · `));
  numeros.appendChild(document.createTextNode(
    `${r.pos.toFixed(0)}% favorável, ${r.neu.toFixed(0)}% neutro, ${r.neg.toFixed(0)}% contrário · n = ${r.n}`));
  if (r.fora) numeros.appendChild(document.createTextNode(` · ${r.fora} fora do tema`));
  if (r.amostra_baixa) numeros.appendChild(el('span', 'amostra baixa', 'selo'));
}

function mostrarSemana(s) {
  const ev = estado.evento;
  const semana = ev.semanas[s - 1];
  if (!semana) return;
  document.getElementById('semana-texto').textContent =
    `Semana ${s} · ${dataBR(semana.inicio)} a ${dataBR(semana.fim)}`;
  preencherPublico(document.getElementById('bloco-mercado'), semana.mercado, 'Mercado');
  preencherPublico(document.getElementById('bloco-publico'), semana.publico, 'Público');
  mostrarTermometro(semana.precos, `até o fim da semana ${s}`);
}

function mostrarTermometro(p, quando) {
  const t = document.getElementById('termometro');
  t.replaceChildren();
  for (const [nome, chave] of [['Dólar (PTAX)', 'dolar'], ['Ibovespa', 'ibovespa']]) {
    const caixa = el('div', undefined, 'medidor');
    caixa.appendChild(el('div', `${nome} ${quando}`, 'nome'));
    const v = p ? p[chave] : null;
    caixa.appendChild(el('div', v === null || v === undefined ? '—' : `${sinal(v, 2)}%`, 'valor'));
    t.appendChild(caixa);
  }
}

function trocarGrafico(nome, config) {
  if (estado.graficos[nome]) estado.graficos[nome].destroy();
  if (typeof Chart === 'undefined') return;
  estado.graficos[nome] = new Chart(document.getElementById(nome), config);
}

function serieSaldo(ev, publico, corLinha) {
  return {
    label: publico === 'mercado' ? 'Mercado' : 'Público',
    data: ev.semanas.map((s) => (s[publico] && s[publico].n ? s[publico].saldo : null)),
    borderColor: corLinha,
    backgroundColor: ev.semanas.map((s) => (s[publico] && !s[publico].amostra_baixa ? corLinha : 'transparent')),
    pointBorderColor: corLinha,
    pointRadius: 5,
    spanGaps: true,
    margens: ev.semanas.map((s) => (s[publico] ? s[publico].margem : null)),
    baixas: ev.semanas.map((s) => !s[publico] || s[publico].amostra_baixa),
    ns: ev.semanas.map((s) => (s[publico] ? s[publico].n : 0)),
  };
}

function desenharSaldo(ev) {
  trocarGrafico('grafico-saldo', {
    type: 'line',
    data: {
      labels: ev.semanas.map((s) => `Sem. ${s.semana}`),
      datasets: [serieSaldo(ev, 'mercado', cor('--destaque')), serieSaldo(ev, 'publico', cor('--neg'))],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: 'Saldo (p.p.)' }, suggestedMin: -50, suggestedMax: 50 } },
      plugins: {
        tooltip: {
          callbacks: {
            label: (c) => {
              const m = c.dataset.baixas[c.dataIndex] ? 'amostra baixa' : `±${c.dataset.margens[c.dataIndex]}`;
              return `${c.dataset.label}: ${sinal(c.parsed.y)} p.p. (${m}) · n = ${c.dataset.ns[c.dataIndex]}`;
            },
          },
        },
      },
    },
  });
}

function desenharPrecos(ev) {
  const serie = (ev.precos && ev.precos.serie) || [];
  document.getElementById('precos-detalhe').textContent = ev.precos && ev.precos.vespera
    ? `Variação acumulada desde a véspera do anúncio (${dataBR(ev.precos.vespera)}). Os preços não entram no cálculo da reação.`
    : 'Preços ainda não coletados.';
  if (!ev.semanas.length) {
    const ultimo = serie.length ? serie[serie.length - 1] : null;
    mostrarTermometro(ultimo, 'até hoje');
  }
  trocarGrafico('grafico-precos', {
    type: 'line',
    data: {
      labels: serie.map((r) => dataBR(r.data).slice(0, 5)),
      datasets: [
        { label: 'Dólar (PTAX)', data: serie.map((r) => r.dolar), borderColor: cor('--destaque'), pointRadius: 0, spanGaps: true },
        { label: 'Ibovespa', data: serie.map((r) => r.ibovespa), borderColor: cor('--pos'), pointRadius: 0, spanGaps: true },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: 'Variação desde a véspera (%)' } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${sinal(c.parsed.y, 2)}%` } } },
    },
  });
}

function mostrarQualidade(q) {
  document.getElementById('qualidade-metodo').textContent = q.metodo || '';
  document.getElementById('qualidade-comparacao').textContent = q.comparacao || '';
  const corpoV = document.querySelector('#tabela-validacao tbody');
  (q.validacao || []).forEach((v) => {
    const tr = el('tr');
    tr.append(el('td', v.recorte), el('td', String(v.n)),
      el('td', v.macro_f1.toFixed(2).replace('.', ',')), el('td', v.ic));
    corpoV.appendChild(tr);
  });
  document.getElementById('nota-validacao').textContent =
    (q.provisorio ? 'Provisório. ' : '') + (q.nota_validacao || '');
  const corpoC = document.querySelector('#tabela-concordancia tbody');
  (q.concordancia || []).forEach((c) => {
    const tr = el('tr');
    tr.append(el('td', c.base), el('td', c.kappa.toFixed(2).replace('.', ',')));
    corpoC.appendChild(tr);
  });
  document.getElementById('nota-concordancia').textContent = q.nota_concordancia || '';
  document.getElementById('filtro-fora').textContent = q.filtro_fora || '';
  const lista = document.getElementById('limitacoes');
  (q.limitacoes || []).forEach((t) => lista.appendChild(el('li', t)));
}

document.addEventListener('DOMContentLoaded', iniciar);
