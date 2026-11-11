/* screens/network.js — rede de relações entre códigos E categorias (codificação axial: grafo) */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const cam = { zoom: 1, panX: 0, panY: 0, initialized: false };
  const sel = { source: '', type: '', target: '', edgeId: null, catFilter: '' };
  const show = { codes: true, cats: true, membership: true };
  const multi = new Set(); // ids selecionados no canvas (multisseleção p/ mover em grupo)
  let pos = {}; // posições efetivas (userspace), códigos e categorias no mesmo mapa
  let svg, viewport, edgeLayer, nodeLayer;
  let nodeEls = {};
  let keybound = false;   // listeners de teclado registrados uma única vez
  let spaceDown = false;  // Espaço pressionado → arraste no fundo faz pan

  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  // quebra o rótulo em até 3 linhas (~30 chars/linha); trunca com … só se passar disso
  function layoutLabel(name, isCat) {
    const MAXC = 30, MAXL = 3;
    const words = String(name).split(/\s+/).filter(Boolean);
    const lines = []; let idx = 0;
    while (idx < words.length && lines.length < MAXL) {
      let line = words[idx]; idx++;
      while (idx < words.length && (line + ' ' + words[idx]).length <= MAXC) { line += ' ' + words[idx]; idx++; }
      lines.push(line);
    }
    if (idx < words.length) { // sobrou texto → … na última linha
      let last = lines[lines.length - 1];
      if ((last + '…').length > MAXC) last = last.slice(0, MAXC - 1).replace(/\s+$/, '');
      lines[lines.length - 1] = last + '…';
    }
    const fixed = lines.map(l => l.length > MAXC ? l.slice(0, MAXC - 1) + '…' : l);
    const maxLen = Math.max.apply(null, fixed.map(l => l.length).concat([1]));
    let w = U.clamp(maxLen * 6.7 + 36, 80, 280);
    let halfH = 7 + fixed.length * 8;
    if (isCat) { w += 18; halfH += 5; } // nó de categoria é maior
    return { lines: fixed, w, halfW: w / 2, halfH };
  }
  function sizeOf(id) {
    const c = store.code(id);
    if (c) return layoutLabel(c.name, false);
    const cat = store.category(id);
    return layoutLabel(cat ? cat.name : '?', true);
  }

  // ---------------- seleção múltipla ----------------
  function isSelected(id) { return multi.has(id); }
  function selectOnly(id) { multi.clear(); if (id) multi.add(id); }
  function toggleSel(id) { if (multi.has(id)) multi.delete(id); else multi.add(id); }
  function clearSelection() { multi.clear(); }
  // reaplica classes/contorno de seleção sem reconstruir o SVG inteiro
  function refreshSelectionVisuals() {
    for (const id in nodeEls) {
      const g = nodeEls[id];
      if (!g) continue;
      const picked = multi.has(id) || id === sel.source;
      const isCat = g.classList.contains('cat');
      g.classList.toggle('selected', picked);
      g.classList.toggle('multi', multi.has(id));
      const box = g.querySelector('rect');
      if (box) {
        box.setAttribute('stroke-width', picked ? '3' : (isCat ? '1.4' : '1.5'));
        // código: stroke é sempre a cor do código (só a largura muda).
        // categoria: stroke escuro quando selecionada, tênue quando não.
        if (isCat) box.setAttribute('stroke', picked ? '#1b1b24' : 'rgba(27,27,36,.35)');
      }
    }
    const cnt = document.getElementById('net-sel-count');
    const clr = document.getElementById('net-sel-clear');
    const n = multi.size;
    if (cnt) { cnt.textContent = n + ' selecionado' + (n === 1 ? '' : 's'); cnt.style.display = n ? '' : 'none'; }
    if (clr) clr.style.display = n ? '' : 'none';
  }
  // ponto onde a aresta toca a borda do nó (aproximado por elipse halfW×halfH)
  function nodeExit(center, ux, uy, sz, gap) {
    const d = Math.hypot(ux / sz.halfW, uy / sz.halfH) || 1;
    const t = 1 / d + (gap || 0);
    return { x: center.x + ux * t, y: center.y + uy * t };
  }

  // entidades visíveis segundo filtro de categoria + toggles
  function visibleSets(s) {
    let cats = (s.categories || []).slice();
    let codes = (s.codes || []).slice();
    if (sel.catFilter) {
      const ids = store.catAndChildrenIds(sel.catFilter);
      cats = cats.filter(c => ids.includes(c.id));
      codes = codes.filter(c => ids.includes(c.categoryId));
    }
    if (!show.cats) cats = [];
    if (!show.codes) codes = [];
    return {
      cats, codes,
      catIds: new Set(cats.map(c => c.id)),
      codeIds: new Set(codes.map(c => c.id)),
    };
  }

  function render(host) {
    const s = store.state;
    host.innerHTML = '';
    nodeEls = {};

    if (!keybound) {
      keybound = true;
      const onNet = () => QC.app && QC.app.current === 'network';
      document.addEventListener('keydown', (e) => {
        if (!onNet()) return;
        if (e.code === 'Space') spaceDown = true;
        if (e.key === 'Escape' && multi.size) { clearSelection(); refreshSelectionVisuals(); }
      });
      document.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
    }

    const top = el('div', { class: 'topbar' }, [
      el('h1', { text: 'Rede de Relações' }),
      el('span', { class: 'crumb', text: s.name }),
      el('div', { class: 'topbar-spacer' }),
      el('button', { class: 'btn btn-outline', onclick: (e) => ui.menu(e.currentTarget, [
        { label: 'Árvore hierárquica', icon: 'network', onClick: layoutAsTree },
        { label: 'Agrupar por categorias', icon: 'folder', onClick: layoutByCategories },
        { label: 'Círculo (padrão)', icon: 'network', onClick: relayout },
      ]), html: QC.icon('grid', 16) + '<span>Reorganizar</span>' }),
      el('button', { class: 'btn btn-primary', onclick: () => exportPNG(), html: QC.icon('download', 16) + '<span>Exportar rede</span>' }),
    ]);
    host.appendChild(top);

    const row = el('div', { class: 'network', style: 'height:calc(100vh - 56px)' });
    const canvasWrap = el('div', { class: 'net-canvas-wrap', id: 'net-wrap' });
    row.appendChild(canvasWrap);
    row.appendChild(sidePanel(s));
    host.appendChild(row);

    if (!s.codes.length && !(s.categories || []).length) {
      canvasWrap.appendChild(el('div', { class: 'net-empty' }, [ui.empty('network', 'Sem códigos para conectar', 'Crie códigos na codificação ou no codebook e volte aqui para relacioná-los.')]));
      return;
    }

    computePositions(s, canvasWrap);
    buildSvg(canvasWrap, s);
    buildToolbar(canvasWrap);
  }

  function computePositions(s, wrap) {
    const W = wrap.clientWidth || 800, H = wrap.clientHeight || 600;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 120;
    pos = {};
    const stored = (s.graph && s.graph.positions) || {};
    s.codes.forEach((c, i) => {
      if (stored[c.id]) pos[c.id] = { x: stored[c.id].x, y: stored[c.id].y };
      else {
        const a = (i / s.codes.length) * Math.PI * 2 - Math.PI / 2;
        pos[c.id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
      }
    });
    // categorias: posição salva > centroide dos códigos membros > círculo interno
    const RC = Math.max(120, R * 0.45);
    const cats = s.categories || [];
    cats.forEach((cat, i) => {
      if (stored[cat.id]) { pos[cat.id] = { x: stored[cat.id].x, y: stored[cat.id].y }; return; }
      const members = store.codesInCategoryDeep(cat.id).map(c => pos[c.id]).filter(Boolean);
      if (members.length) {
        pos[cat.id] = {
          x: members.reduce((a, p) => a + p.x, 0) / members.length,
          y: members.reduce((a, p) => a + p.y, 0) / members.length,
        };
      } else {
        const a = (i / Math.max(1, cats.length)) * Math.PI * 2 - Math.PI / 2;
        pos[cat.id] = { x: cx + Math.cos(a) * RC, y: cy + Math.sin(a) * RC };
      }
    });
    if (!cam.initialized) { cam.zoom = 1; cam.panX = 0; cam.panY = 0; cam.initialized = true; }
  }

  function buildSvg(wrap, s) {
    svg = svgEl('svg', { class: 'net-svg' });
    const defs = svgEl('defs');
    defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#777587"></path></marker>`;
    svg.appendChild(defs);
    viewport = svgEl('g', { id: 'viewport' });
    edgeLayer = svgEl('g', {});
    nodeLayer = svgEl('g', {});
    viewport.appendChild(edgeLayer);
    viewport.appendChild(nodeLayer);
    svg.appendChild(viewport);
    wrap.appendChild(svg);
    applyCam();

    // nós (categorias por cima dos códigos, pra clique fácil)
    const v = visibleSets(s);
    v.codes.forEach(c => nodeLayer.appendChild(buildNode(c, false)));
    v.cats.forEach(c => nodeLayer.appendChild(buildNode(c, true)));
    // arestas
    drawEdges(s);

    // pan (botão do meio / Espaço) + marquee (arraste esquerdo no fundo)
    enableCanvasInteractions();
  }

  // luminância aproximada: decide se o texto sobre a cor deve ser escuro ou claro
  function isLight(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h, 16) || 0;
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
  }

  function buildNode(c, isCat) {
    const p = pos[c.id]; const lay = layoutLabel(c.name, isCat);
    const selSrc = c.id === sel.source;
    const picked = isSelected(c.id);
    const tx = -lay.halfW + (isCat ? 28 : 24);
    const g = svgEl('g', { class: 'net-node' + (isCat ? ' cat' : '') + ((selSrc || picked) ? ' selected' : '') + (picked ? ' multi' : ''), transform: `translate(${p.x},${p.y})` });
    let box, dot, txtFill = '#1b1b24';
    if (isCat) {
      // categoria: retângulo sólido de cantos retos na cor da categoria (código = pílula clara arredondada)
      txtFill = isLight(c.color) ? '#1b1b24' : '#ffffff';
      box = svgEl('rect', {
        x: -lay.halfW, y: -lay.halfH, width: lay.w, height: lay.halfH * 2, rx: 4, ry: 4,
        fill: c.color, stroke: (selSrc || picked) ? '#1b1b24' : 'rgba(27,27,36,.35)', 'stroke-width': (selSrc || picked) ? 3 : 1.4,
      });
      dot = svgEl('path', {
        d: 'M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z',
        fill: 'none', stroke: txtFill, 'stroke-width': 2.2, 'stroke-linejoin': 'round',
        transform: `translate(${-lay.halfW + 8},-7) scale(0.58)`,
      });
    } else {
      box = svgEl('rect', {
        x: -lay.halfW, y: -lay.halfH, width: lay.w, height: lay.halfH * 2, rx: 15, ry: 15,
        fill: U.hexToRgba(c.color, 0.12), stroke: c.color, 'stroke-width': (selSrc || picked) ? 3 : 1.5,
      });
      dot = svgEl('circle', { cx: -lay.halfW + 14, cy: 0, r: 4.5, fill: c.color });
    }
    const t = svgEl('text', { x: tx, 'text-anchor': 'start', fill: txtFill, 'font-size': 13, 'font-weight': isCat ? 700 : 500 });
    const L = lay.lines.length, LH = 16;
    lay.lines.forEach((ln, i) => { const ts = svgEl('tspan', { x: tx, y: (i - (L - 1) / 2) * LH + 4.5 }); ts.textContent = ln; t.appendChild(ts); });
    const title = svgEl('title', {}); title.textContent = (isCat ? 'Categoria: ' : '') + c.name;
    g.appendChild(box); g.appendChild(dot); g.appendChild(t); g.appendChild(title);
    nodeEls[c.id] = g;
    enableDrag(g, c.id);
    return g;
  }

  // linha entre duas entidades já posicionadas
  function edgeLine(aId, bId, attrs, gapEnd) {
    const a = pos[aId], b = pos[bId];
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const pa = nodeExit(a, ux, uy, sizeOf(aId), 5);
    const pb = nodeExit(b, -ux, -uy, sizeOf(bId), gapEnd != null ? gapEnd : 11);
    return { line: svgEl('line', Object.assign({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }, attrs)), mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2 };
  }

  function edgeLabel(mx, my, text, titleText, onClick) {
    const w = text.length * 6.2 + 12;
    const bg = svgEl('rect', { class: 'net-edge-bg', x: mx - w / 2, y: my - 10, width: w, height: 18, rx: 6, fill: '#fcf8ff', stroke: '#e4e1ee' });
    const lt = svgEl('text', { class: 'net-edge-label', x: mx, y: my + 3, 'text-anchor': 'middle' });
    lt.textContent = text;
    if (titleText) { const ti = svgEl('title', {}); ti.textContent = titleText; lt.appendChild(ti); }
    if (onClick) [bg, lt].forEach(n => { n.style.cursor = 'pointer'; n.addEventListener('click', onClick); });
    return [bg, lt];
  }

  // linha invisível e larga sobre a aresta, só pra facilitar o clique
  function edgeHit(e, onClick) {
    const hit = svgEl('line', {
      x1: e.line.getAttribute('x1'), y1: e.line.getAttribute('y1'),
      x2: e.line.getAttribute('x2'), y2: e.line.getAttribute('y2'),
      stroke: '#000', 'stroke-opacity': 0, 'stroke-width': 14,
    });
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', onClick);
    return hit;
  }

  function drawEdges(s) {
    const v = visibleSets(s);
    edgeLayer.innerHTML = '';

    // 1) arestas de pertencimento (código ⇢ categoria, subcategoria ⇢ pai) — derivadas;
    //    clicar numa delas abre o editor para CRIAR uma relação nomeada entre os dois nós
    if (show.membership) {
      const member = (fromId, toId) => {
        const e = edgeLine(fromId, toId, { stroke: '#c7c4d8', 'stroke-width': 1.2, 'stroke-dasharray': '4 4' }, 0.5);
        if (!e) return;
        e.line.style.pointerEvents = 'none';
        edgeLayer.appendChild(e.line);
        edgeLayer.appendChild(edgeHit(e, (ev) => {
          ev.stopPropagation();
          openTypeEditor({ sourceId: fromId, targetId: toId }, ev.clientX, ev.clientY);
        }));
      };
      v.codes.forEach(c => { if (c.categoryId && v.catIds.has(c.categoryId)) member(c.id, c.categoryId); });
      v.cats.forEach(c => { if (c.parentId && v.catIds.has(c.parentId)) member(c.id, c.parentId); });
    }

    // 2) relações reais entre entidades visíveis; endpoints ocultos sobem pra categoria (agregação)
    const liftGroups = {};
    const liftOf = (id, isVisible) => {
      if (isVisible) return id;
      const c = store.code(id);
      if (c && c.categoryId && v.catIds.has(c.categoryId)) return c.categoryId;
      return null;
    };
    (s.relations || []).forEach(r => {
      const sVis = v.codeIds.has(r.sourceId) || v.catIds.has(r.sourceId);
      const tVis = v.codeIds.has(r.targetId) || v.catIds.has(r.targetId);
      if (sVis && tVis) {
        const e = edgeLine(r.sourceId, r.targetId, {
          stroke: r.id === sel.edgeId ? '#4f46e5' : '#9a98ab',
          'stroke-width': r.id === sel.edgeId ? 2.4 : 1.6,
          'marker-end': 'url(#arrow)',
        });
        if (!e) return;
        const onEdgeClick = (ev) => {
          ev.stopPropagation();
          sel.edgeId = r.id; rebindSidePanel(); drawEdges(store.state);
          openTypeEditor({ relation: r, sourceId: r.sourceId, targetId: r.targetId }, ev.clientX, ev.clientY);
        };
        e.line.style.cursor = 'pointer';
        e.line.addEventListener('click', onEdgeClick);
        edgeLayer.appendChild(e.line);
        edgeLayer.appendChild(edgeHit(e, onEdgeClick));
        edgeLabel(e.mx, e.my, r.type, null, onEdgeClick).forEach(n => edgeLayer.appendChild(n));
        return;
      }
      const a = liftOf(r.sourceId, sVis), b = liftOf(r.targetId, tVis);
      if (a && b && a !== b) {
        const key = a + '|' + b;
        (liftGroups[key] = liftGroups[key] || { a, b, items: [] }).items.push(r);
      }
    });

    // 3) arestas agregadas (códigos ocultos): tracejadas, com contagem; tooltip lista as relações
    Object.keys(liftGroups).forEach(key => {
      const g = liftGroups[key];
      const e = edgeLine(g.a, g.b, { stroke: '#9a98ab', 'stroke-width': 2, 'stroke-dasharray': '7 4', 'marker-end': 'url(#arrow)' });
      if (!e) return;
      const n = g.items.length;
      const detail = g.items.map(r => {
        const sa = store.entity(r.sourceId), sb = store.entity(r.targetId);
        return (sa ? sa.name : '?') + ' → ' + r.type + ' → ' + (sb ? sb.name : '?');
      }).join('\n');
      const ti = svgEl('title', {}); ti.textContent = detail; e.line.appendChild(ti);
      edgeLayer.appendChild(e.line);
      edgeLabel(e.mx, e.my, n + ' ' + U.pluralize(n, 'relação', 'relações'), detail).forEach(node => edgeLayer.appendChild(node));
    });
  }

  // ---------------- drag de nó ----------------
  function clientToUser(clientX, clientY) {
    const ctm = viewport.getScreenCTM();
    const inv = ctm.inverse();
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const u = pt.matrixTransform(inv);
    return { x: u.x, y: u.y };
  }
  function enableDrag(g, entityId) {
    let dragging = false, moved = false;
    let group = null, start = null; // group: ids a mover; start: {id:{x,y}} posições iniciais
    g.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // só botão esquerdo arrasta nó
      e.stopPropagation(); dragging = true; moved = false;
      // se o nó arrastado está na multisseleção, move todos; senão, move só ele
      group = multi.has(entityId) ? Array.from(multi) : [entityId];
      start = {};
      group.forEach(id => { if (pos[id]) start[id] = { x: pos[id].x, y: pos[id].y }; });
      const origin = clientToUser(e.clientX, e.clientY);
      const onMove = (ev) => {
        if (!dragging) return; moved = true;
        const u = clientToUser(ev.clientX, ev.clientY);
        const dx = u.x - origin.x, dy = u.y - origin.y;
        group.forEach(id => {
          if (!start[id]) return;
          pos[id] = { x: start[id].x + dx, y: start[id].y + dy };
          const ge = nodeEls[id];
          if (ge) ge.setAttribute('transform', `translate(${pos[id].x},${pos[id].y})`);
        });
        drawEdges(store.state);
      };
      const onUp = (ev) => {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (moved) {
          const map = {};
          group.forEach(id => { if (pos[id]) map[id] = { x: pos[id].x, y: pos[id].y }; });
          store.setNodePositions(map);
          return;
        }
        // clique (sem arraste) — seleção
        if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
          toggleSel(entityId); refreshSelectionVisuals();
        } else {
          selectOnly(entityId); sel.source = entityId; sel.edgeId = null;
          rebindSidePanel(); refreshSelectionVisuals();
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ids de nós visíveis cujo centro cai dentro do retângulo (coords userspace)
  function nodesInRect(x0, y0, x1, y1) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const v = visibleSets(store.state);
    const ids = [];
    v.codes.concat(v.cats).forEach(c => {
      const p = pos[c.id];
      if (p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) ids.push(c.id);
    });
    return ids;
  }

  // arraste esquerdo no fundo = marquee de seleção; pan = botão-do-meio ou Espaço+esquerdo
  function enableCanvasInteractions() {
    let mode = null; // 'pan' | 'marquee'
    let sx, sy, ox, oy;                       // pan
    let mStartUser = null, marqueeEl = null;  // marquee
    svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('.net-node')) return; // nó tem seu próprio handler
      if (e.button === 1 || (e.button === 0 && spaceDown)) {
        e.preventDefault(); mode = 'pan';
        sx = e.clientX; sy = e.clientY; ox = cam.panX; oy = cam.panY;
      } else if (e.button === 0) {
        mode = 'marquee';
        mStartUser = clientToUser(e.clientX, e.clientY);
        if (!e.shiftKey) { clearSelection(); refreshSelectionVisuals(); }
        marqueeEl = svgEl('rect', { class: 'net-marquee', x: mStartUser.x, y: mStartUser.y, width: 0, height: 0 });
        viewport.appendChild(marqueeEl);
      } else { return; }

      const onMove = (ev) => {
        if (mode === 'pan') {
          cam.panX = ox + (ev.clientX - sx); cam.panY = oy + (ev.clientY - sy); applyCam();
        } else if (mode === 'marquee') {
          const u = clientToUser(ev.clientX, ev.clientY);
          const x = Math.min(mStartUser.x, u.x), y = Math.min(mStartUser.y, u.y);
          const w = Math.abs(u.x - mStartUser.x), h = Math.abs(u.y - mStartUser.y);
          marqueeEl.setAttribute('x', x); marqueeEl.setAttribute('y', y);
          marqueeEl.setAttribute('width', w); marqueeEl.setAttribute('height', h);
        }
      };
      const onUp = (ev) => {
        if (mode === 'marquee' && marqueeEl) {
          const u = clientToUser(ev.clientX, ev.clientY);
          nodesInRect(mStartUser.x, mStartUser.y, u.x, u.y).forEach(id => multi.add(id));
          refreshSelectionVisuals();
          marqueeEl.remove(); marqueeEl = null;
        }
        mode = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9); }, { passive: false });
  }
  function applyCam() { if (viewport) viewport.setAttribute('transform', `translate(${cam.panX},${cam.panY}) scale(${cam.zoom})`); const zv = document.getElementById('zoom-val'); if (zv) zv.textContent = Math.round(cam.zoom * 100) + '%'; }
  function zoomBy(f) { cam.zoom = U.clamp(cam.zoom * f, 0.3, 2.5); applyCam(); }

  function buildToolbar(wrap) {
    wrap.appendChild(el('div', { class: 'net-toolbar' }, [
      el('button', { class: 'icon-btn', html: QC.icon('zoomIn', 18), onclick: () => zoomBy(1.15) }),
      el('span', { class: 'zoom-val', id: 'zoom-val', text: Math.round(cam.zoom * 100) + '%' }),
      el('button', { class: 'icon-btn', html: QC.icon('zoomOut', 18), onclick: () => zoomBy(0.87) }),
      el('button', { class: 'icon-btn', html: QC.icon('maximize', 18), title: 'Ajustar à tela', onclick: fitView }),
      el('span', { class: 'net-sel-count', id: 'net-sel-count', style: multi.size ? '' : 'display:none', text: multi.size + ' selecionado' + (multi.size === 1 ? '' : 's') }),
      el('button', { class: 'icon-btn', id: 'net-sel-clear', title: 'Limpar seleção (Esc)', style: multi.size ? '' : 'display:none', html: QC.icon('x', 18), onclick: () => { clearSelection(); refreshSelectionVisuals(); } }),
    ]));
  }

  // ---------------- painel lateral ----------------
  function sidePanel(s) {
    const side = el('div', { class: 'net-side', id: 'net-side' });
    fillSide(side, s);
    return side;
  }
  function rebindSidePanel() { const side = document.getElementById('net-side'); if (side) { side.innerHTML = ''; fillSide(side, store.state); } }

  function fillSide(side, s) {
    // exibição
    side.appendChild(el('label', { class: 'section-label', text: 'Exibir' }));
    const toggle = (key, label) => el('label', { class: 'filter-node', style: 'padding-left:0' }, [
      el('input', { type: 'checkbox', class: 'checkbox', checked: show[key], onchange: (e) => { show[key] = e.target.checked; store.rerender(); } }),
      el('span', { text: label }),
    ]);
    side.appendChild(toggle('codes', 'Códigos'));
    side.appendChild(toggle('cats', 'Categorias'));
    side.appendChild(toggle('membership', 'Vínculos de pertencimento'));
    if (!show.codes && show.cats) {
      side.appendChild(el('div', { class: 'tiny muted', style: 'margin-top:4px', text: 'Relações entre códigos ocultos aparecem agregadas entre as categorias (tracejadas, com contagem).' }));
    }

    side.appendChild(el('div', { style: 'height:1px;background:var(--border);margin:14px 0' }));
    side.appendChild(el('label', { class: 'section-label', text: 'Editor de relações' }));

    // tipos de relação
    side.appendChild(el('label', { class: 'field-label', style: 'margin-top:10px', text: 'Tipos de relação' }));
    const types = (s.graph && s.graph.relationTypes) || QC.seed.RELATION_TYPES;
    types.forEach(t => side.appendChild(el('div', { class: 'rel-type', text: t })));
    side.appendChild(el('button', { class: 'btn btn-ghost btn-sm', style: 'margin:4px 0 14px', html: QC.icon('plusCircle', 16) + '<span>Novo tipo de relação</span>', onclick: async () => {
      const t = await ui.prompt({ title: 'Novo tipo de relação', label: 'Nome (ex.: "influencia")', okLabel: 'Adicionar' });
      if (t) { store.addRelationType(t); }
    } }));

    // criar conexão (códigos e categorias)
    side.appendChild(el('label', { class: 'section-label', text: 'Criar nova conexão' }));
    const pickItems = (excludeId) => {
      const cats = (s.categories || []).map(c => Object.assign({}, c, { _cat: true }));
      return cats.concat(s.codes).filter(c => c.id !== excludeId);
    };
    const entityBtn = (role, excludeId) => {
      const cur = store.entity(sel[role]);
      const curIsCat = cur && store.isCategoryId(cur.id);
      return el('button', { class: 'select select-btn', onclick: (e) => {
        ui.codePicker(e.currentTarget, {
          codes: pickItems(excludeId),
          allowCreate: false,
          onPick: (c) => { sel[role] = c.id; rebindSidePanel(); },
        });
      } }, [el('span', { class: 'sb-label' + (cur ? '' : ' muted'), text: cur ? (curIsCat ? '▣ ' : '') + cur.name : '— selecionar —' }), el('span', { class: 'sb-caret', text: '▾' })]);
    };

    side.appendChild(el('label', { class: 'field-label', style: 'margin-top:10px', text: 'Origem' }));
    side.appendChild(entityBtn('source', sel.target));

    side.appendChild(el('label', { class: 'field-label', style: 'margin-top:10px', text: 'Relação' }));
    const typeSel = el('select', { class: 'select', onchange: e => sel.type = e.target.value }, [
      el('option', { value: '', text: '— tipo —' }),
      ...types.map(t => el('option', { value: t, text: t, selected: t === sel.type })),
    ]);
    side.appendChild(typeSel);

    side.appendChild(el('label', { class: 'field-label', style: 'margin-top:10px', text: 'Destino' }));
    side.appendChild(entityBtn('target', sel.source));

    side.appendChild(el('button', { class: 'btn btn-primary', style: 'width:100%;margin-top:14px', text: 'Adicionar relação', onclick: () => {
      if (!sel.source || !sel.target || !sel.type) { ui.toast('Escolha origem, tipo e destino', 'error'); return; }
      if (sel.source === sel.target) { ui.toast('Origem e destino devem ser diferentes', 'error'); return; }
      const id = store.addRelation(sel.source, sel.target, sel.type);
      if (id == null) ui.toast('Essa relação já existe', 'error'); else ui.toast('Relação adicionada', 'ok');
    } }));

    // relação selecionada
    if (sel.edgeId) {
      const r = (s.relations || []).find(x => x.id === sel.edgeId);
      if (r) {
        const from = store.entity(r.sourceId), to = store.entity(r.targetId);
        side.appendChild(el('div', { style: 'height:1px;background:var(--border);margin:16px 0' }));
        side.appendChild(el('label', { class: 'section-label', text: 'Relação selecionada' }));
        side.appendChild(el('div', { class: 'tiny muted', style: 'margin:6px 0 8px', text: `${from ? from.name : '?'} → ${r.type} → ${to ? to.name : '?'}` }));
        side.appendChild(el('button', { class: 'btn btn-danger btn-outline btn-sm', style: 'width:100%', html: QC.icon('trash', 16) + '<span>Excluir relação</span>', onclick: () => { store.removeRelation(r.id); sel.edgeId = null; } }));
      }
    }

    // filtro por categoria (subcategorias indentadas; filtrar pela pai inclui as filhas)
    side.appendChild(el('div', { style: 'height:1px;background:var(--border);margin:16px 0' }));
    side.appendChild(el('label', { class: 'field-label', text: 'Filtrar por categoria' }));
    const catOpts = [];
    store.rootCategories().forEach(root => {
      catOpts.push(el('option', { value: root.id, text: root.name, selected: root.id === sel.catFilter }));
      store.childCategories(root.id).forEach(sub =>
        catOpts.push(el('option', { value: sub.id, text: '— ' + sub.name, selected: sub.id === sel.catFilter })));
    });
    side.appendChild(el('select', { class: 'select', onchange: e => { sel.catFilter = e.target.value; store.rerender(); } }, [
      el('option', { value: '', text: 'Todas as categorias' }),
      ...catOpts,
    ]));

    side.appendChild(el('div', { class: 'tiny muted', style: 'margin-top:16px', text: (s.relations || []).length + ' ' + U.pluralize((s.relations || []).length, 'conexão ativa', 'conexões ativas') }));
  }

  // popover ao clicar numa aresta: digitar/escolher o tipo da relação.
  // opts.relation presente → edita a existente; ausente → cria sourceId → targetId.
  function openTypeEditor(opts, x, y) {
    ui.closeMenus();
    const editing = opts.relation || null;
    const pop = el('div', { class: 'menu-pop code-picker' });
    const list = el('div', { class: 'cp-list' });

    const apply = (t) => {
      t = (t || '').trim();
      if (!t) return;
      if (!editing) {
        const dup = (store.state.relations || []).some(v => v.sourceId === opts.sourceId && v.targetId === opts.targetId && v.type === t);
        if (dup) { ui.toast('Essa relação já existe', 'error'); return; }
      }
      ui.closeMenus();
      store.update(s => {
        s.graph = s.graph || { positions: {}, relationTypes: [] };
        s.graph.relationTypes = s.graph.relationTypes || [];
        if (!s.graph.relationTypes.includes(t)) s.graph.relationTypes.push(t);
        if (editing) {
          const rel = (s.relations || []).find(v => v.id === editing.id);
          if (rel) rel.type = t;
        } else {
          s.relations.push({ id: U.uid('rel'), sourceId: opts.sourceId, targetId: opts.targetId, type: t });
        }
      });
      ui.toast(editing ? 'Relação atualizada' : 'Relação criada', 'ok');
    };

    const renderList = (filter) => {
      list.innerHTML = '';
      const types = (store.state.graph && store.state.graph.relationTypes) || QC.seed.RELATION_TYPES;
      const fq = U.fold((filter || '').trim());
      const matches = types.filter(t => U.fold(t).includes(fq));
      if (!matches.length) list.appendChild(el('div', { class: 'cp-empty', text: 'Enter cria e aplica este tipo novo.' }));
      matches.forEach(t => list.appendChild(el('button', { class: 'cp-item', onclick: () => apply(t) }, [
        el('span', { class: 'cp-name', text: t }),
        editing && t === editing.type ? el('span', { class: 'cp-count', text: '✓' }) : null,
      ])));
    };

    const input = el('input', {
      class: 'cp-search', placeholder: editing ? editing.type + ' → digite para trocar…' : 'Nome da relação… (Enter cria)',
      oninput: (ev) => renderList(ev.target.value),
      onkeydown: (ev) => { if (ev.key === 'Enter' && ev.target.value.trim()) apply(ev.target.value); },
    });
    const from = store.entity(opts.sourceId), to = store.entity(opts.targetId);
    pop.appendChild(el('div', { class: 'cp-head' }, [
      el('div', { class: 'tiny muted', style: 'padding:0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', text: (from ? from.name : '?') + ' → ' + (to ? to.name : '?') }),
      input,
    ]));
    pop.appendChild(list);
    if (editing) pop.appendChild(el('button', { class: 'menu-item danger', style: 'margin:4px', onclick: () => {
      ui.closeMenus(); store.removeRelation(editing.id); sel.edgeId = null; ui.toast('Relação excluída');
    } }, [el('span', { class: 'menu-ic', html: QC.icon('trash', 15) }), el('span', { text: 'Excluir relação' })]));

    renderList('');
    document.body.appendChild(pop);
    let top = y + 8;
    const left = Math.max(8, Math.min(x, window.innerWidth - pop.offsetWidth - 8));
    if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, y - pop.offsetHeight - 8);
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
    setTimeout(() => {
      input.focus();
      const onDoc = (ev) => { if (!pop.contains(ev.target)) { ui.closeMenus(); document.removeEventListener('mousedown', onDoc); } };
      document.addEventListener('mousedown', onDoc);
    }, 0);
  }

  function relayout() {
    store.update(st => { if (st.graph) st.graph.positions = {}; });
    fitView();
  }

  // ---------------- layout automático em árvore hierárquica (top-down) ----------------
  // Raiz no topo, subcategorias e códigos-diretos no nível 1, códigos de subcategorias no
  // nível 2. Cada pai é centralizado horizontalmente sobre seus filhos. Árvores-raiz ficam
  // lado a lado; órfãos numa faixa embaixo. Uma única mutação → um Ctrl+Z desfaz.
  const TREE_GAPX = 26, TREE_LEVELY = 130;

  function layoutAsTree() {
    const s = store.state;
    const roots = store.rootCategories();
    const orphans = (s.codes || []).filter(c => !c.categoryId);
    if (!roots.length && !orphans.length) { ui.toast('Nada para organizar', 'error'); return; }

    const positions = {};
    let cursorX = 60;
    const baseY = 60;
    const leafW = (name, isCat) => layoutLabel(name, isCat).w;

    // subcategoria no nível 1, seus códigos no nível 2; devolve { cx, x1 }
    const placeSub = (sub, startX, y1) => {
      const codes = store.codesInCategory(sub.id);
      let x = startX, first = null, last = null;
      const y2 = y1 + TREE_LEVELY;
      codes.forEach(c => {
        const w = leafW(c.name, false);
        positions[c.id] = { x: x + w / 2, y: y2 };
        if (first === null) first = x + w / 2;
        last = x + w / 2;
        x += w + TREE_GAPX;
      });
      const subW = leafW(sub.name, true);
      let cx;
      if (codes.length) cx = (first + last) / 2;
      else { cx = startX + subW / 2; x = startX + subW + TREE_GAPX; }
      positions[sub.id] = { x: cx, y: y1 };
      const x1 = Math.max(x - TREE_GAPX, cx + subW / 2);
      return { cx, x1 };
    };

    // raiz no topo; códigos-diretos + subcategorias no nível 1
    const placeRoot = (root, startX) => {
      const y1 = baseY + TREE_LEVELY;
      let x = startX;
      const childCentersX = [];
      store.codesInCategory(root.id).forEach(c => {
        const w = leafW(c.name, false);
        positions[c.id] = { x: x + w / 2, y: y1 };
        childCentersX.push(x + w / 2);
        x += w + TREE_GAPX;
      });
      store.childCategories(root.id).forEach(sub => {
        const r = placeSub(sub, x, y1);
        childCentersX.push(r.cx);
        x = r.x1 + TREE_GAPX;
      });
      const rootW = leafW(root.name, true);
      let cx;
      if (childCentersX.length) cx = (childCentersX[0] + childCentersX[childCentersX.length - 1]) / 2;
      else { cx = startX + rootW / 2; x = startX + rootW + TREE_GAPX; }
      positions[root.id] = { x: cx, y: baseY };
      return Math.max(x - TREE_GAPX, cx + rootW / 2);
    };

    roots.forEach(root => { cursorX = placeRoot(root, cursorX) + 80; });

    if (orphans.length) {
      let x = 60; const y = baseY + TREE_LEVELY * 3;
      orphans.forEach(c => { const w = leafW(c.name, false); positions[c.id] = { x: x + w / 2, y }; x += w + TREE_GAPX; });
    }

    store.update(st => {
      st.graph = st.graph || { positions: {}, relationTypes: [] };
      st.graph.positions = positions;
    });
    fitView();
    ui.toast('Rede em árvore hierárquica · Ctrl+Z desfaz');
  }

  // ---------------- layout automático por categorias ----------------
  // Cada categoria raiz vira um bloco: nó da categoria no topo, códigos dela
  // empilhados embaixo (em linhas), subcategorias indentadas com seus códigos.
  // Blocos são distribuídos em linhas no canvas. Uma única mutação → um Ctrl+Z desfaz.
  const GAPX = 18, GAPY = 26;

  function layoutByCategories() {
    const s = store.state;
    const clusters = [];
    store.rootCategories().forEach(root => clusters.push(clusterFor(root)));
    const orphans = (s.codes || []).filter(c => !c.categoryId);
    if (orphans.length) clusters.push(orphanCluster(orphans));
    if (!clusters.length) { ui.toast('Nada para organizar', 'error'); return; }

    // distribui os blocos em linhas
    const wrap = document.getElementById('net-wrap');
    const rowLimit = Math.max(((wrap && wrap.clientWidth) || 1200) * 1.3, 1200);
    const MARGIN = 90;
    const positions = {};
    let x = 60, y = 60, rowH = 0;
    clusters.forEach(cl => {
      if (x > 60 && x + cl.w > rowLimit) { x = 60; y += rowH + MARGIN; rowH = 0; }
      cl.nodes.forEach(n => { positions[n.id] = { x: x + n.x, y: y + n.y }; });
      x += cl.w + MARGIN; rowH = Math.max(rowH, cl.h);
    });

    store.update(st => {
      st.graph = st.graph || { positions: {}, relationTypes: [] };
      st.graph.positions = positions;
    });
    fitView();
    ui.toast('Rede agrupada por categorias · Ctrl+Z desfaz');
  }

  // empilha nós em linhas dentro da largura cw; devolve o y inferior
  function packRows(items, cw, indent, startY, nodes) {
    let cx = indent, cy = startY, rowH = 0;
    items.forEach(it => {
      if (cx > indent && cx + it.lay.w > cw) { cx = indent; cy += rowH + GAPY; rowH = 0; }
      nodes.push({ id: it.id, x: cx + it.lay.halfW, y: cy + it.lay.halfH });
      cx += it.lay.w + GAPX; rowH = Math.max(rowH, it.lay.halfH * 2);
    });
    return cy + rowH;
  }

  function clusterFor(root) {
    const nodes = [];
    const rootLay = layoutLabel(root.name, true);
    const own = store.codesInCategory(root.id).map(c => ({ id: c.id, lay: layoutLabel(c.name, false) }));
    const subs = store.childCategories(root.id).map(sub => ({
      sub, lay: layoutLabel(sub.name, true),
      codes: store.codesInCategory(sub.id).map(c => ({ id: c.id, lay: layoutLabel(c.name, false) })),
    }));
    const widths = [rootLay.w].concat(own.map(i => i.lay.w))
      .concat(subs.map(x => x.lay.w + 24))
      .concat(subs.flatMap(x => x.codes.map(i => i.lay.w + 24)));
    const cw = U.clamp(Math.max.apply(null, widths) + 40, 360, 680);

    // categoria centralizada no topo do bloco
    nodes.push({ id: root.id, x: cw / 2, y: rootLay.halfH });
    let y = rootLay.halfH * 2 + GAPY + 6;
    y = packRows(own, cw, 0, y, nodes);
    subs.forEach(x => {
      y += own.length || nodes.length > 1 ? GAPY : 0;
      nodes.push({ id: x.sub.id, x: 24 + x.lay.halfW, y: y + x.lay.halfH });
      y += x.lay.halfH * 2 + GAPY;
      y = packRows(x.codes, cw, 24, y, nodes);
    });
    return { w: cw, h: y, nodes };
  }

  function orphanCluster(orphans) {
    const nodes = [];
    const items = orphans.map(c => ({ id: c.id, lay: layoutLabel(c.name, false) }));
    const cw = U.clamp(Math.max.apply(null, items.map(i => i.lay.w)) + 40, 360, 680);
    const h = packRows(items, cw, 0, 0, nodes);
    return { w: cw, h, nodes };
  }

  // enquadra todos os nós visíveis na viewport
  function fitView() {
    const v = visibleSets(store.state);
    const items = v.codes.concat(v.cats).filter(c => pos[c.id]);
    if (!items.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(c => {
      const p = pos[c.id], sz = sizeOf(c.id);
      minX = Math.min(minX, p.x - sz.halfW); maxX = Math.max(maxX, p.x + sz.halfW);
      minY = Math.min(minY, p.y - sz.halfH); maxY = Math.max(maxY, p.y + sz.halfH);
    });
    const wrap = document.getElementById('net-wrap');
    const W = (wrap && wrap.clientWidth) || 800, H = (wrap && wrap.clientHeight) || 600;
    cam.zoom = U.clamp(Math.min(W / (maxX - minX + 100), H / (maxY - minY + 100)), 0.3, 1.4);
    cam.panX = W / 2 - cam.zoom * (minX + maxX) / 2;
    cam.panY = H / 2 - cam.zoom * (minY + maxY) / 2;
    applyCam();
  }

  function exportPNG() {
    try {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', SVGNS);
      const data = new XMLSerializer().serializeToString(clone);
      U.downloadFile('rede_qualicode.svg', data, 'image/svg+xml');
      ui.toast('Rede exportada (.svg)', 'ok');
    } catch (e) { ui.toast('Falha ao exportar', 'error'); }
  }

  QC.screens = QC.screens || {};
  QC.screens.network = { render, scoped: true };
})(window.QC = window.QC || {});
