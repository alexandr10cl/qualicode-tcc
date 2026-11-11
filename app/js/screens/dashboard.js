/* screens/dashboard.js — painel: estatísticas, frequências, donut por categoria, co-ocorrência */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;

  function render(host) {
    const s = store.state;
    host.innerHTML = '';
    host.appendChild(el('div', { class: 'topbar' }, [
      el('h1', { text: 'Painel de Análise' }),
      el('span', { class: 'crumb', text: s.name }),
      el('div', { class: 'topbar-spacer' }),
      el('button', { class: 'btn btn-outline', onclick: () => QC.seed.exportProject(s), html: QC.icon('download', 16) + '<span>Exportar projeto</span>' }),
    ]));

    const dash = el('div', { class: 'dash' });
    dash.appendChild(statRow(s));
    dash.appendChild(el('div', { class: 'dash-cols' }, [
      el('div', { class: 'dash-col' }, [freqCard(s), saturationCard(s), reachCard(s)]),
      el('div', { class: 'dash-col' }, [donutCard(s), reviewCard(s), newCodesCard(s)]),
    ]));
    host.appendChild(dash);
  }

  function statRow(s) {
    const codedQuotes = s.quotations.filter(q => (q.codeIds || []).length).length;
    const pct = s.quotations.length ? Math.round((codedQuotes / s.quotations.length) * 100) : 0;
    const stat = (icon, label, val, sub) => el('div', { class: 'stat-card' }, [
      el('div', { class: 'sc-top' }, [el('span', { text: label }), el('span', { html: QC.icon(icon, 18) })]),
      el('div', { class: 'sc-val', text: val }),
      el('div', { class: 'sc-sub', text: sub || '' }),
    ]);
    return el('div', { class: 'stat-row' }, [
      stat('fileText', 'Documentos', String(s.documents.length), ''),
      stat('tag', 'Códigos', String(s.codes.length), s.categories.length + ' categorias'),
      stat('book', 'Categorias', String(s.categories.length), s.categories.filter(c => c.deductive).length + ' dedutivas'),
      stat('list', 'Trechos', String(s.quotations.length), pct + '% com código'),
      stat('memos', 'Memos', String(s.memos.length), ''),
    ]);
  }

  function freqCard(s) {
    const card = el('div', { class: 'panel-card' });
    card.appendChild(el('h3', { text: 'Códigos mais frequentes' }));
    const ranked = s.codes.map(c => ({ c, n: store.codeCount(c.id) })).filter(o => o.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
    if (!ranked.length) { card.appendChild(ui.empty('plot', 'Sem dados', 'Codifique trechos para ver as frequências.')); return card; }
    const max = ranked[0].n;
    ranked.forEach(o => {
      card.appendChild(el('div', { class: 'freq-row' }, [
        el('div', { class: 'freq-top' }, [
          el('span', { text: o.c.name }),
          el('span', { class: 'muted', text: o.n + ' ' + U.pluralize(o.n, 'ocorrência', 'ocorrências') }),
        ]),
        el('div', { class: 'freq-bar' }, [el('span', { style: `width:${Math.max(4, (o.n / max) * 100)}%;background:${o.c.color}` })]),
      ]));
    });
    return card;
  }

  function donutCard(s) {
    const card = el('div', { class: 'panel-card' });
    card.appendChild(el('h3', { text: 'Frequência por categoria' }));
    // soma de ocorrências dos códigos de cada categoria raiz (subcategorias agregam na pai)
    const data = store.rootCategories().map(cat => ({
      cat, n: store.codesInCategoryDeep(cat.id).reduce((acc, c) => acc + store.codeCount(c.id), 0),
    })).filter(d => d.n > 0);
    const orphanN = s.codes.filter(c => !c.categoryId).reduce((a, c) => a + store.codeCount(c.id), 0);
    if (orphanN > 0) data.push({ cat: { name: 'Sem categoria', color: '#c7c4d8' }, n: orphanN });
    const total = data.reduce((a, d) => a + d.n, 0);
    if (!total) { card.appendChild(ui.empty('plot', 'Sem dados', 'Atribua códigos a categorias e codifique trechos.')); return card; }

    // donut SVG
    const R = 70, SW = 22, C = 2 * Math.PI * R;
    let acc = 0;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '170'); svg.setAttribute('height', '170'); svg.setAttribute('viewBox', '0 0 170 170');
    const mk = (a) => { const e = document.createElementNS(svgNS, 'circle'); for (const k in a) e.setAttribute(k, a[k]); return e; };
    svg.appendChild(mk({ cx: 85, cy: 85, r: R, fill: 'none', stroke: '#f0ecf9', 'stroke-width': SW }));
    data.forEach(d => {
      const frac = d.n / total;
      const seg = mk({ cx: 85, cy: 85, r: R, fill: 'none', stroke: d.cat.color, 'stroke-width': SW, 'stroke-dasharray': `${frac * C} ${C}`, 'stroke-dashoffset': -acc * C, transform: 'rotate(-90 85 85)' });
      svg.appendChild(seg);
      acc += frac;
    });
    const center = document.createElementNS(svgNS, 'text');
    center.setAttribute('x', '85'); center.setAttribute('y', '80'); center.setAttribute('text-anchor', 'middle');
    center.setAttribute('font-size', '26'); center.setAttribute('font-weight', '800'); center.setAttribute('fill', '#1b1b24');
    center.textContent = String(data.length);
    svg.appendChild(center);
    const sub = document.createElementNS(svgNS, 'text');
    sub.setAttribute('x', '85'); sub.setAttribute('y', '100'); sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('font-size', '12'); sub.setAttribute('fill', '#777587');
    sub.textContent = U.pluralize(data.length, 'categoria', 'categorias');
    svg.appendChild(sub);

    const legend = el('div', { class: 'legend' });
    data.sort((a, b) => b.n - a.n).forEach(d => legend.appendChild(el('div', { class: 'legend-row' }, [
      el('span', { class: 'legend-dot', style: `background:${d.cat.color}` }),
      el('span', { text: d.cat.name }),
      el('span', { class: 'lr-pct', text: Math.round((d.n / total) * 100) + '%' }),
    ])));

    card.appendChild(el('div', { class: 'donut-wrap' }, [svg, legend]));
    return card;
  }

  function newCodesCard(s) {
    const card = el('div', { class: 'panel-card' });
    card.appendChild(el('h3', { text: 'Códigos novos por documento' }));
    card.appendChild(el('div', { class: 'tiny muted', style: 'margin:-10px 0 14px', text: 'Códigos que apareceram pela primeira vez em cada documento. A tendência de queda indica saturação teórica.' }));

    const introDoc = introDocMap(s);
    const counts = {};
    Object.keys(introDoc).forEach(cid => { const d = introDoc[cid]; counts[d] = (counts[d] || 0) + 1; });

    const rows = docsChrono(s).map(d => ({ d, n: counts[d.id] || 0 }));
    if (!rows.some(r => r.n > 0)) { card.appendChild(ui.empty('plot', 'Sem dados', 'Codifique trechos para ver os códigos novos por documento.')); return card; }

    const max = Math.max.apply(null, rows.map(r => r.n).concat([1]));
    rows.forEach(r => {
      card.appendChild(el('div', { class: 'freq-row' }, [
        el('div', { class: 'freq-top' }, [
          el('span', { text: r.d.name }),
          el('span', { class: 'muted', text: r.n + ' ' + U.pluralize(r.n, 'código novo', 'códigos novos') }),
        ]),
        el('div', { class: 'freq-bar' }, [el('span', { style: `width:${Math.max(3, (r.n / max) * 100)}%;background:#4f46e5` })]),
      ]));
    });
    return card;
  }

  // ordem cronológica dos documentos (mesma base do newCodesCard)
  function docsChrono(s) {
    return s.documents.slice().sort((a, b) => (a.importedAt || '').localeCompare(b.importedAt || ''));
  }
  // documento onde cada código surgiu = doc da 1ª quotation (em ordem de criação) que o referencia
  function introDocMap(s) {
    const introDoc = {};
    s.quotations.forEach(q => (q.codeIds || []).forEach(cid => { if (introDoc[cid] == null) introDoc[cid] = q.documentId; }));
    return introDoc;
  }

  // Curva de saturação: total ACUMULADO de códigos únicos ao longo dos documentos.
  // A curva achatando é a evidência de saturação teórica.
  function saturationCard(s) {
    const card = el('div', { class: 'panel-card' });
    card.appendChild(el('h3', { text: 'Curva de saturação' }));
    card.appendChild(el('div', { class: 'tiny muted', style: 'margin:-10px 0 14px', text: 'Total acumulado de códigos únicos a cada documento. A curva achatando indica saturação teórica.' }));

    const introDoc = introDocMap(s);
    const newPerDoc = {};
    Object.keys(introDoc).forEach(cid => { const d = introDoc[cid]; newPerDoc[d] = (newPerDoc[d] || 0) + 1; });
    const docs = docsChrono(s);
    let acc = 0;
    const points = docs.map(d => { acc += (newPerDoc[d.id] || 0); return { d, novos: newPerDoc[d.id] || 0, total: acc }; });
    if (!acc) { card.appendChild(ui.empty('plot', 'Sem dados', 'Codifique trechos para ver a curva de saturação.')); return card; }

    // gráfico de linha SVG (área + linha + pontos)
    const W = 300, H = 150, PADL = 34, PADB = 24, PADT = 10, PADR = 10;
    const iw = W - PADL - PADR, ih = H - PADT - PADB;
    const maxY = acc, n = points.length;
    const xAt = (i) => PADL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const yAt = (v) => PADT + ih - (maxY ? (v / maxY) * ih : 0);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'satsvg');
    const mk = (tag, a) => { const e = document.createElementNS(svgNS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    // grid horizontal + rótulos Y (0 e máx)
    [0, maxY].forEach(v => {
      svg.appendChild(mk('line', { x1: PADL, y1: yAt(v), x2: W - PADR, y2: yAt(v), stroke: '#f0ecf9', 'stroke-width': 1 }));
      const t = mk('text', { x: PADL - 6, y: yAt(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#777587' }); t.textContent = String(v); svg.appendChild(t);
    });
    const line = points.map((p, i) => `${xAt(i)},${yAt(p.total)}`).join(' ');
    svg.appendChild(mk('polygon', { points: `${PADL},${yAt(0)} ${line} ${xAt(n - 1)},${yAt(0)}`, fill: U.hexToRgba('#4f46e5', 0.12), stroke: 'none' }));
    svg.appendChild(mk('polyline', { points: line, fill: 'none', stroke: '#4f46e5', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    points.forEach((p, i) => {
      const c = mk('circle', { cx: xAt(i), cy: yAt(p.total), r: 3.5, fill: '#4f46e5' });
      const title = mk('title', {}); title.textContent = `${p.d.name}: ${p.total} códigos (${p.novos} ${U.pluralize(p.novos, 'novo', 'novos')})`;
      c.appendChild(title); svg.appendChild(c);
    });
    card.appendChild(el('div', { class: 'satwrap' }, [svg]));
    return card;
  }

  // Códigos com 1 única ocorrência — candidatos a fusão, revisão ou in vivo legítimo.
  function reviewCard(s) {
    const card = el('div', { class: 'panel-card' });
    card.appendChild(el('h3', { text: 'Códigos a revisar' }));
    card.appendChild(el('div', { class: 'tiny muted', style: 'margin:-10px 0 14px', text: 'Códigos com uma só ocorrência. Confira se são inéditos ou se devem ser fundidos com um código existente.' }));

    const singles = s.codes.map(c => ({ c, n: store.codeCount(c.id) })).filter(o => o.n === 1).map(o => o.c);
    if (!singles.length) { card.appendChild(ui.empty('check', 'Nenhum código isolado', 'Todos os códigos aparecem em mais de um trecho.')); return card; }

    const list = el('div', { class: 'review-list' });
    singles.forEach(c => {
      const q = store.quotationsOf(c.id)[0];
      const docName = q ? (store.doc(q.documentId) || {}).name || '' : '';
      list.appendChild(el('div', { class: 'review-row' }, [
        el('span', { class: 'legend-dot', style: `background:${c.color}` }),
        el('span', { class: 'review-name', text: c.name }),
        el('span', { class: 'muted tiny', text: docName }),
      ]));
    });
    card.appendChild(list);
    card.appendChild(el('div', { class: 'tiny muted', style: 'margin-top:10px', text: singles.length + ' ' + U.pluralize(singles.length, 'código com 1 ocorrência', 'códigos com 1 ocorrência') }));
    return card;
  }

  // Alcance por participante: em quantos documentos distintos cada código aparece.
  // Transversalidade (código em muitos participantes) > idiossincrasia (só um).
  function reachCard(s) {
    const card = el('div', { class: 'panel-card' });
    card.appendChild(el('h3', { text: 'Alcance por participante' }));
    card.appendChild(el('div', { class: 'tiny muted', style: 'margin:-10px 0 14px', text: 'Em quantos documentos distintos cada código aparece. Códigos transversais a muitos participantes são achados mais fortes.' }));

    const totalDocs = s.documents.length;
    const ranked = s.codes.map(c => {
      const docs = new Set();
      store.quotationsOf(c.id).forEach(q => docs.add(q.documentId));
      return { c, d: docs.size };
    }).filter(o => o.d > 0).sort((a, b) => b.d - a.d).slice(0, 8);
    if (!ranked.length) { card.appendChild(ui.empty('plot', 'Sem dados', 'Codifique trechos em vários documentos para ver o alcance.')); return card; }

    const max = totalDocs || ranked[0].d;
    ranked.forEach(o => {
      card.appendChild(el('div', { class: 'freq-row' }, [
        el('div', { class: 'freq-top' }, [
          el('span', { text: o.c.name }),
          el('span', { class: 'muted', text: o.d + '/' + totalDocs + ' ' + U.pluralize(totalDocs, 'doc', 'docs') }),
        ]),
        el('div', { class: 'freq-bar' }, [el('span', { style: `width:${Math.max(4, (o.d / max) * 100)}%;background:${o.c.color}` })]),
      ]));
    });
    return card;
  }

  QC.screens = QC.screens || {};
  QC.screens.dashboard = { render, scoped: true };
})(window.QC = window.QC || {});
