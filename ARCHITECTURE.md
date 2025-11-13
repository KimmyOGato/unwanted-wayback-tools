# Arquitetura da Aplicação - Wayback Media Saver

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                     │
│  (Node.js - Acesso ao sistema de arquivos)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  IPC Handlers:                                       │  │
│  │  - fetch-resources (CDX API)                         │  │
│  │  - download-resource (Salvar arquivo)                │  │
│  │  - select-folder (Diálogo de pasta)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↕                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  APIs Externas:                                      │  │
│  │  - CDX: https://web.archive.org/cdx/search/cdx       │  │
│  │  - Wayback: https://web.archive.org/web/TIMESTAMP/  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            ↕ Context Isolation (seguro)
            ↕ (via preload.js)
┌─────────────────────────────────────────────────────────────┐
│              ELECTRON RENDERER (React)                       │
│            (Chromium - Interface do usuário)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              App.jsx (Root Component)              │    │
│  │  Estado:                                           │    │
│  │  - items (resultados da CDX)                       │    │
│  │  - selectedIndices (checkboxes selecionados)       │    │
│  │  - downloadQueue (fila de downloads)               │    │
│  │  - downloadStatus (progresso de cada download)     │    │
│  │  - currentPage, totalPages (paginação)             │    │
│  │  - lang (idioma pt-BR ou en-US)                    │    │
│  └────────────────────────────────────────────────────┘    │
│                    ↕                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Sub-componentes:                    │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │ SearchForm   │  │ ResultsGrid  │                 │   │
│  │  │              │  │              │                 │   │
│  │  │ - URL input  │  │ - ResultCard │ (x20 por página)│   │
│  │  │ - Type/Lang  │  │   - Thumbnail│                 │   │
│  │  │ - Filters    │  │   - Checkbox │                 │   │
│  │  │ - Search btn │  │   - Preview  │                 │   │
│  │  └──────────────┘  └──────────────┘                 │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  DownloadStatus (Fila de Downloads)          │  │   │
│  │  │                                              │  │   │
│  │  │  [Fila]   arquivo1.jpg  ████████░░░ 80%     │  │   │
│  │  │  [Baixando] arquivo2.mp4 ██████░░░░░ 50%     │  │   │
│  │  │  [Concluído] arquivo3.png                    │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Fluxo de Busca

```
Usuário cola URL e clica "Buscar"
            ↓
App.jsx recebe (link, type, filters)
            ↓
window.api.fetchResources(link, filters)
            ↓ [IPC Message]
            ↓
electron/main.js: ipcMain.handle('fetch-resources')
            ↓
Parsing de URL (extrai original URL se for Wayback)
            ↓
Fetch para CDX API com filtros
            ↓
Mapear resposta JSON → {timestamp, original, mimetype, archived}
            ↓
            ↓ [IPC Response]
            ↓
App.jsx recebe items
            ↓
Filtrar por type (images, media, documents, all)
            ↓
Paginar (20 por página)
            ↓
Renderizar ResultsGrid com ResultCard
            ↓
Usuário vê resultados com preview
```

## Fluxo de Download

```
Usuário seleciona items e clica "Baixar selecionados"
            ↓
App.jsx coleta selectedIndices
            ↓
Abre dialog de seleção de pasta
            ↓
App.jsx adiciona itens à downloadQueue
            ↓
useEffect detecta mudança em downloadQueue
            ↓
Inicia processQueue com MAX_CONCURRENT=3
            ↓
Para cada item na fila:
  ┌─────────────────────────────────────┐
  │ Se activeDownloads < 3:             │
  │   - Fetch arquivo do Wayback        │
  │   - Stream para disco (fs)          │
  │   - Emit download-progress event    │
  │   - Update downloadStatus state     │
  │                                     │
  │ Listener em ipcRenderer.on atualiza │
  │ barra de progresso em tempo real    │
  └─────────────────────────────────────┘
            ↓
Arquivo salvo com extensão preservada
            ↓
Status muda para 'completed'
            ↓
Próximo item na fila é processado
```

## Estrutura de Dados

### CDX Response
```json
{
  "items": [
    {
      "timestamp": "20021002215047",
      "original": "http://pulseultra.com:80/assets/gallery/01.jpg",
      "mimetype": "image/jpeg",
      "archived": "https://web.archive.org/web/20021002215047/http://pulseultra.com/assets/gallery/01.jpg",
      "length": 45678
    }
  ]
}
```

### App State
```javascript
{
  lang: 'pt-BR' | 'en-US',
  items: CDXItem[],
  selectedIndices: Set<number>,
  loading: boolean,
  currentPage: number,
  totalPages: number,
  downloadQueue: DownloadTask[],
  downloadStatus: {
    [id]: { status: 'queued'|'downloading'|'completed'|'error', received, total }
  }
}
```

### DownloadTask
```javascript
{
  id: '20021002215047_0',
  archived: 'https://web.archive.org/web/...',
  folder: 'C:\\Users\\...',
  filename: '20021002215047_01.jpg'
}
```

## Stack Técnico

### Frontend
- **React 18**: Componentes com hooks
- **Vite 5**: Bundler rápido com HMR
- **CSS3**: Grid, Flexbox, Variáveis, Gradientes

### Backend
- **Electron 26**: Framework desktop
- **Node.js APIs**: fs (filesystem), path (operações de caminho)
- **node-fetch 2**: HTTP client com stream

### Externos
- **Wayback CDX API**: JSON search interface
- **Wayback Machine**: Servidor de arquivos

## Componentes React

```
App.jsx
├── header (título, logo, seletor de idioma)
├── SearchForm
│   ├── input (URL)
│   ├── select (tipo)
│   ├── button (buscar)
│   └── Filters (datas)
├── Pagination
│   ├── button (anterior)
│   ├── span (página X de Y)
│   └── button (próxima)
├── ResultsGrid
│   └── ResultCard[] (map 20 por página)
│       ├── input[checkbox]
│       ├── img (lazy load)
│       ├── audio/video (player HTML5)
│       ├── div (MIME type)
│       └── div (timestamp)
├── Actions
│   └── button (Baixar selecionados)
└── DownloadStatus (position: fixed; bottom: 0)
    └── QueueItem[]
        ├── filename
        ├── status
        └── progress bar
```

## Segurança

```
┌──────────────────────────────────────────────┐
│ Sandbox Chromium (Renderer Process)          │
│ - Sem acesso a fs, path, process             │
│ - Sem require() nativo                       │
│ - Sem acesso ao sistema operacional          │
└──────────────────────────────────────────────┘
            ↕ Context Isolation + Preload
            (mensagens seguras via IPC)
┌──────────────────────────────────────────────┐
│ Node.js Process (Main)                       │
│ - Acesso completo ao sistema                 │
│ - Processa IPC handlers                      │
│ - Valida entrada do renderer                 │
└──────────────────────────────────────────────┘
```

## Performance

| Métrica | Valor |
|---------|-------|
| Bundle size (prod) | ~500KB (Electron + React) |
| Time to interactive | ~2s (dev) |
| Hot reload | <100ms (Vite) |
| Max CDX records | 10.000 (paginável) |
| Max concurrent downloads | 3 |
| Timeout CDX | 30s |
| Timeout download | Streaming (sem timeout) |

## Fluxo de Compilação

### Development
```
npm run electron-dev
    ↓
Concurrently:
  1. Vite server (port 5173, HMR enabled)
  2. Electron (carrega http://localhost:5173)
    ↓
Salvar arquivo .jsx/.css → Vite recarrega → Electron atualiza
```

### Production
```
npm run electron-build
    ↓
npm run build (Vite)
    ↓
dist/index.html + dist/js/* + dist/css/*
    ↓
electron . (carrega dist/index.html local)
    ↓
Aplicação otimizada, sem dependência de servidor
```

---

**Versão**: 0.2.0  
**Data**: Nov 13, 2025