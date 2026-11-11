/* screens/retrieval.js — recuperação de trechos por código/categoria (tabela de evidências) */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;

  const view = { codes: new Set(), cats: new Set(), docId: '', search: '', logic: 'OR' };

  function render(host) {
    const s = store.state;
    host.innerHTML = '';
    const row = el('div', { class: 'retr' });
    row.appendChild(filters(s));
    row.appendChild(el('div', { class: 'retr-main', id: 'retr-main' }));
    host.appendChild(row);
    buildMain(s);
  }

  function buildMain(s) {
    const main = document.getElementById('retr-main');
    if (!main) return;
    main.innerHTML = '';
    const results = computeResults(s);
    main.appendChild(el('div', { class: 'retr-head' }, [
      el('h1', { text: 'Resultados' }),
      el('span', { class: 'crumb', text: results.length + ' ' + U.pluralize(results.length, 'trecho encontrado', 'trechos encontrados') }),
      el('div', { class: 'topbar-spacer' }),
      el('button', { class: 'btn btn-outline btn-sm', onclick: () => exportResults(results, 'csv'), html: QC.icon('download', 16) + '<span>CSV</span>' }),
      el('button', { class: 'btn btn-outline btn-sm', onclick: () => exportResults(results, 'md'), html: QC.icon('download', 16) + '<span>Markdown</span>' }),
    ]));
    const list = el('div', { class: 'retr-list' });
    if (!results.length) {
      list.appendChild(ui.empty('retrieval', 'Nenhum trecho', s.quotations.length ? 'Ajuste os filtros à esquerda.' : 'Codifique trechos na tela de Codificação para vê-los aqui.'));
    } else {
      results.forEach(q => list.appendChild(quoteCard(q, s)));
    }
    main.appendChild(list);
  }

  function computeResults(s) {
    const f = view.search.toLowerCase();
    return s.quotations.filter(q => {
      if (view.docId && q.documentId !== view.docId) return false;
      if (f && !q.text.toLowerCase().includes(f)) return false;
      const codeSet = new Set(q.codeIds || []);
      // expande categorias selecionadas em códigos (incluindo subcategorias)
      const wantedCodes = new Set(view.codes);
      view.cats.forEach(catId => store.codesInCategoryDeep(catId).forEach(c => wantedCodes.add(c.id)));
      if (wantedCodes.size === 0) return true; // sem filtro de código => todos (respeitando doc/busca)
      const hits = [...wantedCodes].filter(cid => codeSet.has(cid));
      return view.logic === 'AND' ? hits.length === wantedCodes.size : hits.length > 0;
    }).sort((a, b) => a.documentId.localeCompare(b.documentId) || a.start - b.start);
  }

  function filters(s) {
    const side = el('div', { class: 'retr-filters' });
    side.appendChild(el('label', { class: 'section-label', text: 'Filtrar por código' }));
    side.appendChild(el('div', { class: 'search', style: 'margin:8px 0 12px' }, [
      el('span', { html: QC.icon('retrieval', 16) }),
      el('input', { class: 'input', placeholder: 'Buscar no texto…', value: view.search, oninput: (e) => { view.search = e.target.value; debouncedMain(); } }),
    ]));

    // árvore de códigos por categoria (raiz > subcategoria)
    const tree = el('div', { class: 'filter-tree' });
    const catNode = (cat, depth) => el('label', { class: 'filter-node', style: depth ? 'padding-left:22px' : '' }, [
      el('input', { type: 'checkbox', class: 'checkbox', checked: view.cats.has(cat.id), onchange: (e) => { e.target.checked ? view.cats.add(cat.id) : view.cats.delete(cat.id); store.rerender(); } }),
      el('span', { class: 'chip-dot', style: `background:${cat.color}` }),
      el('span', { style: 'font-weight:600', text: cat.name }),
      el('span', { class: 'muted tiny', style: 'margin-left:auto', text: String(store.codesInCategoryDeep(cat.id).length) }),
    ]);
    store.rootCategories().forEach(cat => {
      tree.appendChild(catNode(cat, 0));
      store.codesInCategory(cat.id).forEach(c => tree.appendChild(codeFilterNode(c, 1)));
      store.childCategories(cat.id).forEach(sub => {
        tree.appendChild(catNode(sub, 1));
        store.codesInCategory(sub.id).forEach(c => tree.appendChild(codeFilterNode(c, 2)));
      });
    });
    const orphan = s.codes.filter(c => !c.categoryId);
    if (orphan.length) {
      tree.appendChild(el('label', { class: 'filter-node', style: 'font-weight:600;margin-top:6px', text: 'Sem categoria' }));
      orphan.forEach(c => tree.appendChild(codeFilterNode(c, 1)));
    }
    if (!s.codes.length) tree.appendChild(el('div', { class: 'muted tiny', style: 'padding:8px', text: 'Nenhum código ainda.' }));
    side.appendChild(tree);

    // operador lógico
    side.appendChild(el('label', { class: 'section-label', style: 'margin-top:18px', text: 'Operador lógico' }));
    side.appendChild(el('div', { class: 'side-tabs', style: 'margin-top:8px' }, [
      el('button', { class: 'side-tab' + (view.logic === 'OR' ? ' active' : ''), text: 'OU (qualquer)', onclick: () => { view.logic = 'OR'; store.rerender(); } }),
      el('button', { class: 'side-tab' + (view.logic === 'AND' ? ' active' : ''), text: 'E (todos)', onclick: () => { view.logic = 'AND'; store.rerender(); } }),
    ]));

    // documento
    side.appendChild(el('label', { class: 'section-label', style: 'margin-top:18px', text: 'Documento' }));
    side.appendChild(el('select', { class: 'select', style: 'margin-top:8px', onchange: (e) => { view.docId = e.target.value; store.rerender(); } }, [
      el('option', { value: '', text: 'Todos os documentos' }),
      ...s.documents.map(d => el('option', { value: d.id, text: d.name, selected: d.id === view.docId })),
    ]));

    if (view.codes.size || view.cats.size || view.docId || view.search) {
      side.appendChild(el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:16px;width:100%', text: 'Limpar filtros', onclick: () => { view.codes.clear(); view.cats.clear(); view.docId = ''; view.search = ''; store.rerender(); } }));
    }
    return side;
  }

  function codeFilterNode(c, depth) {
    return el('label', { class: 'filter-node child', style: depth > 1 ? 'padding-left:40px' : '' }, [
      el('input', { type: 'checkbox', class: 'checkbox', checked: view.codes.has(c.id), onchange: (e) => { e.target.checked ? view.codes.add(c.id) : view.codes.delete(c.id); store.rerender(); } }),
      el('span', { class: 'chip-dot', style: `background:${c.color}` }),
      el('span', { text: c.name }),
      el('span', { class: 'muted tiny', style: 'margin-left:auto', text: String(store.codeCount(c.id)) }),
    ]);
  }

  function quoteCard(q, s) {
    const doc = store.doc(q.documentId);
    const ctxBefore = doc ? doc.text.slice(Math.max(0, q.start - 60), q.start) : '';
    const ctxAfter = doc ? doc.text.slice(q.end, q.end + 60) : '';
    const card = el('div', { class: 'quote-card' });
    card.appendChild(el('div', { class: 'qc-src' }, [
      el('span', { html: QC.icon('fileText', 15) }),
      el('span', { text: doc ? doc.name : '—' }),
      el('div', { class: 'topbar-spacer' }),
      el('button', { class: 'icon-btn', title: 'Abrir na codificação', html: QC.icon('coding', 15), onclick: () => QC.app.go('coding', { quotationId: q.id }) }),
    ]));
    card.appendChild(el('div', { class: 'qc-text' }, [
      el('span', { class: 'qc-ctx', text: ctxBefore ? '…' + ctxBefore : '' }),
      el('span', { html: ` <strong>${U.escapeHtml(q.text)}</strong> ` }),
      el('span', { class: 'qc-ctx', text: ctxAfter ? ctxAfter + '…' : '' }),
    ]));
    const chips = el('div', { class: 'chips-wrap' });
    (q.codeIds || []).forEach(cid => { const c = store.code(cid); if (c) chips.appendChild(ui.codeChip(c)); });
    card.appendChild(chips);
    if (q.comment) card.appendChild(el('div', { class: 'tiny muted', style: 'margin-top:8px;font-style:italic', text: '💬 ' + q.comment }));
    return card;
  }

  function exportResults(results, fmt) {
    const codeName = (id) => { const c = store.code(id); return c ? c.name : id; };
    const docName = (id) => { const d = store.doc(id); return d ? d.name : id; };
    if (fmt === 'csv') {
      const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const rows = [['documento', 'codigos', 'trecho', 'comentario', 'inicio', 'fim']];
      results.forEach(q => rows.push([docName(q.documentId), (q.codeIds || []).map(codeName).join('; '), q.text, q.comment || '', q.start, q.end]));
      U.downloadFile('trechos_qualicode.csv', '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n'), 'text/csv');
    } else {
      let md = `# Trechos — ${store.state.name}\n\n_${results.length} trechos_\n\n`;
      // agrupa por código (primeiro código)
      const byCode = {};
      results.forEach(q => { const key = (q.codeIds && q.codeIds[0]) ? codeName(q.codeIds[0]) : 'Sem código'; (byCode[key] = byCode[key] || []).push(q); });
      Object.keys(byCode).sort().forEach(k => {
        md += `## ${k}\n\n`;
        byCode[k].forEach(q => {
          md += `> ${q.text.replace(/\n/g, ' ')}\n>\n> — *${docName(q.documentId)}*`;
          const codes = (q.codeIds || []).map(codeName).join(', ');
          if (codes) md += ` · códigos: ${codes}`;
          if (q.comment) md += `\n>\n> 💬 ${q.comment}`;
          md += `\n\n`;
        });
      });
      U.downloadFile('trechos_qualicode.md', md, 'text/markdown');
    }
    ui.toast('Exportado (' + results.length + ' trechos)', 'ok');
  }

  const debouncedMain = U.debounce(() => buildMain(store.state), 200);

  function onEnter(params) {
    if (params && params.codeId) { view.codes = new Set([params.codeId]); view.cats = new Set(); }
    if (params && params.catId) { view.cats = new Set([params.catId]); }
  }

  QC.screens = QC.screens || {};
  QC.screens.retrieval = { render, onEnter, scoped: true };
})(window.QC = window.QC || {});
