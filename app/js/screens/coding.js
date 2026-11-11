/* screens/coding.js — workspace de codificação: leitor + destaque + popover + propriedades */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;

  const view = { docId: null, tab: 'docs', selQuotationId: null, selCodeId: null, docSearch: '', codeSearch: '', editing: false };

  function rangeOffset(root, node, off) {
    const r = document.createRange();
    r.setStart(root, 0);
    try { r.setEnd(node, off); } catch (e) { return null; }
    return r.toString().length;
  }

  function render(host) {
    const s = store.state;
    if (!view.docId || !store.doc(view.docId)) view.docId = (s.documents[0] && s.documents[0].id) || null;

    host.innerHTML = '';
    const work = el('div', { class: 'work' });
    work.appendChild(leftSide(s));
    work.appendChild(mainReader(s));
    work.appendChild(rightProps(s));
    host.appendChild(work);
    // fecha popover de seleção ao clicar fora
    closeSelPop();
  }

  // ---------------- LEFT ----------------
  function leftSide(s) {
    const side = el('div', { class: 'work-side' });
    const head = el('div', { class: 'side-head' }, [
      el('div', { class: 'side-tabs' }, [
        tabBtn('docs', 'Documentos'),
        tabBtn('codes', 'Códigos'),
      ]),
      el('div', { class: 'search' }, [
        el('span', { html: QC.icon('retrieval', 16) }),
        el('input', {
          class: 'input', placeholder: view.tab === 'docs' ? 'Filtrar arquivos…' : 'Buscar códigos…',
          value: view.tab === 'docs' ? view.docSearch : view.codeSearch,
          oninput: (e) => { if (view.tab === 'docs') view.docSearch = e.target.value; else view.codeSearch = e.target.value; refreshSideScroll(s); },
        }),
      ]),
    ]);
    side.appendChild(head);

    const scroll = el('div', { class: 'side-scroll', id: 'side-scroll', dataset: { scrollKey: 'cod-side' } });
    side.appendChild(scroll);
    fillSideScroll(scroll, s);

    const foot = el('div', { class: 'side-foot' });
    if (view.tab === 'docs') {
      foot.appendChild(el('button', { class: 'btn btn-outline', style: 'width:100%', onclick: importTxt, html: QC.icon('upload', 16) + '<span>Importar .txt</span>' }));
    } else {
      foot.appendChild(el('button', { class: 'btn btn-outline', style: 'width:100%', onclick: () => createCodeFlow(), html: QC.icon('plus', 16) + '<span>Novo código</span>' }));
    }
    side.appendChild(foot);
    return side;
  }

  function tabBtn(key, label) {
    return el('button', { class: 'side-tab' + (view.tab === key ? ' active' : ''), text: label, onclick: () => { view.tab = key; store.rerender(); } });
  }

  function refreshSideScroll(s) {
    const sc = document.getElementById('side-scroll');
    if (sc) { sc.innerHTML = ''; fillSideScroll(sc, s); }
  }

  async function removeDoc(d) {
    const n = store.quotationsInDoc(d.id).length;
    if (n > 0 && !(await ui.confirm('Remover o documento "' + d.name + '"? Ele tem ' + n + ' ' + U.pluralize(n, 'trecho codificado', 'trechos codificados') + ', que também serão apagados. Dá para desfazer com Ctrl+Z.', { danger: true, okLabel: 'Remover' }))) return;
    if (view.docId === d.id) {
      const other = store.state.documents.find(x => x.id !== d.id);
      view.docId = other ? other.id : null;
      view.selQuotationId = null; view.selCodeId = null;
    }
    store.removeDocument(d.id); // re-renderiza; é desfazível
    ui.toast('Documento removido' + (n ? ' · Ctrl+Z desfaz' : ''));
  }

  function fillSideScroll(scroll, s) {
    if (view.tab === 'docs') {
      const q = view.docSearch.toLowerCase();
      const docs = s.documents.filter(d => d.name.toLowerCase().includes(q));
      if (!docs.length) { scroll.appendChild(el('div', { class: 'muted tiny', style: 'padding:12px', text: s.documents.length ? 'Nada encontrado.' : 'Nenhum documento. Importe um .txt.' })); return; }
      docs.forEach(d => {
        const n = store.quotationsInDoc(d.id).length;
        scroll.appendChild(el('div', {
          class: 'doc-item' + (d.id === view.docId ? ' active' : ''),
          onclick: () => { view.docId = d.id; view.selQuotationId = null; view.selCodeId = null; view.editing = false; store.rerender(); },
        }, [
          el('span', { html: QC.icon('fileText', 16) }),
          el('span', { class: 'chip-label', text: d.name }),
          el('span', { class: 'doc-meta', text: n + ' ' + U.pluralize(n, 'trecho', 'trechos') }),
          el('button', { class: 'doc-del', title: 'Remover documento', onclick: (e) => { e.stopPropagation(); removeDoc(d); }, html: QC.icon('trash', 14) }),
        ]));
      });
    } else {
      const q = view.codeSearch.toLowerCase();
      const match = (catId) => store.codesInCategory(catId).filter(x => x.name.toLowerCase().includes(q));
      const groups = [];
      store.rootCategories().forEach(root => {
        groups.push({ cat: root, depth: 0, codes: match(root.id) });
        store.childCategories(root.id).forEach(sub => groups.push({ cat: sub, depth: 1, codes: match(sub.id) }));
      });
      const orphan = s.codes.filter(c => !c.categoryId && c.name.toLowerCase().includes(q));
      if (orphan.length) groups.push({ cat: { id: null, name: 'Sem categoria' }, depth: 0, codes: orphan });
      let any = false;
      groups.forEach(g => {
        if (!g.codes.length) return;
        any = true;
        scroll.appendChild(el('div', { class: 'code-list-cat', style: g.depth ? 'padding-left:24px' : '' }, [
          el('span', { html: QC.icon('folder', 13) }), el('span', { text: g.cat.name }),
        ]));
        g.codes.forEach(code => {
          scroll.appendChild(el('div', {
            class: 'code-row' + (code.id === view.selCodeId ? ' active' : ''),
            style: g.depth ? 'padding-left:24px' : '',
            onclick: () => { view.selCodeId = code.id; view.selQuotationId = null; store.rerender(); },
          }, [
            el('span', { class: 'chip-dot', style: `background:${code.color}` }),
            el('span', { class: 'chip-label', text: code.name }),
            el('span', { class: 'cnt', text: String(store.codeCount(code.id)) }),
          ]));
        });
      });
      if (!any) scroll.appendChild(el('div', { class: 'muted tiny', style: 'padding:12px', text: s.codes.length ? 'Nada encontrado.' : 'Nenhum código ainda. Selecione um trecho no texto para criar.' }));
    }
  }

  // ---------------- MAIN (reader) ----------------
  function mainReader(s) {
    const main = el('div', { class: 'work-main' });
    const doc = store.doc(view.docId);
    if (!doc) {
      main.appendChild(ui.empty('fileText', 'Nenhum documento aberto',
        'Importe um .txt na coluna à esquerda e clique para abrir.',
        el('button', { class: 'btn btn-primary btn-sm', style: 'margin-top:12px', onclick: importTxt, html: QC.icon('upload', 16) + '<span>Importar .txt</span>' })));
      return main;
    }
    const wrap = el('div', { class: 'reader-wrap', dataset: { scrollKey: 'cod-reader' } });
    const reader = el('div', { class: 'reader' });
    const nQuotes = store.quotationsInDoc(doc.id).length;
    reader.appendChild(el('div', { class: 'reader-head' }, [
      el('div', {}, [
        el('div', { class: 'reader-doc-label', text: 'Documento ativo' }),
        el('h2', { class: 'reader-title', text: doc.name }),
      ]),
      view.editing ? null : el('button', {
        class: 'btn btn-outline btn-sm', title: 'Corrigir digitação ou anonimizar o texto',
        onclick: startEdit, html: QC.icon('fileText', 16) + '<span>Editar texto</span>',
      }),
    ]));
    reader.appendChild(el('div', { class: 'reader-sub' }, [
      el('span', { text: doc.text.length.toLocaleString('pt-BR') + ' caracteres' }),
      el('span', { text: '·' }),
      el('span', { text: nQuotes + ' ' + U.pluralize(nQuotes, 'trecho codificado', 'trechos codificados') }),
    ]));

    if (view.editing) {
      const ta = el('textarea', { class: 'textarea reader-edit', value: doc.text, spellcheck: false });
      reader.appendChild(ta);
      reader.appendChild(el('div', { class: 'reader-edit-bar' }, [
        el('span', { class: 'muted tiny', text: 'Ao salvar, os trechos codificados são reancorados ao novo texto. Ctrl+Z desfaz.' }),
        el('div', { class: 'topbar-spacer' }),
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Cancelar', onclick: cancelEdit }),
        el('button', { class: 'btn btn-primary btn-sm', html: QC.icon('check', 16) + '<span>Salvar</span>', onclick: () => saveEdit(doc, ta.value) }),
      ]));
      wrap.appendChild(reader);
      main.appendChild(wrap);
      return main;
    }

    const textEl = el('div', { class: 'reader-text', id: 'reader-text' });
    buildReaderContent(textEl, doc);
    reader.appendChild(textEl);
    wrap.appendChild(reader);
    main.appendChild(wrap);

    textEl.addEventListener('mouseup', () => onTextMouseUp(textEl, doc));
    return main;
  }

  // ---------------- edição do texto do documento ----------------
  function startEdit() { view.editing = true; view.selQuotationId = null; view.selCodeId = null; closeSelPop(); store.rerender(); }
  function cancelEdit() { view.editing = false; store.rerender(); }
  function saveEdit(doc, newText) {
    const { changes } = store.updateDocumentText(doc.id, newText); // re-renderiza via update()
    view.editing = false;
    store.rerender();
    if (!changes.length) { ui.toast('Texto salvo · Ctrl+Z desfaz', 'ok'); return; }
    showReanchorReport(changes);
  }

  // popup com o antes → depois de cada trecho reancorado (e os removidos em destaque)
  function showReanchorReport(changes) {
    const moved = changes.filter(c => !c.removed);
    const removed = changes.filter(c => c.removed);
    const codesLabel = (names) => names.length ? el('span', { class: 'reanchor-codes', text: names.join(', ') }) : el('span', { class: 'muted tiny', text: 'sem código' });
    const snippet = (t) => (t || '').replace(/\s+/g, ' ').trim();

    const body = el('div', { class: 'reanchor-report' });
    body.appendChild(el('p', { class: 'muted tiny', style: 'margin:0 0 12px', text: 'Confira se os trechos abaixo ainda fazem sentido após a edição. Ctrl+Z desfaz tudo.' }));

    if (moved.length) {
      body.appendChild(el('div', { class: 'reanchor-count', text: moved.length + ' ' + U.pluralize(moved.length, 'trecho reajustado', 'trechos reajustados') }));
      moved.forEach(c => {
        body.appendChild(el('div', { class: 'reanchor-item' }, [
          codesLabel(c.codeNames),
          el('div', { class: 'reanchor-diff' }, [
            el('div', { class: 'reanchor-old' }, [el('span', { class: 'reanchor-tag', text: 'antes' }), el('span', { text: snippet(c.oldText) || '—' })]),
            el('div', { class: 'reanchor-new' }, [el('span', { class: 'reanchor-tag', text: 'depois' }), el('span', { text: snippet(c.newText) || '—' })]),
          ]),
        ]));
      });
    }
    if (removed.length) {
      body.appendChild(el('div', { class: 'reanchor-count danger', html: QC.icon('trash', 15) + '<span>' + removed.length + ' ' + U.pluralize(removed.length, 'trecho removido', 'trechos removidos') + ' (o texto codificado foi apagado)</span>' }));
      removed.forEach(c => {
        body.appendChild(el('div', { class: 'reanchor-item removed' }, [
          codesLabel(c.codeNames),
          el('div', { class: 'reanchor-old' }, [el('span', { class: 'reanchor-tag', text: 'apagado' }), el('span', { text: snippet(c.oldText) || '—' })]),
        ]));
      });
    }

    ui.modal({
      title: 'Edição salva · trechos reancorados',
      size: 'wide',
      body,
      actions: [{ label: 'Entendi', kind: 'btn-primary', onClick: close => close() }],
    });
  }

  // monta o texto com destaques sobrepostos, preservando offsets 1:1
  function buildReaderContent(root, doc) {
    const text = doc.text;
    const quotes = store.quotationsInDoc(doc.id)
      .map(q => ({ ...q, start: U.clamp(q.start, 0, text.length), end: U.clamp(q.end, 0, text.length) }))
      .filter(q => q.end > q.start);

    // breakpoints
    const points = new Set([0, text.length]);
    quotes.forEach(q => { points.add(q.start); points.add(q.end); });
    const bp = Array.from(points).sort((a, b) => a - b);

    for (let i = 0; i < bp.length - 1; i++) {
      const a = bp[i], b = bp[i + 1];
      if (b <= a) continue;
      const seg = text.slice(a, b);
      const covering = quotes.filter(q => q.start <= a && q.end >= b);
      if (!covering.length) { root.appendChild(document.createTextNode(seg)); continue; }
      // cores dos códigos que cobrem o segmento
      const colors = [];
      covering.forEach(q => (q.codeIds || []).forEach(cid => { const c = store.code(cid); if (c && !colors.includes(c.color)) colors.push(c.color); }));
      const base = colors[0] || '#9a98ab';
      const span = el('span', {
        class: 'hl', text: seg,
        dataset: { qids: covering.map(q => q.id).join(',') },
        style: `background:${U.hexToRgba(base, 0.26)};border-bottom:2px solid ${base};`
          + (colors[1] ? `box-shadow: inset 0 -5px 0 -3px ${colors[1]};` : ''),
        onclick: (e) => { e.stopPropagation(); onHighlightClick(covering); },
      });
      if (covering.some(q => q.id === view.selQuotationId)) span.classList.add('sel');
      root.appendChild(span);
    }
  }

  function onHighlightClick(covering) {
    if (covering.length === 1) { selectQuotation(covering[0].id); return; }
    // múltiplos trechos no mesmo ponto: escolher o mais específico ou listar
    const sorted = covering.slice().sort((a, b) => (a.end - a.start) - (b.end - b.start));
    selectQuotation(sorted[0].id);
  }

  function selectQuotation(id) { view.selQuotationId = id; view.selCodeId = null; store.rerender(); }

  // ---------------- seleção de texto -> popover ----------------
  let selPopEl = null;
  function closeSelPop() { if (selPopEl) { selPopEl.remove(); selPopEl = null; } }

  function onTextMouseUp(textEl, doc) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { return; }
    const range = sel.getRangeAt(0);
    if (!textEl.contains(range.startContainer) || !textEl.contains(range.endContainer)) return;
    let start = rangeOffset(textEl, range.startContainer, range.startOffset);
    let end = rangeOffset(textEl, range.endContainer, range.endOffset);
    if (start == null || end == null) return;
    if (start > end) [start, end] = [end, start];
    // apara espaços nas bordas
    const raw = doc.text.slice(start, end);
    const lead = raw.length - raw.replace(/^\s+/, '').length;
    const trail = raw.length - raw.replace(/\s+$/, '').length;
    start += lead; end -= trail;
    if (end - start < 1) return;
    const rect = range.getBoundingClientRect();
    openSelPop(doc, start, end, doc.text.slice(start, end), rect);
  }

  function openSelPop(doc, start, end, text, rect) {
    closeSelPop();
    const s = store.state;
    const codesList = el('div', { class: 'opt-list' });
    function renderCodeOptions(filter) {
      codesList.innerHTML = '';
      const fq = U.fold((filter || '').trim());
      const tokens = fq.split(/\s+/).filter(Boolean);
      const matches = s.codes.filter(c => { const fn = U.fold(c.name); return tokens.every(t => fn.includes(t)); });
      matches.sort((a, b) => (fq && U.fold(a.name).includes(fq) ? 0 : 1) - (fq && U.fold(b.name).includes(fq) ? 0 : 1));
      if (!matches.length) { codesList.appendChild(el('div', { class: 'muted tiny', style: 'padding:6px', text: s.codes.length ? 'Nenhum código corresponde.' : 'Nenhum código existente.' })); return; }
      matches.forEach(c => {
        const nameEl = el('span', { class: 'opt-name' });
        QC.ui.foldHighlight(c.name, tokens).forEach(node => nameEl.appendChild(node));
        codesList.appendChild(el('button', {
          class: 'opt', onclick: () => { applyToSelection(doc, start, end, text, c.id); },
        }, [el('span', { class: 'chip-dot', style: `background:${c.color}` }), nameEl, el('span', { class: 'cnt muted tiny', style: 'margin-left:auto', text: String(store.codeCount(c.id)) })]));
      });
    }

    let chosenColor = store.nextColor();
    const nameInput = el('input', { class: 'input', placeholder: 'Nome do novo código…' });
    const swatches = QC.ui.colorSwatches(chosenColor, c => { chosenColor = c; });
    const searchInput = el('input', { class: 'input', placeholder: 'Filtrar códigos existentes…', oninput: (e) => renderCodeOptions(e.target.value) });

    const pop = el('div', { class: 'sel-pop' }, [
      el('h4', { text: 'Criar código' }),
      el('div', { style: 'display:flex;gap:6px' }, [
        nameInput,
        el('button', { class: 'btn btn-primary btn-sm', html: QC.icon('plus', 16), title: 'Criar e aplicar', onclick: () => {
          const name = nameInput.value.trim(); if (!name) { nameInput.focus(); return; }
          const codeId = store.addCode(name, { color: chosenColor });
          applyToSelection(doc, start, end, text, codeId);
        } }),
      ]),
      el('div', { style: 'margin-top:8px' }, [swatches]),
      el('div', { class: 'sel-divider' }),
      el('h4', { text: 'Aplicar código existente' }),
      searchInput,
      codesList,
      el('div', { class: 'sel-divider' }),
      el('button', { class: 'btn btn-ghost btn-sm', style: 'width:100%', html: QC.icon('memos', 16) + '<span>Marcar trecho e criar memo</span>', onclick: () => {
        const qid = ensureQuotation(doc.id, start, end, text);
        const mid = store.addMemo('Memo sobre trecho');
        store.addMemoLink(mid, 'quotation', qid);
        ui.toast('Trecho marcado + memo criado');
        closeSelPop(); QC.app.go('memos');
      } }),
    ]);
    renderCodeOptions('');
    document.body.appendChild(pop);
    selPopEl = pop;
    // posiciona (position: fixed -> coordenadas de viewport)
    const top = Math.min(rect.bottom + 6, window.innerHeight - pop.offsetHeight - 10);
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 10));
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
    setTimeout(() => {
      const onDoc = (e) => { if (selPopEl && !selPopEl.contains(e.target)) { closeSelPop(); document.removeEventListener('mousedown', onDoc); } };
      document.addEventListener('mousedown', onDoc);
    }, 0);
    nameInput.focus();
  }

  function ensureQuotation(docId, start, end, text) {
    const existing = (store.state.quotations || []).find(q => q.documentId === docId && q.start === start && q.end === end);
    if (existing) return existing.id;
    return store.addQuotation(docId, start, end, text);
  }
  function applyToSelection(doc, start, end, text, codeId) {
    const qid = ensureQuotation(doc.id, start, end, text);
    view.selQuotationId = qid; view.selCodeId = null; // define antes do render final
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    closeSelPop();
    store.applyCodeToQuotation(qid, codeId); // re-renderiza já com o trecho selecionado
  }

  // ---------------- RIGHT (props) ----------------
  function rightProps(s) {
    const side = el('div', { class: 'work-side right' });
    const props = el('div', { class: 'props', dataset: { scrollKey: 'cod-props' } });

    if (view.selQuotationId && store.quotation(view.selQuotationId)) {
      const q = store.quotation(view.selQuotationId);
      props.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between' }, [
        el('h3', { text: 'Trecho selecionado' }),
        el('button', { class: 'icon-btn', html: QC.icon('trash', 16), title: 'Remover trecho', onclick: async () => {
          if (await ui.confirm('Remover este trecho e suas codificações?', { danger: true, okLabel: 'Remover' })) {
            store.update(st => { st.quotations = st.quotations.filter(x => x.id !== q.id); });
            view.selQuotationId = null; store.rerender();
          }
        } }),
      ]));
      props.appendChild(el('div', { class: 'quote-box', text: q.text }));

      props.appendChild(el('div', { class: 'prop-block' }, [
        el('label', { class: 'field-label', text: 'Códigos aplicados' }),
        chipsForQuotation(q),
      ]));

      props.appendChild(el('div', { class: 'prop-block' }, [
        el('label', { class: 'field-label', text: 'Comentário' }),
        el('textarea', { class: 'textarea', rows: 3, placeholder: 'Nota sobre este trecho…', value: q.comment || '',
          oninput: (e) => store.setQuotationComment(q.id, e.target.value, false) }),
      ]));

      props.appendChild(el('button', { class: 'btn btn-ghost btn-sm', html: QC.icon('memos', 16) + '<span>Criar memo deste trecho</span>', onclick: () => {
        const mid = store.addMemo('Memo sobre trecho'); store.addMemoLink(mid, 'quotation', q.id); ui.toast('Memo criado'); QC.app.go('memos');
      } }));
    } else if (view.selCodeId && store.code(view.selCodeId)) {
      const c = store.code(view.selCodeId);
      const n = store.codeCount(c.id);
      props.appendChild(el('h3', { text: 'Código' }));
      props.appendChild(el('div', { style: 'margin:8px 0 14px' }, [QC.ui.codeChip(c)]));
      props.appendChild(el('div', { class: 'prop-block', style: 'margin-bottom:10px' }, [
        el('label', { class: 'field-label', text: 'Nome' }),
        el('input', { class: 'input', value: c.name, onchange: (e) => store.updateCode(c.id, { name: e.target.value.trim() || c.name }) }),
      ]));
      const cat = c.categoryId ? store.category(c.categoryId) : null;
      const parent = cat && cat.parentId ? store.category(cat.parentId) : null;
      const meta = (k, v) => el('div', { class: 'prop-block', style: 'margin-bottom:10px' }, [el('label', { class: 'field-label', text: k }), el('div', { text: v })]);
      props.appendChild(meta('Categoria', cat ? (parent ? parent.name + ' > ' + cat.name : cat.name) : 'Sem categoria'));
      props.appendChild(meta('Ocorrências', n + ' ' + U.pluralize(n, 'trecho', 'trechos')));
      props.appendChild(el('button', { class: 'btn btn-primary btn-sm', style: 'width:100%;margin-top:6px', html: QC.icon('retrieval', 16) + '<span>Ver todas as ocorrências</span>', onclick: () => { QC.app.go('retrieval', { codeId: c.id }); } }));
      props.appendChild(el('button', { class: 'btn btn-ghost btn-sm', style: 'width:100%;margin-top:6px', html: QC.icon('codebook', 16) + '<span>Editar no Codebook</span>', onclick: () => QC.app.go('codebook', { codeId: c.id }) }));
    } else {
      props.appendChild(ui.empty('quote', 'Nada selecionado', 'Selecione um trecho destacado no texto, ou um código na lista, para ver detalhes aqui.'));
    }
    side.appendChild(props);
    return side;
  }

  function chipsForQuotation(q) {
    const wrap = el('div', { class: 'chips-wrap' });
    (q.codeIds || []).forEach(cid => {
      const c = store.code(cid); if (!c) return;
      wrap.appendChild(QC.ui.codeChip(c, { removable: true, onRemove: () => { store.removeCodeFromQuotation(q.id, cid); if (!store.quotation(q.id)) view.selQuotationId = null; } }));
    });
    wrap.appendChild(el('button', { class: 'cat-add-inline', html: QC.icon('plus', 13) + '<span>código</span>', onclick: (e) => addCodeMenu(e.currentTarget, q) }));
    return wrap;
  }

  function addCodeMenu(anchor, q) {
    const avail = store.state.codes.filter(c => !(q.codeIds || []).includes(c.id));
    ui.codePicker(anchor, {
      codes: avail,
      onPick: (c) => store.applyCodeToQuotation(q.id, c.id),
      onCreate: async (name) => {
        if (!name) name = await ui.prompt({ title: 'Novo código', label: 'Nome', okLabel: 'Criar e aplicar' });
        if (name) { const id = store.addCode(name); store.applyCodeToQuotation(q.id, id); }
      },
    });
  }

  // ---------------- ações ----------------
  async function importTxt() {
    const files = await ui.pickFiles('.txt,text/plain', true);
    if (!files.length) return;
    let lastId = null;
    for (const f of files) {
      try { const text = await ui.readFileText(f); lastId = store.addDocument(f.name.replace(/\.txt$/i, '') + '.txt', text); }
      catch (e) { ui.toast('Falha ao ler ' + f.name, 'error'); }
    }
    if (lastId) { view.docId = lastId; view.tab = 'docs'; store.rerender(); ui.toast(files.length + ' ' + U.pluralize(files.length, 'documento importado', 'documentos importados'), 'ok'); }
  }

  async function createCodeFlow() {
    const name = await ui.prompt({ title: 'Novo código', label: 'Nome do código', okLabel: 'Criar' });
    if (name) { const id = store.addCode(name); view.selCodeId = id; view.tab = 'codes'; store.rerender(); }
  }

  function onEnter(params) {
    view.editing = false;
    if (params && params.docId) view.docId = params.docId;
    if (params && params.quotationId) { view.selQuotationId = params.quotationId; const q = store.quotation(params.quotationId); if (q) view.docId = q.documentId; }
    if (params && params.codeId) { view.selCodeId = params.codeId; view.tab = 'codes'; }
  }

  QC.screens = QC.screens || {};
  QC.screens.coding = { render, onEnter, scoped: true };
})(window.QC = window.QC || {});
