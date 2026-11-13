// Radar de Reação · site estático. Lê só dados.json (números agregados, sem textos nem autores).

const estado = { dados: null, evento: null, graficos: {} };

// Datas que ajudam a ler o gráfico de preços (domingos de eleição em 2026).
const MARCOS = [
  { data: '2026-10-04', texto: '1º turno' },
  { data: '2026-10-25', texto: '2º turno' },
];

// Aberto direto do computador (file://) para testar: usa os dados já publicados.
const URL_DADOS = location.protocol === 'file:'
  ? 'https://devdavicod.github.io/radar-de-reacao-site/dados.json'
  : 'dados.json';

// Modo incorporado: dentro de um iframe (site da Ceará Finance) ou com ?incorporado=1 no endereço.
const INCORPORADO = new URLSearchParams(location.search).has('incorporado') || window.self !== window.top;
if (INCORPORADO) document.documentElement.classList.add('incorporado');

// Avisa a página da liga a altura do Radar, para o iframe crescer sem barra de rolagem.
function avisarAltura() {
  if (window.self === window.top) return;
  window.parent.postMessage({ tipo: 'radar-altura', altura: document.documentElement.scrollHeight }, '*');
}
if (INCORPORADO && 'ResizeObserver' in window) {
  new ResizeObserver(avisarAltura).observe(document.documentElement);
}

const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

function comAlfa(hex, alfa) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function dataBR(iso, comAno = true) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

function num(v, casas = 1) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(casas).replace('.', ',');
}

function sinal(v, casas = 1) {
  if (v === null || v === undefined) return '—';
  const t = num(v, casas);
  return v > 0 ? `+${t}` : t.replace('-', '−');
}

function el(tag, texto, classe) {
  const e = document.createElement(tag);
  if (texto !== undefined) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
}

const resultado = (semana, publico) => semana[publico] || { n: 0 };
const semAmostra = (r) => !r.n || r.amostra_baixa;
const textoMargem = (r) => (r.amostra_baixa ? 'poucos textos: sem margem de erro' : `margem ±${num(r.margem)}`);

async function iniciar() {
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cor('--texto-2');
    Chart.defaults.borderColor = cor('--grade');
    Chart.defaults.plugins.tooltip.backgroundColor = cor('--preto-cf');
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
  }
  try {
    const resp = await fetch(URL_DADOS, { cache: 'no-store' });
    estado.dados = await resp.json();
  } catch (erro) {
    document.getElementById('evento-titulo').textContent = 'Não foi possível carregar os dados.';
    return;
  }
  const d = estado.dados;
  document.getElementById('atualizado').textContent = `atualizado em ${dataBR(d.atualizado_em)}`;
  document.getElementById('aviso-classificacao').hidden = !!d.classificacao_pronta;

  const nav = document.getElementById('eventos');
  d.eventos.forEach((ev, i) => {
    const b = el('button', ev.titulo);
    b.type = 'button';
    b.addEventListener('click', () => escolherEvento(i));
    nav.appendChild(b);
  });
  mostrarQualidade(d.qualidade || {});
  escolherEvento(0);
}

function escolherEvento(i) {
  const ev = estado.dados.eventos[i];
  estado.evento = ev;
  document.querySelectorAll('#eventos button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  document.getElementById('evento-titulo').textContent = ev.titulo;
  const det = document.getElementById('evento-detalhe');
  det.textContent = `Anunciada em ${dataBR(ev.data)} · acompanhada por ${ev.semanas.length} semana${ev.semanas.length === 1 ? '' : 's'}. `;
  if (ev.fonte_url) {
    const a = el('a', 'Ler a notícia de origem');
    a.href = ev.fonte_url; a.target = '_blank'; a.rel = 'noopener';
    det.appendChild(a);
  }
  if (ev.encerrado_na_semana) {
    det.appendChild(document.createTextNode(` Acompanhamento encerrado na semana ${ev.encerrado_na_semana} (duas semanas seguidas com pouca reação).`));
  }
  const temSemanas = ev.semanas.length > 0;
  document.getElementById('secao-reacao').hidden = !temSemanas;
  document.getElementById('secao-saldo').hidden = !temSemanas;
  if (temSemanas) {
    desenharBarras(ev, 'mercado');
    desenharBarras(ev, 'publico');
    desenharSaldo(ev);
    preencherTabelas(ev);
  }
  desenharPrecos(ev);
}

function trocarGrafico(nome, config) {
  if (estado.graficos[nome]) estado.graficos[nome].destroy();
  if (typeof Chart === 'undefined') return;
  estado.graficos[nome] = new Chart(document.getElementById(nome), config);
}

function tituloSemana(s) {
  return `Semana ${s.semana} · ${dataBR(s.inicio, false)} a ${dataBR(s.fim, false)}`;
}

function rodapeSemana(r) {
  if (!r.n) return 'Sem textos com posição nesta semana.';
  return [`Saldo ${sinal(r.saldo)} p.p. (${textoMargem(r)})`,
    `${r.n} textos com posição${r.fora ? ` · ${r.fora} fora do tema` : ''}`];
}

// Barras empilhadas: cada barra é uma semana e soma 100% (favorável + neutro + contrário).
function desenharBarras(ev, publico) {
  const semanas = ev.semanas;
  const rs = semanas.map((s) => resultado(s, publico));
  const fatia = (chave, nome, corBase) => ({
    label: nome,
    data: rs.map((r) => (r.n ? r[chave] : null)),
    backgroundColor: rs.map((r) => (semAmostra(r) ? comAlfa(corBase, 0.3) : corBase)),
    hoverBackgroundColor: rs.map((r) => (semAmostra(r) ? comAlfa(corBase, 0.45) : corBase)),
    borderColor: cor('--superficie'),
    borderWidth: 1,
    borderSkipped: false,
    maxBarThickness: 64,
  });
  // Rótulo embaixo de cada barra: semana e n. Em tela estreita (celular), versão curta, sem pular semanas.
  const asterisco = (r) => (r.amostra_baixa ? '*' : '');
  const rotuloLongo = (s, r) => [`Sem. ${s.semana}`, r.n ? `n = ${r.n}${asterisco(r)}` : 'sem textos'];
  const rotuloCurto = (s, r) => [`S${s.semana}`, r.n ? `${r.n}${asterisco(r)}` : '0'];
  trocarGrafico(`barras-${publico}`, {
    type: 'bar',
    data: {
      labels: semanas.map((s) => `Sem. ${s.semana}`),
      datasets: [fatia('pos', 'Favorável', cor('--pos')), fatia('neu', 'Neutro', cor('--neu')), fatia('neg', 'Contrário', cor('--neg'))],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: cor('--texto-2'), autoSkip: false, maxRotation: 0,
            callback(_valor, i) {
              const curto = this.chart.width < 60 * semanas.length;
              return (curto ? rotuloCurto : rotuloLongo)(semanas[i], rs[i]);
            },
          },
        },
        y: { stacked: true, min: 0, max: 100, ticks: { stepSize: 25, callback: (v) => `${v}%` } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.parsed.y !== null,
          callbacks: {
            title: (itens) => tituloSemana(semanas[itens[0].dataIndex]),
            label: (c) => ` ${c.dataset.label}: ${num(c.parsed.y, 0)}%`,
            footer: (itens) => rodapeSemana(rs[itens[0].dataIndex]),
          },
        },
      },
    },
  });
}

// Saldo (% favorável − % contrário) das duas fontes no mesmo gráfico, na mesma escala de −100 a +100.
function serieSaldo(ev, publico, nome, corLinha, ponto) {
  const rs = ev.semanas.map((s) => resultado(s, publico));
  const baixa = rs.map(semAmostra);
  return {
    label: nome,
    data: rs.map((r) => (r.n ? r.saldo : null)),
    borderColor: corLinha,
    backgroundColor: corLinha,
    borderWidth: 2,
    pointStyle: ponto,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBorderWidth: 2,
    pointBorderColor: corLinha,
    pointBackgroundColor: baixa.map((b) => (b ? cor('--superficie') : corLinha)),
    segment: { borderDash: (c) => (baixa[c.p0DataIndex] || baixa[c.p1DataIndex] ? [5, 4] : undefined) },
    spanGaps: true,
    resultados: rs,
  };
}

function desenharSaldo(ev) {
  trocarGrafico('grafico-saldo', {
    type: 'line',
    data: {
      labels: ev.semanas.map((s) => `Sem. ${s.semana}`),
      datasets: [
        serieSaldo(ev, 'mercado', 'Mercado', cor('--linha-1'), 'circle'),
        serieSaldo(ev, 'publico', 'Público', cor('--linha-2'), 'rect'),
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: -100, max: 100,
          title: { display: true, text: 'Saldo (p.p.)' },
          ticks: { stepSize: 25, callback: (v) => (v === 0 ? '0' : sinal(v, 0)) },
          grid: { color: (c) => (c.tick.value === 0 ? cor('--texto-3') : cor('--grade')), lineWidth: (c) => (c.tick.value === 0 ? 1.5 : 1) },
        },
      },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: cor('--texto') } },
        tooltip: {
          filter: (item) => item.parsed.y !== null,
          callbacks: {
            title: (itens) => tituloSemana(ev.semanas[itens[0].dataIndex]),
            label: (c) => {
              const r = c.dataset.resultados[c.dataIndex];
              return ` ${c.dataset.label}: ${sinal(c.parsed.y)} p.p. (${textoMargem(r)}) · n = ${r.n}`;
            },
          },
        },
      },
    },
  });
}

function preencherTabelas(ev) {
  const caixa = document.getElementById('tabelas-semanas');
  caixa.replaceChildren();
  for (const [publico, nome] of [['mercado', 'Mercado (notícias)'], ['publico', 'Público (comentários)']]) {
    caixa.appendChild(el('h3', nome));
    const rolagem = el('div', undefined, 'rolagem');
    const tabela = el('table', undefined, 'tabela');
    const cab = el('tr');
    ['Semana', 'Datas', 'Favorável', 'Neutro', 'Contrário', 'Saldo (p.p.)', 'Margem', 'Textos', 'Fora do tema']
      .forEach((t) => cab.appendChild(el('th', t)));
    tabela.appendChild(el('thead')).appendChild(cab);
    const corpo = el('tbody');
    for (const s of ev.semanas) {
      const r = resultado(s, publico);
      const tr = el('tr', undefined, semAmostra(r) ? 'baixa' : undefined);
      const celulas = r.n
        ? [`${num(r.pos, 0)}%`, `${num(r.neu, 0)}%`, `${num(r.neg, 0)}%`, sinal(r.saldo),
          r.amostra_baixa ? 'poucos textos' : `±${num(r.margem)}`, String(r.n), String(r.fora || 0)]
        : ['—', '—', '—', '—', '—', '0', String(r.fora || 0)];
      [String(s.semana), `${dataBR(s.inicio, false)} a ${dataBR(s.fim, false)}`, ...celulas]
        .forEach((t) => tr.appendChild(el('td', t)));
      corpo.appendChild(tr);
    }
    tabela.appendChild(corpo);
    rolagem.appendChild(tabela);
    caixa.appendChild(rolagem);
  }
}

// Linhas tracejadas verticais com um rótulo curto (as datas de MARCOS) no gráfico de preços.
const pluginMarcos = {
  id: 'marcos',
  afterDatasetsDraw(chart, _args, opcoes) {
    const itens = (opcoes && opcoes.itens) || [];
    if (!itens.length) return;
    const { ctx, chartArea, scales: { x } } = chart;
    const passo = x.getPixelForValue(1) - x.getPixelForValue(0);
    ctx.save();
    ctx.strokeStyle = cor('--texto-3');
    ctx.fillStyle = cor('--texto-2');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    for (const m of itens) {
      const px = x.getPixelForValue(m.indice) - passo / 2;
      ctx.beginPath();
      ctx.moveTo(px, chartArea.top);
      ctx.lineTo(px, chartArea.bottom);
      ctx.stroke();
      ctx.fillText(m.texto, px + 4, chartArea.top + 12);
    }
    ctx.restore();
  },
};

function ultimoValor(serie, chave) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (serie[i][chave] !== null && serie[i][chave] !== undefined) return serie[i];
  }
  return null;
}

function desenharPrecos(ev) {
  const serie = (ev.precos && ev.precos.serie) || [];
  const vespera = ev.precos && ev.precos.vespera;
  document.getElementById('precos-detalhe').textContent = vespera
    ? `Quanto o dólar (PTAX, do Banco Central) e o Ibovespa variaram desde a véspera do anúncio (${dataBR(vespera)}). É só contexto: os preços mudam por muitos motivos e não entram no cálculo da reação. As linhas tracejadas marcam o 1º e o 2º turno das eleições, que mexeram com os dois.`
    : 'Preços ainda não coletados.';

  const t = document.getElementById('termometro');
  t.replaceChildren();
  for (const [nome, chave] of [['Dólar (PTAX)', 'dolar'], ['Ibovespa', 'ibovespa']]) {
    const ultimo = ultimoValor(serie, chave);
    const caixa = el('div', undefined, 'medidor');
    caixa.appendChild(el('div', ultimo ? `${nome} · da véspera até ${dataBR(ultimo.data, false)}` : nome, 'nome'));
    caixa.appendChild(el('div', ultimo ? `${sinal(ultimo[chave], 2)}%` : '—', 'valor'));
    t.appendChild(caixa);
  }

  const marcos = MARCOS.map((m) => ({ ...m, indice: serie.findIndex((r) => r.data >= m.data) }))
    .filter((m) => m.indice > 0);
  trocarGrafico('grafico-precos', {
    type: 'line',
    data: {
      labels: serie.map((r) => dataBR(r.data, false)),
      datasets: [
        { label: 'Dólar (PTAX)', data: serie.map((r) => r.dolar), borderColor: cor('--linha-1'), backgroundColor: cor('--linha-1'),
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true },
        { label: 'Ibovespa', data: serie.map((r) => r.ibovespa), borderColor: cor('--linha-2'), backgroundColor: cor('--linha-2'),
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true },
      ],
    },
    plugins: [pluginMarcos],
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          title: { display: true, text: 'Variação desde a véspera (%)' },
          ticks: { callback: (v) => (v === 0 ? '0' : sinal(v, 0)) },
          grid: { color: (c) => (c.tick.value === 0 ? cor('--texto-3') : cor('--grade')) },
        },
      },
      plugins: {
        marcos: { itens: marcos },
        legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'line', color: cor('--texto') } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${sinal(c.parsed.y, 2)}%` } },
      },
    },
  });
}

function mostrarQualidade(q) {
  document.getElementById('qualidade-metodo').textContent = q.metodo || '';
  document.getElementById('qualidade-comparacao').textContent = q.comparacao || '';
  const corpoV = document.querySelector('#tabela-validacao tbody');
  (q.validacao || []).forEach((v) => {
    const tr = el('tr');
    tr.append(el('td', v.recorte), el('td', String(v.n)), el('td', num(v.macro_f1, 2)), el('td', v.ic));
    corpoV.appendChild(tr);
  });
  document.getElementById('nota-validacao').textContent =
    (q.provisorio ? 'Provisório. ' : '') + (q.nota_validacao || '');
  const corpoC = document.querySelector('#tabela-concordancia tbody');
  (q.concordancia || []).forEach((c) => {
    const tr = el('tr');
    tr.append(el('td', c.base), el('td', num(c.kappa, 2)));
    corpoC.appendChild(tr);
  });
  document.getElementById('nota-concordancia').textContent = q.nota_concordancia || '';
  document.getElementById('filtro-fora').textContent = q.filtro_fora || '';
  const lista = document.getElementById('limitacoes');
  (q.limitacoes || []).forEach((t) => lista.appendChild(el('li', t)));
}

document.addEventListener('DOMContentLoaded', iniciar);
