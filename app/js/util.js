/* util.js — helpers base, sem dependências */
(function (QC) {
  const U = (QC.util = {});

  U.uid = function (prefix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd;
  };

  U.nowISO = function () { return new Date().toISOString(); };

  U.debounce = function (fn, ms) {
    let t;
    const wrapped = function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
    wrapped.flush = () => { clearTimeout(t); };
    return wrapped;
  };

  // normaliza para busca: minúsculas + remove acentos (mantém o mesmo comprimento p/ destacar)
  U.fold = function (s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n');
  };

  U.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.hexToRgba = function (hex, a) {
    let h = String(hex || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  };

  // Data, ex: "Hoje, 14:30" / "Ontem" / "12 Mai 2024"
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  U.formatDate = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso), now = new Date();
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay(d, now)) return `Hoje, ${hh}:${mm}`;
    if (sameDay(d, yesterday)) return 'Ontem';
    return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  };

  U.downloadFile = function (filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  };

  U.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // tiny DOM builder: el('div', {class:'x', onclick:fn}, [child, 'texto'])
  U.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    let deferredValue; // 'value' precisa virar propriedade (textarea/select) e após os filhos
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'value') { deferredValue = v; continue; }
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') { for (const d in v) node.dataset[d] = v[d]; }
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      });
    }
    if (deferredValue !== undefined) node.value = deferredValue;
    return node;
  };

  // offset absoluto de um (node,offset) dentro de root, contando só nós de texto
  U.absOffset = function (root, node, offset) {
    if (!root.contains(node)) return null;
    let total = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      if (n === node) return total + offset;
      total += n.nodeValue.length;
    }
    // se node for elemento, soma comprimento dos text nodes anteriores
    return total;
  };

  U.pluralize = function (n, sing, plur) { return n === 1 ? sing : plur; };

})(window.QC = window.QC || {});
