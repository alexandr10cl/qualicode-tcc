/* app.js — controlador: navegação, nav rail, sessão, autosave status */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui, store = QC.store;
  const SESSION_KEY = 'qc_session';

  const NAV = [
    { key: 'coding', label: 'Codificação', icon: 'coding' },
    { key: 'codebook', label: 'Codebook', icon: 'codebook' },
    { key: 'book', label: 'Livro', icon: 'bookOpen' },
    { key: 'network', label: 'Rede', icon: 'network' },
    { key: 'retrieval', label: 'Recuperação', icon: 'retrieval' },
    { key: 'memos', label: 'Memos', icon: 'memos' },
    { key: 'dashboard', label: 'Painel', icon: 'dashboard' },
  ];

  const App = QC.app = {
    current: 'projects',
    params: null,

    async init() {
      const railHost = document.getElementById('navrail');
      this.railHost = railHost;
      this.screenHost = document.getElementById('screen');

      await QC.db.init();
      store.onRender(() => this.renderAll());
      store.onSaveStatus((status) => this.setSaveStatus(status));

      // tenta restaurar sessão
      const sess = this.readSession();
      if (sess && sess.projectId) {
        const proj = await QC.db.loadProject(sess.projectId);
        if (proj) {
          store.state = this._normalize(proj);
          store.resetHistory();
          this.current = sess.screen && QC.screens[sess.screen] && QC.screens[sess.screen].scoped ? sess.screen : 'coding';
          this.renderAll();
          return;
        }
      }
      this.go('projects');
    },

    readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } },
    writeSession() {
      const data = store.state ? { projectId: store.state.id, screen: this.current } : null;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (e) {}
    },

    // migra projetos antigos salvos no navegador (schema 1 → 2) sem mexer na data de edição
    _normalize(proj) {
      const keepUpdatedAt = proj.updatedAt;
      const v = QC.seed.validateProject(proj);
      if (keepUpdatedAt) v.updatedAt = keepUpdatedAt;
      return v;
    },

    async openProject(id) {
      const proj = await QC.db.loadProject(id);
      if (!proj) { ui.toast('Projeto não encontrado', 'error'); return; }
      store.state = this._normalize(proj);
      store.resetHistory();
      this.current = 'coding'; this.params = null;
      this.writeSession();
      this.renderAll();
    },

    backToProjects() {
      store.clear();
      this.current = 'projects'; this.params = null;
      this.writeSession();
      this.renderAll();
    },

    go(screen, params) {
      if (!QC.screens[screen]) screen = store.state ? 'coding' : 'projects';
      this.current = screen; this.params = params || null;
      const mod = QC.screens[screen];
      if (mod && mod.onEnter) mod.onEnter(this.params);
      this.writeSession();
      this.renderAll();
    },

    renderAll() {
      this.renderRail();
      const mod = QC.screens[this.current];
      if (!mod) return;
      // telas "scoped" exigem projeto aberto
      if (mod.scoped && !store.state) { this.go('projects'); return; }
      const scrolls = this._captureScroll();
      try { mod.render(this.screenHost); }
      catch (e) { console.error(e); this.screenHost.innerHTML = '<div class="empty"><div class="empty-title">Erro ao renderizar a tela</div><div class="empty-sub">' + U.escapeHtml(e.message) + '</div></div>'; }
      this._restoreScroll(scrolls);
    },

    // preserva a posição de rolagem dos contêineres marcados com data-scroll-key entre re-renders
    _captureScroll() {
      const map = {};
      this.screenHost.querySelectorAll('[data-scroll-key]').forEach(node => { map[node.dataset.scrollKey] = node.scrollTop; });
      return map;
    },
    _restoreScroll(map) {
      this.screenHost.querySelectorAll('[data-scroll-key]').forEach(node => {
        const v = map[node.dataset.scrollKey];
        if (v != null) node.scrollTop = v;
      });
    },

    renderRail() {
      const rail = this.railHost;
      const scoped = store.state && this.current !== 'projects';
      if (!scoped) { rail.classList.add('hidden'); rail.innerHTML = ''; return; }
      rail.classList.remove('hidden');
      rail.innerHTML = '';
      rail.appendChild(el('button', { class: 'rail-logo', title: 'Projetos', onclick: () => this.backToProjects(), text: 'Q' }));
      NAV.forEach(n => {
        rail.appendChild(el('button', {
          class: 'rail-btn' + (this.current === n.key ? ' active' : ''),
          dataset: { tip: n.label },
          onclick: () => this.go(n.key),
        }, [el('span', { class: 'ic', html: QC.icon(n.icon, 22) }), el('span', { class: 'rail-label', text: n.label })]));
      });
      rail.appendChild(el('div', { class: 'rail-spacer' }));
      rail.appendChild(el('div', { class: 'rail-foot' }, [
        el('button', { class: 'rail-btn', disabled: !store.canUndo(), dataset: { tip: 'Desfazer (Ctrl+Z)' }, onclick: () => this.doUndo(), html: QC.icon('undo', 20) }),
        el('button', { class: 'rail-btn', disabled: !store.canRedo(), dataset: { tip: 'Refazer (Ctrl+Y)' }, onclick: () => this.doRedo(), html: QC.icon('redo', 20) }),
        el('button', { class: 'rail-btn', dataset: { tip: 'Exportar projeto (.json)' }, onclick: () => QC.seed.exportProject(store.state), html: QC.icon('download', 20) }),
        el('button', { class: 'rail-btn', dataset: { tip: 'Ajuda' }, onclick: () => this.showHelp(), html: QC.icon('help', 20) }),
        el('div', { class: 'save-dot', id: 'save-dot', title: 'Salvo' }),
      ]));
    },

    doUndo() { if (store.undo()) ui.toast('Desfeito'); else ui.toast('Nada para desfazer'); },
    doRedo() { if (store.redo()) ui.toast('Refeito'); else ui.toast('Nada para refazer'); },

    setSaveStatus(status) {
      const dot = document.getElementById('save-dot');
      if (!dot) return;
      dot.className = 'save-dot' + (status === 'saving' ? ' saving' : status === 'error' ? ' error' : '');
      dot.title = status === 'saving' ? 'Salvando…' : status === 'error' ? 'Erro ao salvar' : 'Salvo';
    },

    showHelp() {
      ui.modal({
        title: 'Como usar o QualiCode', size: 'wide',
        body: el('div', { class: 'help', html: `
          <p style="margin-top:0"><b>Fluxo básico:</b></p>
          <ol style="line-height:1.8;padding-left:20px">
            <li><b>Codificação:</b> importe <code>.txt</code>, <b>selecione um trecho</b> no texto e crie/aplique um código (codificação aberta).</li>
            <li><b>Codebook:</b> agrupe códigos em categorias arrastando-os (codificação axial). As 3 categorias dedutivas vêm marcadas. Exporte o <b>livro de códigos</b> (.md/.csv) por aqui.</li>
            <li><b>Livro:</b> o codebook inteiro em modo leitura — categoria, definição e <b>todos</b> os trechos de cada código.</li>
            <li><b>Rede:</b> conecte códigos com relações nomeadas (é causa de, é parte de…).</li>
            <li><b>Recuperação:</b> filtre por código/categoria e exporte os trechos (CSV/Markdown) — sua tabela de evidências.</li>
            <li><b>Memos:</b> registre notas analíticas e vincule-as a códigos/trechos.</li>
            <li><b>Painel:</b> frequências e matriz de co-ocorrência.</li>
          </ol>
          <p><b>Desfazer/refazer:</b> <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> (ou os botões ↩ ↪ na barra). Cobre ações estruturais — criar, aplicar, excluir, mesclar.</p>
          <p><b>Seus dados</b> ficam só neste navegador (${QC.db.mode() === 'idb' ? 'IndexedDB' : 'localStorage'}). <b>Exporte o <code>.json</code></b> com frequência (ícone ⬇ na barra) para backup e para versionar no git. Importar o <code>.json</code> restaura tudo.</p>
        ` }),
        actions: [{ label: 'Entendi', kind: 'btn-primary', onClick: c => c() }],
      });
    },
  };

  // atalhos globais
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { QC.ui.closeMenus(); return; }
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
    if (typing || !store.state) return; // dentro de campos, deixa o undo nativo do navegador
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? App.doRedo() : App.doUndo(); }
    else if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); App.doRedo(); }
  });

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => App.init());
  else App.init();
})(window.QC = window.QC || {});
