/* components.js — UI compartilhada: toast, modal, confirm/prompt, menu, color picker, chips, file picker */
(function (QC) {
  const U = QC.util, el = U.el;
  const C = (QC.ui = {});

  // ---------- toast ----------
  let toastTimer;
  C.toast = function (msg, kind) {
    let host = document.getElementById('toast');
    if (!host) { host = el('div', { id: 'toast' }); document.body.appendChild(host); }
    host.className = 'toast show' + (kind ? ' toast-' + kind : '');
    host.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { host.className = 'toast'; }, 2600);
  };

  // ---------- modal ----------
  C.modal = function (opts) {
    // opts: {title, body(HTMLElement|string), actions:[{label, kind, onClick(close)}], onClose}
    const overlay = el('div', { class: 'overlay' });
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    const bodyNode = typeof opts.body === 'string' ? el('div', { html: opts.body }) : opts.body;
    const actions = (opts.actions || []).map(a =>
      el('button', { class: 'btn ' + (a.kind || 'btn-ghost'), onclick: () => a.onClick ? a.onClick(close) : close() }, a.label));
    const card = el('div', { class: 'modal ' + (opts.size || '') }, [
      el('div', { class: 'modal-head' }, [
        el('h3', { class: 'modal-title', text: opts.title || '' }),
        el('button', { class: 'icon-btn', onclick: close, html: QC.icon('x', 18) }),
      ]),
      el('div', { class: 'modal-body' }, [bodyNode]),
      actions.length ? el('div', { class: 'modal-foot' }, actions) : null,
    ]);
    overlay.appendChild(card);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    const firstInput = card.querySelector('input,textarea,select');
    if (firstInput) firstInput.focus();
    return { close, card };
  };

  C.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      C.modal({
        title: opts.title || 'Confirmar',
        body: el('p', { class: 'muted', text: message }),
        actions: [
          { label: opts.cancelLabel || 'Cancelar', kind: 'btn-ghost', onClick: close => { close(); resolve(false); } },
          { label: opts.okLabel || 'Confirmar', kind: opts.danger ? 'btn-danger' : 'btn-primary', onClick: close => { close(); resolve(true); } },
        ],
      });
    });
  };

  C.prompt = function (opts) {
    // {title, label, value, placeholder, okLabel} -> Promise<string|null>
    return new Promise(resolve => {
      const input = el('input', { class: 'input', type: 'text', value: opts.value || '', placeholder: opts.placeholder || '' });
      const body = el('div', {}, [
        opts.label ? el('label', { class: 'field-label', text: opts.label }) : null,
        input,
      ]);
      const m = C.modal({
        title: opts.title || '',
        body,
        actions: [
          { label: 'Cancelar', kind: 'btn-ghost', onClick: close => { close(); resolve(null); } },
          { label: opts.okLabel || 'OK', kind: 'btn-primary', onClick: close => { close(); resolve(input.value.trim()); } },
        ],
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { m.close(); resolve(input.value.trim()); } });
    });
  };

  // ---------- dropdown / popover ----------
  C.closeMenus = function () { document.querySelectorAll('.menu-pop').forEach(m => m.remove()); };
  C.menu = function (anchorEl, items) {
    // items: [{label, icon, danger, onClick}] | {divider:true}
    C.closeMenus();
    const rect = anchorEl.getBoundingClientRect();
    const pop = el('div', { class: 'menu-pop' });
    items.forEach(it => {
      if (it.divider) { pop.appendChild(el('div', { class: 'menu-divider' })); return; }
      pop.appendChild(el('button', {
        class: 'menu-item' + (it.danger ? ' danger' : ''),
        onclick: () => { C.closeMenus(); it.onClick && it.onClick(); },
      }, [it.icon ? el('span', { class: 'menu-ic', html: QC.icon(it.icon, 16) }) : null, el('span', { text: it.label })]));
    });
    document.body.appendChild(pop);
    const top = rect.bottom + 4, left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8);
    pop.style.top = top + 'px'; pop.style.left = Math.max(8, left) + 'px';
    setTimeout(() => {
      const onDoc = e => { if (!pop.contains(e.target)) { C.closeMenus(); document.removeEventListener('mousedown', onDoc); } };
      document.addEventListener('mousedown', onDoc);
    }, 0);
    return pop;
  };

  // destaca (<mark class="cp-hl">) os trechos do nome que casam com os termos (já "folded")
  C.foldHighlight = function (name, tokens) {
    const folded = U.fold(name), ranges = [];
    (tokens || []).forEach(t => { if (!t) return; let i = 0; while ((i = folded.indexOf(t, i)) !== -1) { ranges.push([i, i + t.length]); i += t.length; } });
    if (!ranges.length) return [document.createTextNode(name)];
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); });
    const out = []; let pos = 0;
    merged.forEach(r => { if (r[0] > pos) out.push(document.createTextNode(name.slice(pos, r[0]))); out.push(el('mark', { class: 'cp-hl', text: name.slice(r[0], r[1]) })); pos = r[1]; });
    if (pos < name.length) out.push(document.createTextNode(name.slice(pos)));
    return out;
  };

  // seletor de código com busca, lista rolável e "criar" no topo
  // opts: { codes:[{id,name,color}], onPick(code), onCreate(name) }
  C.codePicker = function (anchorEl, opts) {
    opts = opts || {};
    C.closeMenus();
    const rect = anchorEl.getBoundingClientRect();
    const pop = el('div', { class: 'menu-pop code-picker' });

    const list = el('div', { class: 'cp-list' });
    const highlight = C.foldHighlight;
    const renderList = (filter) => {
      list.innerHTML = '';
      const fq = U.fold((filter || '').trim());
      const tokens = fq.split(/\s+/).filter(Boolean);
      // casa por palavra (qualquer ordem) → surfa códigos parecidos, não só substring exata
      const matches = (opts.codes || []).filter(c => { const fn = U.fold(c.name); return tokens.every(t => fn.includes(t)); });
      // ranqueia: quem contém a query inteira como substring vem primeiro
      matches.sort((a, b) => (fq && U.fold(a.name).includes(fq) ? 0 : 1) - (fq && U.fold(b.name).includes(fq) ? 0 : 1));
      if (!matches.length) {
        list.appendChild(el('div', { class: 'cp-empty', text: fq ? 'Nenhum código corresponde.' : 'Nenhum código disponível.' }));
        return;
      }
      matches.forEach(c => {
        const nameEl = el('span', { class: 'cp-name' });
        highlight(c.name, tokens).forEach(node => nameEl.appendChild(node));
        // itens com _cat=true são categorias: ícone de pasta e contagem de códigos
        const isCat = !!c._cat;
        const n = isCat
          ? (QC.store.codesInCategoryDeep ? QC.store.codesInCategoryDeep(c.id).length : 0)
          : (QC.store.codeCount ? QC.store.codeCount(c.id) : 0);
        const marker = isCat
          ? el('span', { class: 'menu-ic', style: 'color:' + c.color, html: QC.icon('folder', 14) })
          : el('span', { class: 'chip-dot', style: 'background:' + c.color });
        list.appendChild(el('button', {
          class: 'cp-item', onclick: () => { C.closeMenus(); opts.onPick && opts.onPick(c); },
        }, [marker, nameEl, el('span', { class: 'cp-count', title: n + (isCat ? ' códigos' : ' ocorrências'), text: String(n) })]));
      });
    };

    const createLabel = el('span', { class: 'cp-create-label', text: 'Criar novo código' });
    const createBtn = el('button', { class: 'cp-create', onclick: () => { const v = search.value.trim(); C.closeMenus(); opts.onCreate && opts.onCreate(v); } },
      [el('span', { class: 'menu-ic', html: QC.icon('plus', 16) }), createLabel]);

    const search = el('input', {
      class: 'cp-search', type: 'text', placeholder: 'Buscar código…',
      oninput: (e) => { const v = e.target.value.trim(); renderList(e.target.value); createLabel.textContent = v ? 'Criar “' + v + '”' : 'Criar novo código'; },
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        const v = e.target.value.trim();
        const exact = (opts.codes || []).find(c => U.fold(c.name) === U.fold(v));
        if (exact) { C.closeMenus(); opts.onPick && opts.onPick(exact); }
        else if (v && opts.allowCreate !== false) { C.closeMenus(); opts.onCreate && opts.onCreate(v); }
      },
    });

    pop.appendChild(el('div', { class: 'cp-head' }, opts.allowCreate === false ? [search] : [createBtn, search]));
    pop.appendChild(list);
    renderList('');

    document.body.appendChild(pop);
    let top = rect.bottom + 4;
    const h = pop.offsetHeight;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4); // vira pra cima se não couber
    const left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8);
    pop.style.top = top + 'px'; pop.style.left = Math.max(8, left) + 'px';
    setTimeout(() => {
      search.focus();
      const onDoc = e => { if (!pop.contains(e.target)) { C.closeMenus(); document.removeEventListener('mousedown', onDoc); } };
      document.addEventListener('mousedown', onDoc);
    }, 0);
    return pop;
  };

  // ---------- color picker ----------
  C.colorSwatches = function (current, onPick) {
    const wrap = el('div', { class: 'swatches' });
    QC.store.PALETTE.forEach(color => {
      const b = el('button', {
        class: 'swatch' + (color === current ? ' active' : ''),
        title: color, style: `background:${color}`,
        onclick: () => { wrap.querySelectorAll('.swatch').forEach(s => s.classList.remove('active')); b.classList.add('active'); onPick(color); },
      });
      wrap.appendChild(b);
    });
    // custom
    const custom = el('input', { type: 'color', class: 'swatch-custom', value: current || '#888888', oninput: e => onPick(e.target.value) });
    wrap.appendChild(custom);
    return wrap;
  };

  // ---------- code chip ----------
  C.codeChip = function (code, opts) {
    opts = opts || {};
    const chip = el('span', {
      class: 'chip' + (opts.removable ? ' chip-rm' : '') + (opts.button ? ' chip-btn' : ''),
      style: `background:${U.hexToRgba(code.color, 0.16)};color:#1b1b24`,
      title: code.name,
      onclick: opts.onClick || null,
    }, [
      el('span', { class: 'chip-dot', style: `background:${code.color}` }),
      el('span', { class: 'chip-label', text: code.name }),
      opts.count != null ? el('span', { class: 'chip-count', text: String(opts.count) }) : null,
      opts.removable ? el('button', { class: 'chip-x', html: QC.icon('x', 12), onclick: (e) => { e.stopPropagation(); opts.onRemove && opts.onRemove(); } }) : null,
    ]);
    return chip;
  };

  // ---------- file picker ----------
  C.pickFiles = function (accept, multiple) {
    return new Promise(resolve => {
      const input = el('input', { type: 'file', accept: accept || '', style: 'display:none' });
      if (multiple) input.multiple = true;
      input.addEventListener('change', () => resolve(Array.from(input.files || [])));
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 60000);
    });
  };
  C.readFileText = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file, 'utf-8');
    });
  };

  // empty state
  C.empty = function (icon, title, subtitle, actionNode) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-ic', html: QC.icon(icon, 28) }),
      el('div', { class: 'empty-title', text: title }),
      subtitle ? el('div', { class: 'empty-sub', text: subtitle }) : null,
      actionNode || null,
    ]);
  };

})(window.QC = window.QC || {});
