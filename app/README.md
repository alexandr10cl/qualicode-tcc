# QualiCode — mini Atlas.ti local

Ferramenta de **codificação aberta e axial** para análise qualitativa, inspirada no Atlas.ti.
Roda **100% no navegador**: sem backend, sem servidor, sem instalação. Os dados ficam só na sua máquina.

## Como rodar

**Opção A — duplo clique:** abra `index.html` no navegador.

**Opção B (recomendada) — servir localmente:** dá persistência mais robusta (IndexedDB).
No VS Code, use a extensão *Live Server* (botão "Go Live"), ou pelo terminal, dentro de `codingmaster/app/`:

```
python -m http.server 8000
```

e acesse `http://localhost:8000`.

> Por que servir? Em `file://` alguns navegadores limitam o IndexedDB. Servindo em `localhost`, o autosave fica garantido. De qualquer forma, **o backup real é o export `.json`** (veja abaixo).

## Funcionalidades

| Tela | O que faz |
|------|-----------|
| **Codificação** | Importa `.txt`, seleciona trechos no texto e cria/aplica códigos (codificação aberta). Destaques coloridos, sobreposição de códigos, comentários por trecho. |
| **Codebook** | Agrupa códigos em categorias e **subcategorias** (2 níveis) arrastando (codificação axial). Categorias dedutivas (das SQs), recolorir, mesclar e excluir códigos, co-ocorrência por código. |
| **Livro** | O codebook completo em **modo leitura** (nada editável): categoria/subcategoria, nome, ocorrências, definição e **todos os trechos** de cada código, com documento de origem. Sumário clicável, filtro e export .md/.csv. |
| **Rede** | Grafo de relações nomeadas entre códigos **e categorias** (*é causa de*, *é parte de*…). Nós de categoria com vínculos de pertencimento; ocultar códigos agrega as relações deles entre as categorias. Layout automático **"Agrupar por categorias"** (códigos empilhados sob a categoria) ou círculo; ajustar à tela; arrastar nós, zoom, criar/excluir relações, exportar `.svg`. |
| **Recuperação** | Filtra trechos por código/categoria (E/OU), documento e busca textual. Exporta **CSV** e **Markdown** — a tabela de evidências do TCC. |
| **Memos** | Notas analíticas (Grounded Theory) com vínculo a códigos, trechos e documentos. |
| **Painel** | Frequências por código, donut por categoria e matriz de co-ocorrência. |

## Dados e backup

- O projeto inteiro é **um objeto JSON**. O autosave grava em **IndexedDB** (ou **localStorage** como reserva).
- **Exporte o `.json` com frequência** (ícone ⬇ na barra lateral ou no Painel). Esse arquivo:
  - é seu **backup**;
  - pode ser **versionado no git**;
  - **Importar** restaura tudo (em qualquer navegador/máquina).
- Limpar os dados do navegador apaga os projetos do IndexedDB — por isso o `.json` é a fonte de verdade.

## Arquitetura (para quem for mexer)

Vanilla JS, sem build, sem dependências. Scripts clássicos sob o namespace global `QC`.

```
index.html            # shell + ordem de carregamento
css/styles.css        # tokens do design (Stitch) -> CSS puro
js/util.js            # helpers (DOM, offsets, datas, cores, download)
js/icons.js           # ícones SVG (Lucide-like)
js/db.js              # persistência: IndexedDB + fallback localStorage
js/store.js           # estado do projeto + mutações + autosave + seletores
js/seed.js            # projeto novo / exemplo / import-export
js/components.js      # UI: modal, toast, menu, color picker, chips
js/screens/*.js       # uma tela por arquivo
js/app.js             # controlador: nav rail, navegação, sessão
```

### Modelo de dados

```js
Project {
  schema, // 2 (schema 1 é migrado automaticamente ao abrir/importar)
  id, name, createdAt, updatedAt,
  documents:  [{ id, name, text, importedAt }],
  categories: [{ id, name, parentId, color, deductive }], // parentId → subcategoria (máx. 2 níveis)
  codes:      [{ id, name, color, categoryId, comment, createdAt }],
  quotations: [{ id, documentId, start, end, text, codeIds:[], comment, createdAt }], // start/end = offset de caractere
  relations:  [{ id, sourceId, targetId, type }], // cada ponta pode ser código OU categoria
  memos:      [{ id, title, body, links:[{type,id}], createdAt, updatedAt }],
  graph:      { positions: { [codeId|catId]: {x,y} }, relationTypes: [] }
}
```

O vínculo código↔trecho é o array `codeIds` da quotation. Co-ocorrência é **calculada** (códigos que dividem o mesmo trecho), não armazenada.
