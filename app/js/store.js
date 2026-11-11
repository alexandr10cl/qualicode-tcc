/* store.js — estado do projeto aberto + mutações + autosave + seletores derivados */
(function (QC) {
  const U = QC.util;

  // Paleta pastel para códigos (cor = ponto/destaque; o fundo é derivado por transparência)
  const PALETTE = [
    '#f59e0b', '#14b8a6', '#f43f5e', '#8b5cf6', '#22c55e',
    '#0ea5e9', '#f97316', '#ec4899', '#84cc16', '#6366f1',
    '#ef4444', '#06b6d4', '#a855f7', '#10b981', '#eab308',
  ];

  const Store = QC.store = {
    state: null,
    PALETTE,
    _renderFn: null,
    _onSave: null,
    _undo: [],
    _redo: [],
    _maxHistory: 40,

    onRender(fn) { this._renderFn = fn; },
    onSaveStatus(fn) { this._onSave = fn; },
    rerender() { if (this._renderFn) this._renderFn(); },

    setProject(project) {
      this.state = project;
      this.resetHistory();
      QC.db.saveProject(project);
      this.rerender();
    },
    clear() { this.state = null; this.resetHistory(); },

    // ---------- histórico (undo/redo) ----------
    resetHistory() { this._undo = []; this._redo = []; },
    _snapshot() { return JSON.parse(JSON.stringify(this.state)); },
    canUndo() { return this._undo.length > 0; },
    canRedo() { return this._redo.length > 0; },
    undo() {
      if (!this._undo.length) return false;
      this._redo.push(this._snapshot());
      this.state = this._undo.pop();
      this.state.updatedAt = U.nowISO();
      this._persist();
      this.rerender();
      return true;
    },
    redo() {
      if (!this._redo.length) return false;
      this._undo.push(this._snapshot());
      this.state = this._redo.pop();
      this.state.updatedAt = U.nowISO();
      this._persist();
      this.rerender();
      return true;
    },

    // mutação central. mutator recebe o estado; persiste sempre; re-renderiza se render!==false.
    // Só registra no histórico as mutações estruturais (render!==false); edições contínuas
    // de texto (comentário, memo, posição de nó) passam render:false e não poluem o undo.
    update(mutator, opts) {
      opts = opts || {};
      const track = opts.render !== false && opts.undo !== false;
      if (track) {
        this._undo.push(this._snapshot());
        if (this._undo.length > this._maxHistory) this._undo.shift();
        this._redo = [];
      }
      mutator(this.state);
      this.state.updatedAt = U.nowISO();
      this._persist();
      if (opts.render !== false) this.rerender();
    },

    _persist: null, // setado abaixo

    // ---------- seletores ----------
    doc(id) { return (this.state.documents || []).find(d => d.id === id); },
    code(id) { return (this.state.codes || []).find(c => c.id === id); },
    category(id) { return (this.state.categories || []).find(c => c.id === id); },
    memo(id) { return (this.state.memos || []).find(m => m.id === id); },
    quotation(id) { return (this.state.quotations || []).find(q => q.id === id); },

    quotationsOf(codeId) { return (this.state.quotations || []).filter(q => (q.codeIds || []).includes(codeId)); },
    quotationsInDoc(docId) { return (this.state.quotations || []).filter(q => q.documentId === docId); },
    codesInCategory(catId) { return (this.state.codes || []).filter(c => c.categoryId === catId); },
    codeCount(codeId) { return this.quotationsOf(codeId).length; },

    // hierarquia de categorias (2 níveis: raiz > subcategoria)
    rootCategories() { return (this.state.categories || []).filter(c => !c.parentId); },
    childCategories(catId) { return (this.state.categories || []).filter(c => c.parentId === catId); },
    catAndChildrenIds(catId) { return [catId].concat(this.childCategories(catId).map(c => c.id)); },
    codesInCategoryDeep(catId) {
      const ids = this.catAndChildrenIds(catId);
      return (this.state.codes || []).filter(c => ids.includes(c.categoryId));
    },
    // resolve um id de relação para código ou categoria
    entity(id) { return this.code(id) || this.category(id); },
    isCategoryId(id) { return !!this.category(id); },

    nextColor() {
      const used = (this.state.codes || []).map(c => c.color);
      const free = PALETTE.find(c => !used.includes(c));
      return free || PALETTE[(this.state.codes || []).length % PALETTE.length];
    },

    // co-ocorrência: nº de quotations que contêm ambos os códigos
    coOccurrence(aId, bId) {
      if (aId === bId) return this.codeCount(aId);
      let n = 0;
      (this.state.quotations || []).forEach(q => {
        const ids = q.codeIds || [];
        if (ids.includes(aId) && ids.includes(bId)) n++;
      });
      return n;
    },

    // ---------- mutações de alto nível ----------
    addDocument(name, text) {
      const id = U.uid('doc');
      this.update(s => s.documents.push({ id, name, text, importedAt: U.nowISO() }));
      return id;
    },
    removeDocument(id) {
      this.update(s => {
        s.documents = s.documents.filter(d => d.id !== id);
        s.quotations = s.quotations.filter(q => q.documentId !== id);
      });
    },
    // Edita o texto de um documento e reancora as quotations por diff (prefixo/sufixo comum).
    // Retorna { changes:[{ oldText, newText, codeNames:[], removed:bool }] } — só os trechos
    // cujas posições mudaram, para o usuário conferir a reancoragem (antes → depois).
    updateDocumentText(docId, newText) {
      const doc = this.doc(docId);
      if (!doc || doc.text === newText) return { changes: [] };
      const oldText = doc.text;

      // região que mudou: [editStart, oldEnd) no texto velho -> [editStart, newEnd) no novo
      let p = 0;
      const maxP = Math.min(oldText.length, newText.length);
      while (p < maxP && oldText[p] === newText[p]) p++;
      let so = oldText.length, sn = newText.length;
      while (so > p && sn > p && oldText[so - 1] === newText[sn - 1]) { so--; sn--; }
      const editStart = p, oldEnd = so, newEnd = sn;
      const delta = newEnd - oldEnd; // deslocamento aplicado ao que vem depois da edição

      const codeNamesOf = (q) => (q.codeIds || []).map(cid => { const c = this.code(cid); return c ? c.name : null; }).filter(Boolean);
      const changes = [];
      this.update(s => {
        const d = s.documents.find(x => x.id === docId);
        d.text = newText;
        s.quotations.forEach(q => {
          if (q.documentId !== docId) return;
          // remapeia cada extremidade: antes da edição = intacta; depois = +delta;
          // dentro da região editada = "gruda" na borda inicial da edição.
          const map = (i) => i <= editStart ? i : (i >= oldEnd ? i + delta : editStart);
          const ns = map(q.start), ne = Math.max(map(q.end), map(q.start));
          const oldSnippet = q.text;
          q.start = ns; q.end = ne;
          q.text = newText.slice(q.start, q.end); // ressincroniza a cópia literal
          // só reporta o que o usuário tem a conferir: texto do trecho mudou ou o trecho foi
          // apagado. Trecho que só deslocou (texto idêntico) é reancorado sem entrar no popup.
          if (q.text !== oldSnippet) changes.push({ oldText: oldSnippet, newText: q.text, codeNames: codeNamesOf(q), removed: ne <= ns });
        });
        // remove trechos que colapsaram (edição engoliu o trecho inteiro)
        s.quotations = s.quotations.filter(q => q.documentId !== docId || q.end > q.start);
      });
      return { changes };
    },

    addCode(name, opts) {
      opts = opts || {};
      const id = U.uid('code');
      const code = {
        id, name: name || 'Novo código',
        color: opts.color || this.nextColor(),
        categoryId: opts.categoryId || null,
        comment: '', createdAt: U.nowISO(),
      };
      this.update(s => s.codes.push(code));
      return id;
    },
    updateCode(id, patch, render) {
      this.update(s => { const c = s.codes.find(x => x.id === id); if (c) Object.assign(c, patch); }, { render: render !== false });
    },
    removeCode(id) {
      this.update(s => {
        s.codes = s.codes.filter(c => c.id !== id);
        s.relations = s.relations.filter(r => r.sourceId !== id && r.targetId !== id);
        s.quotations.forEach(q => { q.codeIds = (q.codeIds || []).filter(cid => cid !== id); });
        // quotations órfãs (sem código) permanecem? removemos as sem código nem comentário
        s.quotations = s.quotations.filter(q => (q.codeIds && q.codeIds.length) || (q.comment && q.comment.trim()));
        if (s.graph && s.graph.positions) delete s.graph.positions[id];
      });
    },
    mergeCodes(sourceId, targetId) {
      if (sourceId === targetId) return;
      this.update(s => {
        s.quotations.forEach(q => {
          if ((q.codeIds || []).includes(sourceId)) {
            q.codeIds = q.codeIds.filter(c => c !== sourceId);
            if (!q.codeIds.includes(targetId)) q.codeIds.push(targetId);
          }
        });
        s.relations.forEach(r => {
          if (r.sourceId === sourceId) r.sourceId = targetId;
          if (r.targetId === sourceId) r.targetId = targetId;
        });
        s.relations = s.relations.filter(r => r.sourceId !== r.targetId);
        s.codes = s.codes.filter(c => c.id !== sourceId);
        if (s.graph && s.graph.positions) delete s.graph.positions[sourceId];
      });
    },

    addCategory(name, opts) {
      opts = opts || {};
      const id = U.uid('cat');
      this.update(s => s.categories.push({
        id, name: name || 'Nova categoria', parentId: opts.parentId || null,
        color: opts.color || '#64748b', deductive: !!opts.deductive,
      }));
      return id;
    },
    updateCategory(id, patch, render) {
      this.update(s => { const c = s.categories.find(x => x.id === id); if (c) Object.assign(c, patch); }, { render: render !== false });
    },
    removeCategory(id) {
      this.update(s => {
        s.categories = s.categories.filter(c => c.id !== id);
        s.categories.forEach(c => { if (c.parentId === id) c.parentId = null; }); // filhas sobem pra raiz
        s.codes.forEach(c => { if (c.categoryId === id) c.categoryId = null; });
        s.relations = s.relations.filter(r => r.sourceId !== id && r.targetId !== id);
        if (s.graph && s.graph.positions) delete s.graph.positions[id];
      });
    },

    // cria quotation a partir de seleção e aplica/cria código
    addQuotation(documentId, start, end, text) {
      const id = U.uid('quo');
      this.update(s => s.quotations.push({
        id, documentId, start, end, text, codeIds: [], comment: '', createdAt: U.nowISO(),
      }));
      return id;
    },
    applyCodeToQuotation(quotationId, codeId) {
      this.update(s => {
        const q = s.quotations.find(x => x.id === quotationId);
        if (q && !(q.codeIds || []).includes(codeId)) { q.codeIds = q.codeIds || []; q.codeIds.push(codeId); }
      });
    },
    removeCodeFromQuotation(quotationId, codeId) {
      this.update(s => {
        const q = s.quotations.find(x => x.id === quotationId);
        if (!q) return;
        q.codeIds = (q.codeIds || []).filter(c => c !== codeId);
        if (!q.codeIds.length && !(q.comment && q.comment.trim())) {
          s.quotations = s.quotations.filter(x => x.id !== quotationId);
        }
      });
    },
    setQuotationComment(quotationId, comment, render) {
      this.update(s => { const q = s.quotations.find(x => x.id === quotationId); if (q) q.comment = comment; }, { render: render !== false });
    },

    // sourceId/targetId aceitam código OU categoria
    addRelation(sourceId, targetId, type) {
      if (!sourceId || !targetId || sourceId === targetId) return null;
      const exists = (this.state.relations || []).some(r =>
        r.sourceId === sourceId && r.targetId === targetId && r.type === type);
      if (exists) return null;
      const id = U.uid('rel');
      this.update(s => s.relations.push({ id, sourceId, targetId, type }));
      return id;
    },
    removeRelation(id) { this.update(s => { s.relations = s.relations.filter(r => r.id !== id); }); },

    setNodePosition(codeId, x, y, render) {
      this.update(s => {
        s.graph = s.graph || { positions: {}, relationTypes: [] };
        s.graph.positions = s.graph.positions || {};
        s.graph.positions[codeId] = { x, y };
      }, { render: render !== false });
    },
    // grava várias posições numa única mutação → um único Ctrl+Z desfaz o grupo.
    // map: { id: {x, y} }. Registra histórico e re-renderiza (ao soltar o arraste em grupo).
    setNodePositions(map) {
      this.update(s => {
        s.graph = s.graph || { positions: {}, relationTypes: [] };
        s.graph.positions = s.graph.positions || {};
        for (const id in map) s.graph.positions[id] = { x: map[id].x, y: map[id].y };
      });
    },
    addRelationType(name) {
      this.update(s => {
        s.graph = s.graph || { positions: {}, relationTypes: [] };
        s.graph.relationTypes = s.graph.relationTypes || [];
        if (name && !s.graph.relationTypes.includes(name)) s.graph.relationTypes.push(name);
      });
    },

    addMemo(title) {
      const id = U.uid('memo');
      this.update(s => s.memos.unshift({
        id, title: title || 'Novo memo', body: '', links: [], createdAt: U.nowISO(), updatedAt: U.nowISO(),
      }));
      return id;
    },
    updateMemo(id, patch, render) {
      this.update(s => { const m = s.memos.find(x => x.id === id); if (m) { Object.assign(m, patch); m.updatedAt = U.nowISO(); } }, { render: render !== false });
    },
    removeMemo(id) { this.update(s => { s.memos = s.memos.filter(m => m.id !== id); }); },
    addMemoLink(memoId, type, refId) {
      this.update(s => {
        const m = s.memos.find(x => x.id === memoId); if (!m) return;
        m.links = m.links || [];
        if (!m.links.some(l => l.type === type && l.id === refId)) m.links.push({ type, id: refId });
      });
    },
    removeMemoLink(memoId, type, refId) {
      this.update(s => {
        const m = s.memos.find(x => x.id === memoId); if (!m) return;
        m.links = (m.links || []).filter(l => !(l.type === type && l.id === refId));
      });
    },
  };

  // autosave debounced + indicador de status
  const persist = U.debounce(() => {
    if (!Store.state) return;
    if (Store._onSave) Store._onSave('saving');
    Promise.resolve(QC.db.saveProject(Store.state))
      .then(() => { if (Store._onSave) Store._onSave('saved'); })
      .catch(() => { if (Store._onSave) Store._onSave('error'); });
  }, 350);
  Store._persist = persist;

})(window.QC = window.QC || {});
