/* db.js — persistência local: IndexedDB com fallback para localStorage.
   Guarda projetos inteiros (1 objeto JSON por projeto). */
(function (QC) {
  const DB_NAME = 'qualicode';
  const STORE = 'projects';
  const LS_PREFIX = 'qc_project_';
  const LS_INDEX = 'qc_index';

  let _db = null;
  let _mode = 'unknown'; // 'idb' | 'ls'

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('sem indexedDB'));
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('falha ao abrir indexedDB'));
      req.onblocked = () => reject(new Error('indexedDB bloqueado'));
    });
  }

  function idbTx(mode) {
    return _db.transaction(STORE, mode).objectStore(STORE);
  }
  function reqToPromise(req) {
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  }

  // ---- localStorage fallback ----
  function lsIndex() {
    try { return JSON.parse(localStorage.getItem(LS_INDEX) || '[]'); } catch (e) { return []; }
  }
  function lsSetIndex(ids) { localStorage.setItem(LS_INDEX, JSON.stringify(ids)); }

  const DB = QC.db = {
    mode() { return _mode; },

    async init() {
      try {
        _db = await openIDB();
        _mode = 'idb';
      } catch (e) {
        console.warn('[QualiCode] IndexedDB indisponível, usando localStorage:', e && e.message);
        _mode = 'ls';
      }
      return _mode;
    },

    async listProjects() {
      let projects = [];
      if (_mode === 'idb') {
        projects = await reqToPromise(idbTx('readonly').getAll()) || [];
      } else {
        projects = lsIndex().map(id => {
          try { return JSON.parse(localStorage.getItem(LS_PREFIX + id)); } catch (e) { return null; }
        }).filter(Boolean);
      }
      // metadados + contagens, ordenado por updatedAt desc
      return projects.map(p => ({
        id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt,
        counts: {
          documents: (p.documents || []).length,
          codes: (p.codes || []).length,
          quotations: (p.quotations || []).length,
        }
      })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },

    async loadProject(id) {
      if (_mode === 'idb') return (await reqToPromise(idbTx('readonly').get(id))) || null;
      try { return JSON.parse(localStorage.getItem(LS_PREFIX + id)); } catch (e) { return null; }
    },

    async saveProject(project) {
      if (_mode === 'idb') {
        await reqToPromise(idbTx('readwrite').put(project));
      } else {
        localStorage.setItem(LS_PREFIX + project.id, JSON.stringify(project));
        const idx = lsIndex();
        if (!idx.includes(project.id)) { idx.push(project.id); lsSetIndex(idx); }
      }
      return true;
    },

    async deleteProject(id) {
      if (_mode === 'idb') {
        await reqToPromise(idbTx('readwrite').delete(id));
      } else {
        localStorage.removeItem(LS_PREFIX + id);
        lsSetIndex(lsIndex().filter(x => x !== id));
      }
      return true;
    },
  };
})(window.QC = window.QC || {});
