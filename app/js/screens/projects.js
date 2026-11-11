/* screens/projects.js — tela inicial: novo/importar/listar projetos */
(function (QC) {
  const U = QC.util, el = U.el, ui = QC.ui;

  const ICONS = ['folder', 'flask', 'fileText', 'book'];

  async function render(host) {
    host.innerHTML = '';
    const list = await QC.db.listProjects();

    const page = el('div', { class: 'projects-page' });

    // hero
    page.appendChild(el('div', { class: 'projects-hero' }, [
      el('h1', { text: 'QualiCode' }),
      el('p', { text: 'Análise qualitativa local: codificação aberta e axial das suas entrevistas, 100% no navegador.' }),
      el('div', { class: 'projects-actions' }, [
        el('button', { class: 'btn btn-primary', onclick: onNew, html: QC.icon('plusCircle') + '<span>Novo projeto</span>' }),
        el('button', { class: 'btn btn-outline', onclick: onImport, html: QC.icon('upload') + '<span>Importar projeto (.json)</span>' }),
      ]),
    ]));

    // recentes
    page.appendChild(el('div', { class: 'projects-head' }, [
      el('h2', { text: 'Projetos recentes' }),
      el('span', { class: 'muted tiny', text: list.length + ' ' + U.pluralize(list.length, 'projeto', 'projetos') }),
    ]));

    if (!list.length) {
      page.appendChild(ui.empty('folder', 'Nenhum projeto ainda',
        'Crie um projeto novo ou importe um .json para começar.',
        el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:10px', onclick: loadExample, text: 'Carregar dados de exemplo' })));
    } else {
      const grid = el('div', { class: 'projects-grid' });
      list.forEach((p, i) => grid.appendChild(card(p, i)));
      page.appendChild(grid);
    }

    page.appendChild(el('div', { class: 'projects-footer' }, [
      el('span', { text: 'QualiCode · versão do navegador · ' + (QC.db.mode() === 'idb' ? 'IndexedDB' : 'localStorage') }),
      el('span', { text: 'Dados ficam só neste navegador. Exporte .json para backup.' }),
    ]));

    host.appendChild(page);
  }

  function card(p, i) {
    const stat = (icon, label, val) => el('div', { class: 'proj-stat' }, [
      el('span', { class: 'lbl', html: QC.icon(icon, 16) + '<span>' + U.escapeHtml(label) + '</span>' }),
      el('span', { class: 'val', text: String(val) }),
    ]);
    const open = () => QC.app.openProject(p.id);
    return el('div', { class: 'proj-card', onclick: open }, [
      el('div', { class: 'proj-card-top' }, [
        el('div', { class: 'proj-ic', html: QC.icon(ICONS[i % ICONS.length], 22) }),
        el('button', {
          class: 'icon-btn', html: QC.icon('dots', 18),
          onclick: (e) => { e.stopPropagation(); cardMenu(e.currentTarget, p); },
        }),
      ]),
      el('h3', { class: 'proj-name', title: p.name, text: p.name }),
      el('div', { class: 'proj-stats' }, [
        stat('fileText', 'Documentos', p.counts.documents),
        stat('tag', 'Códigos', p.counts.codes),
        stat('list', 'Trechos', p.counts.quotations),
      ]),
      el('div', { class: 'proj-foot' }, [
        el('span', { class: 'k', text: 'Última edição' }),
        el('span', { class: 'v', text: U.formatDate(p.updatedAt) }),
      ]),
    ]);
  }

  function cardMenu(anchor, p) {
    ui.menu(anchor, [
      { label: 'Abrir', icon: 'fileText', onClick: () => QC.app.openProject(p.id) },
      { label: 'Exportar (.json)', icon: 'download', onClick: async () => { const full = await QC.db.loadProject(p.id); QC.seed.exportProject(full); } },
      { label: 'Renomear', icon: 'edit', onClick: async () => {
          const name = await ui.prompt({ title: 'Renomear projeto', label: 'Nome', value: p.name, okLabel: 'Salvar' });
          if (name) { const full = await QC.db.loadProject(p.id); full.name = name; full.updatedAt = U.nowISO(); await QC.db.saveProject(full); render(document.getElementById('screen')); }
        } },
      { divider: true },
      { label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
          if (await ui.confirm('Excluir "' + p.name + '"? Esta ação não pode ser desfeita.', { danger: true, okLabel: 'Excluir' })) {
            await QC.db.deleteProject(p.id);
            ui.toast('Projeto excluído');
            render(document.getElementById('screen'));
          }
        } },
    ]);
  }

  async function onNew() {
    const name = await ui.prompt({ title: 'Novo projeto', label: 'Nome do projeto', placeholder: 'Ex.: Estudo de Campo — TCC', okLabel: 'Criar' });
    if (name == null) return;
    const withCats = await ui.confirm('Começar com 3 categorias dedutivas em branco (das suas SQs)?', { title: 'Categorias dedutivas', okLabel: 'Sim, criar 3', cancelLabel: 'Não, vazio' });
    const proj = withCats ? QC.seed.newProjectWithDeductive(name || 'Novo projeto') : QC.seed.emptyProject(name || 'Novo projeto');
    await QC.db.saveProject(proj);
    QC.app.openProject(proj.id);
  }

  async function onImport() {
    const files = await ui.pickFiles('.json,application/json', false);
    if (!files.length) return;
    try {
      const text = await ui.readFileText(files[0]);
      const obj = QC.seed.validateProject(JSON.parse(text));
      // se id colidir com existente, gera novo
      const existing = await QC.db.loadProject(obj.id);
      if (existing) obj.id = U.uid('proj');
      await QC.db.saveProject(obj);
      ui.toast('Projeto importado', 'ok');
      QC.app.openProject(obj.id);
    } catch (e) {
      ui.toast('Falha ao importar: ' + (e.message || 'arquivo inválido'), 'error');
    }
  }

  async function loadExample() {
    const proj = QC.seed.exampleProject();
    await QC.db.saveProject(proj);
    QC.app.openProject(proj.id);
  }

  QC.screens = QC.screens || {};
  QC.screens.projects = { render, scoped: false };
})(window.QC = window.QC || {});
