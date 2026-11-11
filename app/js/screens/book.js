/* screens/book.js — livro de códigos em modo leitura: codebook completo com TODOS os trechos */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;

  const view = { search: '' };

  function render(host) {
    const s = store.state;
    host.innerHTML = '';
    const wrap = el('div', { class: 'book' });

    wrap.appendChild(el('div', { class: 'topbar' }, [
      el('h1', { text: 'Livro de Códigos' }),
      el('span', { class: 'crumb', text: s.name }),
      el('div', { class: 'topbar-spacer' }),
      el('div', { class: 'search', style: 'width:240px' }, [
        el('span', { html: QC.icon('retrieval', 16) }),
        el('input', { class: 'input', placeholder: 'Filtrar códigos…', value: view.search, oninput: (e) => { view.search = e.target.value; rebuild(store.state); } }),
      ]),
      el('button', { class: 'btn btn-outline btn-sm', onclick: (e) => exportMenu(e.currentTarget), html: QC.icon('download', 16) + '<span>Exportar</span>' }),
    ]));

    const scroll = el('div', { class: 'book-scroll', dataset: { scrollKey: 'book' } });
    scroll.appendChild(el('div', { class: 'book-page', id: 'book-page' }));
    wrap.appendChild(scroll);
    host.appendChild(wrap);
    rebuild(s);
  }

  // mesma ordem do export .md: raiz → subcategorias ("Pai › Filha") → sem categoria
  function groupsOf(s) {
    const groups = [];
    store.rootCategories().forEach(root => {
      groups.push({ cat: root, root: null, codes: store.codesInCategory(root.id) });
      store.childCategories(root.id).forEach(sub => {
        groups.push({ cat: sub, root, codes: store.codesInCategory(sub.id) });
      });
    });
    const orphan = s.codes.filter(c => !c.categoryId);
    if (orphan.length) groups.push({ cat: { name: 'Sem categoria', color: '#94a3b8', deductive: false }, root: null, codes: orphan });

    const f = view.search.trim().toLowerCase();
    groups.forEach(g => {
      g.codes = g.codes
        .filter(c => !f || c.name.toLowerCase().includes(f) || (c.comment || '').toLowerCase().includes(f))
        .sort((a, b) => store.codeCount(b.id) - store.codeCount(a.id) || a.name.localeCompare(b.name, 'pt'));
    });
    return groups.filter(g => g.codes.length);
  }

  function rebuild(s) {
    const page = document.getElementById('book-page');
    if (!page) return;
    page.innerHTML = '';

    const nQuotes = (s.quotations || []).length;
    page.appendChild(el('h2', { class: 'book-title', text: s.name }));
    page.appendChild(el('div', {
      class: 'book-meta',
      text: s.codes.length + ' ' + U.pluralize(s.codes.length, 'código', 'códigos')
        + ' · ' + s.categories.length + ' ' + U.pluralize(s.categories.length, 'categoria', 'categorias')
        + ' · ' + nQuotes + ' ' + U.pluralize(nQuotes, 'trecho codificado', 'trechos codificados'),
    }));

    if (!s.codes.length) {
      page.appendChild(ui.empty('bookOpen', 'Codebook vazio', 'Crie códigos na tela de Codificação para montar o livro.'));
      return;
    }
    const groups = groupsOf(s);
    if (!groups.length) {
      page.appendChild(ui.empty('retrieval', 'Nada encontrado', 'Nenhum código corresponde ao filtro.'));
      return;
    }

    if (groups.length > 1) {
      const toc = el('nav', { class: 'book-toc' }, [el('div', { class: 'toc-title', text: 'Sumário' })]);
      groups.forEach((g, i) => {
        toc.appendChild(el('button', {
          class: 'toc-item',
          onclick: () => { const t = document.getElementById('book-cat-' + i); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        }, [
          el('span', { class: 'chip-dot', style: `background:${g.cat.color}` }),
          el('span', { text: (g.root ? g.root.name + ' › ' : '') + g.cat.name }),
          el('span', { class: 'muted tiny', style: 'margin-left:auto', text: g.codes.length + ' ' + U.pluralize(g.codes.length, 'código', 'códigos') }),
        ]));
      });
      page.appendChild(toc);
    }

    groups.forEach((g, i) => page.appendChild(catSection(g, i)));
  }

  function catSection(g, i) {
    const sec = el('section', { class: 'book-cat', id: 'book-cat-' + i });
    sec.appendChild(el('div', { class: 'book-cat-head' }, [
      el('span', { class: 'book-cat-dot', style: `background:${g.cat.color}` }),
      el('h2', {}, [
        g.root ? el('span', { class: 'book-cat-root', text: g.root.name + ' › ' }) : null,
        el('span', { text: g.cat.name }),
      ]),
      g.cat.deductive ? el('span', { class: 'badge', text: 'Dedutiva' }) : null,
    ]));
    g.codes.forEach(c => sec.appendChild(codeEntry(c)));
    return sec;
  }

  function codeEntry(c) {
    const qs = store.quotationsOf(c.id).slice().sort((a, b) =>
      docName(a.documentId).localeCompare(docName(b.documentId), 'pt') || a.start - b.start);

    const entry = el('article', { class: 'book-code' });
    entry.appendChild(el('div', { class: 'book-code-head' }, [
      el('span', { class: 'chip-dot', style: `background:${c.color}` }),
      el('h3', { text: c.name }),
      el('span', { class: 'book-count', text: qs.length + ' ' + U.pluralize(qs.length, 'ocorrência', 'ocorrências') }),
    ]));
    entry.appendChild(el('div', { class: 'book-def' }, [
      el('span', { class: 'book-label', text: 'Definição: ' }),
      el('span', { class: c.comment ? '' : 'muted', text: c.comment || '—' }),
    ]));

    if (qs.length) {
      const list = el('div', { class: 'book-quotes' });
      qs.forEach(q => list.appendChild(quoteBlock(q, c)));
      entry.appendChild(list);
    } else {
      entry.appendChild(el('div', { class: 'muted tiny', text: 'Nenhum trecho codificado.' }));
    }
    return entry;
  }

  function quoteBlock(q, c) {
    return el('blockquote', { class: 'book-quote', style: `border-left-color:${c.color}` }, [
      el('div', { class: 'bq-text', text: '“' + q.text.replace(/\s+/g, ' ').trim() + '”' }),
      el('div', { class: 'bq-src', text: '— ' + docName(q.documentId) + (q.comment && q.comment.trim() ? ' · 💬 ' + q.comment.trim() : '') }),
    ]);
  }

  function docName(id) { const d = store.doc(id); return d ? d.name : '—'; }

  function exportMenu(anchor) {
    if (!store.state.codes.length) { ui.toast('Nenhum código para exportar', 'error'); return; }
    ui.menu(anchor, [
      { label: 'Markdown (.md)', icon: 'fileText', onClick: () => { QC.seed.exportCodebook(store.state, 'md'); ui.toast('Livro de códigos exportado', 'ok'); } },
      { label: 'CSV (.csv)', icon: 'list', onClick: () => { QC.seed.exportCodebook(store.state, 'csv'); ui.toast('Livro de códigos exportado', 'ok'); } },
    ]);
  }

  QC.screens = QC.screens || {};
  QC.screens.book = { render, scoped: true };
})(window.QC = window.QC || {});
