/* screens/memos.js — memos analíticos (Grounded Theory) com vínculos a códigos/trechos/documentos */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;

  const view = { selId: null, search: '' };

  function render(host) {
    const s = store.state;
    if (!view.selId || !store.memo(view.selId)) view.selId = (s.memos[0] && s.memos[0].id) || null;
    host.innerHTML = '';
    const wrap = el('div', { class: 'memos' });
    wrap.appendChild(listCol(s));
    wrap.appendChild(editorCol(s));
    host.appendChild(wrap);
  }

  function listCol(s) {
    const col = el('div', { class: 'memos-list' });
    col.appendChild(el('div', { class: 'side-head' }, [
      el('div', { style: 'display:flex;gap:8px' }, [
        el('div', { class: 'search', style: 'flex:1' }, [
          el('span', { html: QC.icon('retrieval', 16) }),
          el('input', { class: 'input', placeholder: 'Buscar memos…', value: view.search, oninput: (e) => { view.search = e.target.value; refreshList(s); } }),
        ]),
        el('button', { class: 'btn btn-primary', title: 'Novo memo', html: QC.icon('plus', 16), onclick: () => { const id = store.addMemo('Novo memo'); view.selId = id; store.rerender(); } }),
      ]),
    ]));
    const scroll = el('div', { class: 'side-scroll', id: 'memo-scroll', style: 'padding:0' });
    col.appendChild(scroll);
    fillList(scroll, s);
    return col;
  }

  function refreshList(s) { const sc = document.getElementById('memo-scroll'); if (sc) { sc.innerHTML = ''; fillList(sc, s); } }

  function fillList(scroll, s) {
    const f = view.search.toLowerCase();
    const memos = s.memos.filter(m => (m.title + ' ' + (m.body || '')).toLowerCase().includes(f));
    if (!memos.length) { scroll.appendChild(el('div', { class: 'muted tiny', style: 'padding:16px', text: s.memos.length ? 'Nada encontrado.' : 'Nenhum memo ainda. Clique em + para criar.' })); return; }
    memos.forEach(m => {
      const item = el('div', { class: 'memo-item' + (m.id === view.selId ? ' active' : ''), onclick: () => { view.selId = m.id; store.rerender(); } }, [
        el('div', { class: 'mi-title', text: m.title || 'Sem título' }),
        el('div', { class: 'mi-snip', text: (m.body || '').slice(0, 120) || 'Vazio' }),
        el('div', { class: 'mi-meta' }, [
          ...(m.links || []).slice(0, 3).map(l => linkBadge(l)),
          el('span', { class: 'muted tiny', style: 'margin-left:auto', text: U.formatDate(m.updatedAt) }),
        ]),
      ]);
      scroll.appendChild(item);
    });
  }

  function linkBadge(l) {
    let label = '', color = '#64748b';
    if (l.type === 'code') { const c = store.code(l.id); if (c) { label = c.name; color = c.color; } }
    else if (l.type === 'document') { const d = store.doc(l.id); if (d) label = d.name; }
    else if (l.type === 'quotation') { label = 'trecho'; }
    if (!label) return el('span');
    return el('span', { class: 'chip', style: `background:${U.hexToRgba(color, 0.16)};height:18px;font-size:11px`, title: label }, [
      el('span', { class: 'chip-dot', style: `background:${color};width:6px;height:6px` }),
      el('span', { class: 'chip-label', style: 'max-width:70px', text: label }),
    ]);
  }

  function editorCol(s) {
    const col = el('div', { class: 'memo-editor' });
    const m = store.memo(view.selId);
    if (!m) {
      col.appendChild(ui.empty('memos', 'Nenhum memo selecionado', 'Crie ou selecione um memo à esquerda.'));
      return col;
    }
    const main = el('div', { class: 'memo-edit-main' });
    main.appendChild(el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' }, [
      el('span', { class: 'tiny muted', style: 'flex:1', text: 'Editado ' + U.formatDate(m.updatedAt) }),
      el('button', { class: 'icon-btn', title: 'Excluir memo', html: QC.icon('trash', 16), onclick: async () => {
        if (await ui.confirm('Excluir este memo?', { danger: true, okLabel: 'Excluir' })) { store.removeMemo(m.id); view.selId = null; store.rerender(); }
      } }),
    ]));
    main.appendChild(el('input', { class: 'memo-title-input', value: m.title, placeholder: 'Título do memo', oninput: (e) => store.updateMemo(m.id, { title: e.target.value }, false), onblur: () => refreshList(s) }));
    main.appendChild(el('textarea', { class: 'memo-body-input', placeholder: 'Escreva sua nota analítica… (impressões, temas emergentes, hipóteses, ajustes no roteiro)', value: m.body || '', oninput: (e) => store.updateMemo(m.id, { body: e.target.value }, false), onblur: () => refreshList(s) }));
    col.appendChild(main);

    col.appendChild(linksCol(m, s));
    return col;
  }

  function linksCol(m, s) {
    const col = el('div', { class: 'memo-links' });
    col.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px' }, [
      el('label', { class: 'section-label', style: 'margin:0', text: 'Vincular a' }),
      el('button', { class: 'icon-btn', html: QC.icon('plus', 16), title: 'Adicionar vínculo', onclick: (e) => addLinkMenu(e.currentTarget, m, s) }),
    ]));
    const links = m.links || [];
    if (!links.length) col.appendChild(el('div', { class: 'muted tiny', text: 'Nenhum vínculo. Conecte este memo a códigos, trechos ou documentos.' }));
    links.forEach(l => col.appendChild(linkRow(m, l)));
    return col;
  }

  function linkRow(m, l) {
    const removeBtn = () => el('button', { class: 'chip-x', html: QC.icon('x', 14), title: 'Remover vínculo', onclick: () => store.removeMemoLink(m.id, l.type, l.id) });

    // trecho: bloco legível com o texto completo, documento de origem e códigos aplicados
    if (l.type === 'quotation') {
      const q = store.quotation(l.id);
      if (!q) return removedRow(removeBtn());
      const doc = store.doc(q.documentId);
      const dots = (q.codeIds || []).map(cid => { const c = store.code(cid); return c ? el('span', { class: 'chip-dot', style: `background:${c.color};width:7px;height:7px`, title: c.name }) : null; }).filter(Boolean);
      return el('div', { class: 'memo-link-quote' }, [
        el('div', { class: 'mlq-head' }, [
          el('span', { class: 'mlq-icon', html: QC.icon('quote', 13) }),
          el('span', { class: 'mlq-doc', text: doc ? doc.name : 'documento removido' }),
          removeBtn(),
        ]),
        el('div', { class: 'mlq-text', title: 'Abrir no leitor', text: q.text, onclick: () => QC.app.go('coding', { quotationId: q.id }) }),
        dots.length ? el('div', { class: 'mlq-codes' }, dots) : null,
      ]);
    }

    // código / documento: linha compacta
    let label = '(removido)', color = '#64748b', icon = 'link', onOpen = null;
    if (l.type === 'code') { const c = store.code(l.id); if (c) { label = c.name; color = c.color; icon = 'tag'; onOpen = () => QC.app.go('codebook', { codeId: c.id }); } }
    else if (l.type === 'document') { const d = store.doc(l.id); if (d) { label = d.name; icon = 'fileText'; onOpen = () => QC.app.go('coding', { docId: d.id }); } }
    return el('div', { class: 'doc-item', style: 'border:1px solid var(--border);margin-bottom:6px' }, [
      el('span', { style: `color:${color}`, html: QC.icon(icon, 16) }),
      el('span', { class: 'chip-label', style: 'flex:1;cursor:pointer', text: label, onclick: onOpen }),
      removeBtn(),
    ]);
  }

  function removedRow(btn) {
    return el('div', { class: 'doc-item', style: 'border:1px solid var(--border);margin-bottom:6px;color:var(--muted)' }, [
      el('span', { html: QC.icon('link', 16) }), el('span', { class: 'chip-label', style: 'flex:1', text: '(removido)' }), btn,
    ]);
  }

  function addLinkMenu(anchor, m, s) {
    ui.menu(anchor, [
      { label: 'Vincular código', icon: 'tag', onClick: () => pickLink('code', s.codes.map(c => ({ id: c.id, label: c.name })), m) },
      { label: 'Vincular documento', icon: 'fileText', onClick: () => pickLink('document', s.documents.map(d => ({ id: d.id, label: d.name })), m) },
      { label: 'Vincular trecho', icon: 'quote', onClick: () => pickLink('quotation', s.quotations.map(q => ({ id: q.id, label: q.text.slice(0, 90) + (q.text.length > 90 ? '…' : '') })), m) },
    ]);
  }

  function pickLink(type, options, m) {
    if (!options.length) { ui.toast('Nada para vincular ainda', 'error'); return; }
    const listEl = el('div', { class: 'opt-list', style: 'max-height:300px' });
    options.forEach(o => listEl.appendChild(el('button', { class: 'opt', text: o.label, onclick: () => { store.addMemoLink(m.id, type, o.id); modal.close(); } })));
    const modal = ui.modal({ title: 'Vincular', body: listEl });
  }

  function onEnter(params) { if (params && params.memoId) view.selId = params.memoId; }

  QC.screens = QC.screens || {};
  QC.screens.memos = { render, onEnter, scoped: true };
})(window.QC = window.QC || {});
