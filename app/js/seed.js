/* seed.js — criação de projeto novo, projeto de exemplo, e import/export de .json */
(function (QC) {
  const U = QC.util;

  const RELATION_TYPES = ['é causa de', 'é parte de', 'contradiz', 'está associado a'];

  function emptyProject(name) {
    const now = U.nowISO();
    return {
      schema: 2, // v2: relations com sourceId/targetId (código ou categoria); categorias com parentId em uso
      id: U.uid('proj'),
      name: name || 'Novo projeto',
      createdAt: now,
      updatedAt: now,
      documents: [],
      categories: [],
      codes: [],
      quotations: [],
      relations: [],
      memos: [],
      graph: { positions: {}, relationTypes: RELATION_TYPES.slice() },
    };
  }

  // 3 categorias dedutivas em branco (das SQs) — o usuário renomeia/preenche
  function newProjectWithDeductive(name) {
    const p = emptyProject(name);
    ['Categoria dedutiva 1', 'Categoria dedutiva 2', 'Categoria dedutiva 3'].forEach((n, i) => {
      p.categories.push({ id: U.uid('cat'), name: n, parentId: null, color: ['#6366f1', '#0ea5e9', '#f97316'][i], deductive: true });
    });
    return p;
  }

  function exampleProject() {
    const p = emptyProject('Exemplo — Estudo de Campo');
    const now = U.nowISO();
    const text =
`Entrevistador: Como você descreveria a experiência de quem usa a documentação hoje?

Participante: Olha, é bem inconsistente. Tem parte que é muito boa, bem detalhada, e tem parte que está completamente desatualizada. O desenvolvedor externo chega lá, tenta seguir o passo a passo e simplesmente não funciona, porque a API mudou e ninguém atualizou o texto.

Entrevistador: E como você percebe quando algo não está bom?

Participante: Na maioria das vezes a gente só descobre pelo suporte. Chega uma enxurrada de tickets sobre a mesma coisa e aí a gente entende que aquele ponto da documentação está confuso. Não tenho um número, é mais no feeling mesmo. Eu queria conseguir medir isso de forma mais visível, mas hoje não dá.

Entrevistador: Você sente falta de alguma forma de priorizar essas melhorias?

Participante: Sinto muito. Hoje é quem grita mais alto, ou o que o cliente grande pediu. Eu não consigo justificar para a liderança que vale a pena investir tempo arrumando a documentação se eu não tenho como quantificar o impacto disso. Falta visibilidade.`;
    const docId = U.uid('doc');
    p.documents.push({ id: docId, name: 'Entrevista_01.txt', text, importedAt: now });

    const cats = [
      { id: U.uid('cat'), name: 'Percepção da experiência', parentId: null, color: '#6366f1', deductive: true },
      { id: U.uid('cat'), name: 'Métricas e visibilidade', parentId: null, color: '#0ea5e9', deductive: true },
      { id: U.uid('cat'), name: 'Tomada de decisão', parentId: null, color: '#f97316', deductive: true },
    ];
    p.categories = cats;
    // subcategoria de exemplo (2º nível)
    const subSinais = { id: U.uid('cat'), name: 'Sinais indiretos', parentId: cats[1].id, color: '#14b8a6', deductive: false };
    p.categories.push(subSinais);

    const mk = (name, color, catId) => { const id = U.uid('code'); p.codes.push({ id, name, color, categoryId: catId, comment: '', createdAt: now }); return id; };
    const cInconsist = mk('Inconsistência da documentação', '#f59e0b', cats[0].id);
    const cDesatual = mk('Conteúdo desatualizado', '#f43f5e', cats[0].id);
    const cSuporte = mk('Sinal via suporte', '#14b8a6', subSinais.id);
    const cQuant = mk('Incapacidade de quantificar', '#8b5cf6', cats[1].id);
    const cPrioriza = mk('Priorização informal', '#22c55e', cats[2].id);
    const cJustif = mk('Dificuldade de justificar à liderança', '#0ea5e9', cats[2].id);

    function quote(snippet, codeIds) {
      const start = text.indexOf(snippet);
      if (start < 0) return;
      p.quotations.push({ id: U.uid('quo'), documentId: docId, start, end: start + snippet.length, text: snippet, codeIds, comment: '', createdAt: now });
    }
    quote('Tem parte que é muito boa, bem detalhada, e tem parte que está completamente desatualizada.', [cInconsist, cDesatual]);
    quote('a API mudou e ninguém atualizou o texto', [cDesatual]);
    quote('a gente só descobre pelo suporte', [cSuporte]);
    quote('Eu queria conseguir medir isso de forma mais visível, mas hoje não dá.', [cQuant]);
    quote('Hoje é quem grita mais alto, ou o que o cliente grande pediu.', [cPrioriza]);
    quote('eu não tenho como quantificar o impacto disso. Falta visibilidade.', [cQuant, cJustif]);

    p.relations.push({ id: U.uid('rel'), sourceId: cDesatual, targetId: cInconsist, type: 'é parte de' });
    p.relations.push({ id: U.uid('rel'), sourceId: cQuant, targetId: cJustif, type: 'é causa de' });
    p.relations.push({ id: U.uid('rel'), sourceId: cSuporte, targetId: cQuant, type: 'está associado a' });
    // relação entre categorias (codificação axial de alto nível)
    p.relations.push({ id: U.uid('rel'), sourceId: cats[1].id, targetId: cats[2].id, type: 'é causa de' });

    p.memos.push({
      id: U.uid('memo'), title: 'Primeiras impressões — Entrevista 01',
      body: 'O participante associa qualidade da documentação a um problema de visibilidade: sem métrica, a priorização vira "quem grita mais alto". Tema emergente: a falta de quantificação trava a justificativa para a liderança. Vale checar se aparece nas próximas entrevistas.',
      links: [{ type: 'code', id: cQuant }, { type: 'document', id: docId }],
      createdAt: now, updatedAt: now,
    });

    return p;
  }

  function exportProject(project) {
    const clone = JSON.parse(JSON.stringify(project));
    const safe = (project.name || 'projeto').replace(/[^\w\-]+/g, '_').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    U.downloadFile(`qualicode_${safe}_${stamp}.json`, JSON.stringify(clone, null, 2), 'application/json');
  }

  function validateProject(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Arquivo inválido.');
    if (!Array.isArray(obj.documents) || !Array.isArray(obj.codes)) throw new Error('Não parece um projeto QualiCode.');
    // normaliza campos faltantes
    obj.schema = obj.schema || 1;
    obj.id = obj.id || U.uid('proj');
    obj.name = obj.name || 'Projeto importado';
    obj.createdAt = obj.createdAt || U.nowISO();
    obj.updatedAt = U.nowISO();
    ['documents', 'categories', 'codes', 'quotations', 'relations', 'memos'].forEach(k => { obj[k] = obj[k] || []; });
    obj.graph = obj.graph || { positions: {}, relationTypes: RELATION_TYPES.slice() };
    obj.graph.positions = obj.graph.positions || {};
    obj.graph.relationTypes = obj.graph.relationTypes || RELATION_TYPES.slice();

    // migração schema 1 → 2: relations passam de sourceCodeId/targetCodeId para sourceId/targetId
    obj.relations = obj.relations.map(r => {
      if (r && r.sourceCodeId && !r.sourceId) {
        return { id: r.id || U.uid('rel'), sourceId: r.sourceCodeId, targetId: r.targetCodeId, type: r.type };
      }
      return r;
    }).filter(r => r && r.sourceId && r.targetId && r.type);

    // normaliza hierarquia de categorias: pai inexistente vira raiz; profundidade >2 achata; ciclo quebra
    const catById = {};
    obj.categories.forEach(c => { c.parentId = c.parentId || null; catById[c.id] = c; });
    obj.categories.forEach(c => { if (c.parentId && !catById[c.parentId]) c.parentId = null; });
    obj.categories.forEach(c => {
      if (!c.parentId) return;
      let p = catById[c.parentId];
      const seen = new Set([c.id]);
      while (p && p.parentId && !seen.has(p.id)) { seen.add(p.id); p = catById[p.parentId]; }
      if (!p || seen.has(p.id)) c.parentId = null;      // ciclo ou cadeia quebrada
      else if (p.id !== c.parentId) c.parentId = p.id;  // achata: pendura na raiz da cadeia
    });
    obj.schema = 2;
    return obj;
  }

  // Livro de códigos: cada código com categoria, definição (comentário), frequência e exemplos
  function exportCodebook(project, fmt) {
    fmt = fmt || 'md';
    const quotesOf = (codeId) => (project.quotations || []).filter(q => (q.codeIds || []).includes(codeId));
    const docName = (id) => { const d = (project.documents || []).find(x => x.id === id); return d ? d.name : id; };
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = (project.name || 'projeto').replace(/[^\w\-]+/g, '_').toLowerCase();

    // ordena raiz → subcategorias; subcategoria aparece como "Pai > Filha"
    const allCats = project.categories || [];
    const groups = [];
    allCats.filter(c => !c.parentId).forEach(root => {
      groups.push({ cat: root, label: root.name, codes: (project.codes || []).filter(c => c.categoryId === root.id) });
      allCats.filter(c => c.parentId === root.id).forEach(sub => {
        groups.push({ cat: sub, label: root.name + ' > ' + sub.name, codes: (project.codes || []).filter(c => c.categoryId === sub.id) });
      });
    });
    const orphan = (project.codes || []).filter(c => !c.categoryId);
    if (orphan.length) groups.push({ cat: { name: 'Sem categoria', deductive: false }, label: 'Sem categoria', codes: orphan });

    if (fmt === 'csv') {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const rows = [['categoria', 'codigo', 'definicao', 'frequencia', 'exemplo_1', 'documento_1', 'exemplo_2', 'documento_2']];
      groups.forEach(g => g.codes.forEach(c => {
        const qs = quotesOf(c.id);
        rows.push([g.label, c.name, c.comment || '', qs.length,
          qs[0] ? qs[0].text : '', qs[0] ? docName(qs[0].documentId) : '',
          qs[1] ? qs[1].text : '', qs[1] ? docName(qs[1].documentId) : '']);
      }));
      U.downloadFile(`codebook_${safe}_${stamp}.csv`, '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n'), 'text/csv');
    } else {
      const nCodes = (project.codes || []).length;
      let md = `# Livro de Códigos — ${project.name}\n\n_${nCodes} códigos · ${(project.categories || []).length} categorias · gerado em ${stamp}_\n\n`;
      groups.forEach(g => {
        if (!g.codes.length) return;
        md += `## ${g.label}${g.cat.deductive ? ' _(dedutiva)_' : ''}\n\n`;
        g.codes.forEach(c => {
          const qs = quotesOf(c.id);
          md += `### ${c.name} — ${qs.length} ${qs.length === 1 ? 'ocorrência' : 'ocorrências'}\n\n`;
          md += `**Definição:** ${c.comment ? c.comment : '—'}\n\n`;
          if (qs.length) {
            md += `**Exemplos:**\n\n`;
            qs.slice(0, 2).forEach(q => { md += `> "${q.text.replace(/\n/g, ' ')}" — *${docName(q.documentId)}*\n\n`; });
          }
        });
      });
      U.downloadFile(`codebook_${safe}_${stamp}.md`, md, 'text/markdown');
    }
  }

  QC.seed = {
    RELATION_TYPES,
    emptyProject,
    newProjectWithDeductive,
    exampleProject,
    exportProject,
    exportCodebook,
    validateProject,
  };
})(window.QC = window.QC || {});
