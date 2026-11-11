/* screens/codebook.js — códigos organizados em categorias (axial: árvore) + propriedades */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;

  const view = { selCodeId: null, selCatId: null, collapsed: {}, search: '' };
  let dragCodeId = null;

  function render(host) {
    const s = store.state;
    host.innerHTML = '';

    const top = el('div', { class: 'topbar' }, [
      el('h1', { text: 'Codebook' }),
      el('span', { class: 'crumb', text: s.name }),
      el('div', { class: 'topbar-spacer' }),
      el('div', { class: 'search', style: 'width:240px' }, [
        el('span', { html: QC.icon('retrieval', 16) }),
        el('input', { class: 'input', placeholder: 'Buscar códigos…', value: view.search, oninput: (e) => { view.search = e.target.value; rebuild(s); } }),
      ]),
      el('button', { class: 'btn btn-primary', onclick: newCode, html: QC.icon('plus', 16) + '<span>Novo código</span>' }),
    ]);
    host.appendChild(top);

    const body = el('div', { class: 'codebook' });
    body.appendChild(el('div', { class: 'cb-toolbar' }, [
      el('button', { class: 'btn btn-outline btn-sm', onclick: newCategory, html: QC.icon('folder', 16) + '<span>Nova categoria</span>' }),
      el('button', { class: 'btn btn-outline btn-sm', onclick: (e) => exportMenu(e.currentTarget), html: QC.icon('download', 16) + '<span>Exportar codebook</span>' }),
      el('div', { class: 'right' }, [
        el('span', { text: s.codes.length + ' códigos no total' }),
        el('span', { text: s.categories.length + ' ' + U.pluralize(s.categories.length, 'categoria', 'categorias') }),
      ]),
    ]));

    body.appendChild(el('div', { class: 'cb-layout', id: 'cb-layout' }, [
      el('div', { id: 'cb-tree' }),
      el('div', { id: 'cb-props' }),
    ]));
    host.appendChild(body);
    rebuild(s);
  }

  function rebuild(s) {
    const tree = document.getElementById('cb-tree');
    const props = document.getElementById('cb-props');
    if (!tree || !props) return;
    tree.innerHTML = ''; props.innerHTML = '';
    buildTree(tree, s);
    buildProps(props, s);
    // em telas estreitas o painel vira drawer: só abre quando há seleção
    const hasSel = !!((view.selCodeId && store.code(view.selCodeId)) || (view.selCatId && store.category(view.selCatId)));
    props.classList.toggle('open', hasSel);
  }

  function buildTree(tree, s) {
    const f = view.search.toLowerCase();
    const matchCodes = (catId) => store.codesInCategory(catId)
      .filter(c => c.name.toLowerCase().includes(f))
      .sort((a, b) => store.codeCount(b.id) - store.codeCount(a.id));
    store.rootCategories().forEach(cat => {
      const codes = matchCodes(cat.id);
      const subs = store.childCategories(cat.id)
        .map(sub => ({ sub, codes: matchCodes(sub.id) }))
        .filter(x => !f || x.codes.length || x.sub.name.toLowerCase().includes(f));
      if (f && !codes.length && !subs.length && !cat.name.toLowerCase().includes(f)) return;
      tree.appendChild(catBlock(cat, codes, subs));
    });

    // sem categoria
    const orphan = s.codes.filter(c => !c.categoryId && c.name.toLowerCase().includes(f))
      .sort((a, b) => store.codeCount(b.id) - store.codeCount(a.id));
    const drop = el('div', { class: 'uncat-drop' }, orphan.length
      ? wrapCodes(orphan, null)
      : [el('span', { text: 'Arraste códigos aqui para deixá-los sem categoria' })]);
    makeDropTarget(drop, null);
    tree.appendChild(el('div', { style: 'margin-top:8px' }, [
      el('label', { class: 'field-label', text: 'Sem categoria' }), drop,
    ]));
  }

  function catBlock(cat, codes, subs) {
    const isSub = !!cat.parentId;
    const collapsed = !!view.collapsed[cat.id];
    const codesWrap = el('div', { class: 'cat-codes' }, codes.length ? codeChips(codes, cat.id) : [
      el('span', { class: 'muted tiny', text: 'Nenhum código.' }),
    ]);
    // botão adicionar inline
    codesWrap.appendChild(el('button', { class: 'cat-add-inline', html: QC.icon('plus', 13) + '<span>Adicionar</span>', onclick: () => newCode(cat.id) }));
    makeDropTarget(codesWrap, cat.id);

    const nDeep = store.codesInCategoryDeep(cat.id).length;
    const block = el('div', { class: 'cat-block' + (isSub ? ' sub' : '') }, [
      el('div', { class: 'cat-head' }, [
        el('button', { class: 'cat-toggle', html: QC.icon(collapsed ? 'chevronRight' : 'chevronDown', 18), onclick: () => { view.collapsed[cat.id] = !collapsed; store.rerender(); } }),
        el('span', { class: 'cat-dot', style: `background:${cat.color}` }),
        el('span', { class: 'cat-name', text: cat.name, onclick: () => { view.selCatId = cat.id; view.selCodeId = null; rebuild(store.state); } }),
        cat.deductive ? el('span', { class: 'badge', text: 'Dedutiva' }) : null,
        el('span', { class: 'muted tiny', style: 'margin-left:8px', text: nDeep + '' }),
        el('div', { class: 'cat-actions' }, [
          isSub ? null : el('button', { class: 'icon-btn', title: 'Nova subcategoria', html: QC.icon('plusCircle', 15), onclick: () => newCategory(cat.id) }),
          el('button', { class: 'icon-btn', title: 'Editar', html: QC.icon('edit', 15), onclick: () => { view.selCatId = cat.id; view.selCodeId = null; rebuild(store.state); } }),
          el('button', { class: 'icon-btn', title: 'Excluir', html: QC.icon('trash', 15), onclick: () => delCategory(cat) }),
        ]),
      ]),
      collapsed ? null : codesWrap,
      collapsed || !subs || !subs.length ? null
        : el('div', { class: 'cat-subs' }, subs.map(x => catBlock(x.sub, x.codes))),
    ]);
    return block;
  }

  function codeChips(codes, catId) { return codes.map(c => codeChip(c)); }
  function wrapCodes(codes, catId) { return codes.map(c => codeChip(c)); }

  function codeChip(c) {
    const chip = ui.codeChip(c, { count: store.codeCount(c.id), button: true, onClick: () => { view.selCodeId = c.id; view.selCatId = null; rebuild(store.state); } });
    chip.classList.add('code-pill');
    chip.setAttribute('draggable', 'true');
    chip.addEventListener('dragstart', (e) => { dragCodeId = c.id; chip.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    chip.addEventListener('dragend', () => { dragCodeId = null; chip.classList.remove('dragging'); });
    if (c.id === view.selCodeId) chip.style.outline = '2px solid var(--indigo)';
    return chip;
  }

  function makeDropTarget(node, catId) {
    node.addEventListener('dragover', (e) => { e.preventDefault(); node.classList.add('drop'); e.dataTransfer.dropEffect = 'move'; });
    node.addEventListener('dragleave', () => node.classList.remove('drop'));
    node.addEventListener('drop', (e) => {
      e.preventDefault(); node.classList.remove('drop');
      if (dragCodeId) { store.updateCode(dragCodeId, { categoryId: catId }); }
    });
  }

  // ---------------- props ----------------
  function buildProps(props, s) {
    const card = el('div', { class: 'cb-props' });
    if (view.selCodeId && store.code(view.selCodeId)) {
      codeProps(card, store.code(view.selCodeId), s);
    } else if (view.selCatId && store.category(view.selCatId)) {
      catProps(card, store.category(view.selCatId), s);
    } else {
      card.appendChild(ui.empty('tag', 'Selecione um item', 'Clique num código ou categoria para editar as propriedades.'));
    }
    props.appendChild(card);
  }

  function codeProps(card, c, s) {
    card.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px' }, [
      el('h3', { style: 'margin:0;font-size:15px', text: 'Propriedades' }),
      el('button', { class: 'icon-btn', html: QC.icon('x', 16), onclick: () => { view.selCodeId = null; rebuild(s); } }),
    ]));

    card.appendChild(el('label', { class: 'field-label', text: 'Nome do código' }));
    const nameI = el('input', { class: 'input', value: c.name, onchange: (e) => store.updateCode(c.id, { name: e.target.value.trim() || c.name }, false) });
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [nameI]));

    card.appendChild(el('label', { class: 'field-label', text: 'Cor de destaque' }));
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [QC.ui.colorSwatches(c.color, col => store.updateCode(c.id, { color: col }))]));

    card.appendChild(el('label', { class: 'field-label', text: 'Categoria' }));
    const catOptions = [];
    store.rootCategories().forEach(root => {
      catOptions.push(el('option', { value: root.id, text: root.name, selected: root.id === c.categoryId }));
      store.childCategories(root.id).forEach(sub =>
        catOptions.push(el('option', { value: sub.id, text: root.name + ' > ' + sub.name, selected: sub.id === c.categoryId })));
    });
    const sel = el('select', { class: 'select', onchange: (e) => store.updateCode(c.id, { categoryId: e.target.value || null }) }, [
      el('option', { value: '', text: 'Sem categoria' }),
      ...catOptions,
    ]);
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [sel]));

    card.appendChild(el('label', { class: 'field-label', text: 'Definição' }));
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [
      el('textarea', { class: 'textarea', rows: 2, value: c.comment || '', placeholder: 'Definição do código…', oninput: (e) => store.updateCode(c.id, { comment: e.target.value }, false) }),
    ]));

    // co-ocorre mais com
    const others = s.codes.filter(x => x.id !== c.id).map(x => ({ x, n: store.coOccurrence(c.id, x.id) })).filter(o => o.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
    const total = store.codeCount(c.id) || 1;
    if (others.length) {
      card.appendChild(el('label', { class: 'field-label', html: QC.icon('network', 13) + ' Co-ocorre mais com' }));
      others.forEach(o => {
        const pct = Math.round((o.n / total) * 100);
        card.appendChild(el('div', { class: 'cooc-row' }, [
          el('span', { class: 'chip-dot', style: `background:${o.x.color}` }),
          el('span', { class: 'chip-label', style: 'flex:1', text: o.x.name }),
          el('span', { class: 'cooc-pct', text: pct + '%' }),
        ]));
      });
      card.appendChild(el('div', { style: 'height:10px' }));
    }

    card.appendChild(el('button', { class: 'btn btn-outline btn-sm', style: 'width:100%;margin-bottom:8px', html: QC.icon('merge', 16) + '<span>Mesclar em outro código</span>', onclick: (e) => mergeMenu(e.currentTarget, c, s) }));
    card.appendChild(el('button', { class: 'btn btn-outline btn-sm', style: 'width:100%;margin-bottom:8px', html: QC.icon('retrieval', 16) + '<span>Ver ocorrências</span>', onclick: () => QC.app.go('retrieval', { codeId: c.id }) }));
    card.appendChild(el('button', { class: 'btn btn-danger btn-outline btn-sm', style: 'width:100%', html: QC.icon('trash', 16) + '<span>Excluir código</span>', onclick: async () => {
      if (await ui.confirm('Excluir o código "' + c.name + '"? Ele será removido de todos os trechos.', { danger: true, okLabel: 'Excluir' })) { store.removeCode(c.id); view.selCodeId = null; rebuild(store.state); }
    } }));
  }

  function mergeMenu(anchor, c, s) {
    // picker com busca; alvos que mais co-ocorrem com o código vêm primeiro
    const candidates = s.codes.filter(x => x.id !== c.id)
      .map(x => ({ x, n: store.coOccurrence(c.id, x.id) }))
      .sort((a, b) => (b.n - a.n) || a.x.name.localeCompare(b.x.name, 'pt'))
      .map(o => o.x);
    if (!candidates.length) { ui.toast('Não há outro código para mesclar', 'error'); return; }
    ui.codePicker(anchor, {
      codes: candidates,
      allowCreate: false,
      onPick: async (x) => {
        if (await ui.confirm('Mesclar "' + c.name + '" em "' + x.name + '"? Os trechos de "' + c.name + '" passam para "' + x.name + '" e "' + c.name + '" é removido.', { okLabel: 'Mesclar' })) { store.mergeCodes(c.id, x.id); view.selCodeId = x.id; rebuild(store.state); }
      },
    });
  }

  function catProps(card, cat, s) {
    card.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px' }, [
      el('h3', { style: 'margin:0;font-size:15px', text: 'Categoria' }),
      el('button', { class: 'icon-btn', html: QC.icon('x', 16), onclick: () => { view.selCatId = null; rebuild(s); } }),
    ]));
    card.appendChild(el('label', { class: 'field-label', text: 'Nome' }));
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [
      el('input', { class: 'input', value: cat.name, onchange: (e) => store.updateCategory(cat.id, { name: e.target.value.trim() || cat.name }) }),
    ]));
    card.appendChild(el('label', { class: 'field-label', text: 'Cor' }));
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [QC.ui.colorSwatches(cat.color, col => store.updateCategory(cat.id, { color: col }, false))]));

    const lbl = el('label', { class: 'filter-node', style: 'padding-left:0' }, [
      el('input', { type: 'checkbox', class: 'checkbox', checked: cat.deductive, onchange: (e) => store.updateCategory(cat.id, { deductive: e.target.checked }) }),
      el('span', { text: 'Categoria dedutiva (das SQs)' }),
    ]);
    card.appendChild(el('div', { style: 'margin-bottom:14px' }, [lbl]));

    // hierarquia (2 níveis): categoria com filhas não pode virar subcategoria
    const children = store.childCategories(cat.id);
    card.appendChild(el('label', { class: 'field-label', text: 'Categoria pai' }));
    if (children.length) {
      card.appendChild(el('div', { class: 'tiny muted', style: 'margin-bottom:14px', text: 'Tem ' + children.length + ' ' + U.pluralize(children.length, 'subcategoria', 'subcategorias') + ', então não pode virar subcategoria de outra.' }));
    } else {
      const roots = store.rootCategories().filter(c => c.id !== cat.id);
      card.appendChild(el('div', { style: 'margin-bottom:14px' }, [
        el('select', { class: 'select', onchange: (e) => store.updateCategory(cat.id, { parentId: e.target.value || null }) }, [
          el('option', { value: '', text: '— nenhuma (categoria raiz) —' }),
          ...roots.map(r => el('option', { value: r.id, text: r.name, selected: r.id === cat.parentId })),
        ]),
      ]));
    }

    const nDeep = store.codesInCategoryDeep(cat.id).length;
    card.appendChild(el('div', { class: 'prop-block' }, [
      el('label', { class: 'field-label', text: 'Códigos' }),
      el('div', { text: nDeep + ' ' + U.pluralize(nDeep, 'código', 'códigos') + (children.length ? ' (incluindo subcategorias)' : '') }),
    ]));
    if (!cat.parentId) {
      card.appendChild(el('button', { class: 'btn btn-outline btn-sm', style: 'width:100%;margin-bottom:8px', html: QC.icon('plusCircle', 16) + '<span>Nova subcategoria</span>', onclick: () => newCategory(cat.id) }));
    }
    card.appendChild(el('button', { class: 'btn btn-danger btn-outline btn-sm', style: 'width:100%', html: QC.icon('trash', 16) + '<span>Excluir categoria</span>', onclick: () => delCategory(cat) }));
  }

  // ---------------- ações ----------------
  async function newCategory(parentId) {
    parentId = typeof parentId === 'string' ? parentId : null;
    const name = await ui.prompt({ title: parentId ? 'Nova subcategoria' : 'Nova categoria', label: 'Nome', okLabel: 'Criar' });
    if (name) { const id = store.addCategory(name, { parentId }); view.selCatId = id; view.selCodeId = null; rebuild(store.state); }
  }
  async function newCode(catId) {
    const name = await ui.prompt({ title: 'Novo código', label: 'Nome', okLabel: 'Criar' });
    if (name) { const id = store.addCode(name, { categoryId: typeof catId === 'string' ? catId : null }); view.selCodeId = id; view.selCatId = null; rebuild(store.state); }
  }
  async function delCategory(cat) {
    const nSubs = store.childCategories(cat.id).length;
    const msg = 'Excluir a categoria "' + cat.name + '"? Os códigos dela ficam sem categoria (não são apagados)'
      + (nSubs ? ' e as ' + nSubs + ' subcategorias viram categorias raiz.' : '.');
    if (await ui.confirm(msg, { danger: true, okLabel: 'Excluir' })) {
      store.removeCategory(cat.id); view.selCatId = null; rebuild(store.state);
    }
  }

  function exportMenu(anchor) {
    if (!store.state.codes.length) { ui.toast('Nenhum código para exportar', 'error'); return; }
    ui.menu(anchor, [
      { label: 'Markdown (.md)', icon: 'fileText', onClick: () => { QC.seed.exportCodebook(store.state, 'md'); ui.toast('Livro de códigos exportado', 'ok'); } },
      { label: 'CSV (.csv)', icon: 'list', onClick: () => { QC.seed.exportCodebook(store.state, 'csv'); ui.toast('Livro de códigos exportado', 'ok'); } },
    ]);
  }

  function onEnter(params) { if (params && params.codeId) { view.selCodeId = params.codeId; view.selCatId = null; } }

  QC.screens = QC.screens || {};
  QC.screens.codebook = { render, onEnter, scoped: true };
})(window.QC = window.QC || {});
