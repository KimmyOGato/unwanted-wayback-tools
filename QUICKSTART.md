# Wayback Media Saver - Quick Start Guide

## 📋 Pré-requisitos

- **Node.js 16+**: Baixe de https://nodejs.org/
  - Recomendado: LTS (Long Term Support)
  - Windows: Download do instalador `.msi`

## 🚀 Começar em 3 passos

### 1. Executar setup
```powershell
cd 'C:\Users\atama\Documents\Unwanted Tools\app-wayback'
.\setup.ps1
```

Se receber erro de permissão, execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup.ps1
```

### 2. Iniciar em modo desenvolvimento
```powershell
npm run electron-dev
```

Vai abrir:
- Janela Electron da aplicação
- DevTools automático para debugging
- Vite com hot-reload (salve e veja mudanças em tempo real)

### 3. Usar a aplicação
1. Cole um link do Wayback Machine
2. Escolha o tipo de conteúdo
3. Clique em "Buscar"
4. Selecione itens e clique "Baixar selecionados"

## 📦 Build para Produção

```powershell
npm run electron-build
```

Isto cria:
- `dist/` com arquivos otimizados
- Empacota tudo em um único executável

Para rodar depois:
```powershell
npm start
```

## 🎨 Estrutura de Arquivos

```
app-wayback/
├── src/                      # React components
│   ├── App.jsx              # Lógica principal + downloads paralelos
│   ├── components/          # Componentes reutilizáveis
│   │   ├── SearchForm.jsx   # Busca + filtros
│   │   ├── ResultsGrid.jsx  # Grid de resultados
│   │   ├── ResultCard.jsx   # Card com preview
│   │   └── DownloadStatus.jsx # Status de downloads
│   ├── locales.js           # pt-BR e en-US
│   ├── App.css              # Estilos principais
│   └── index.css            # Variáveis de cores
├── electron/                 # Processo principal do Electron
│   ├── main.js              # Lógica backend (CDX, downloads)
│   └── preload.js           # Bridge seguro para APIs
├── index.html               # Template HTML (usado por Vite)
├── vite.config.js           # Config bundler
├── package.json             # Dependências
├── README.md                # Documentação completa
└── setup.ps1                # Script automático
```

## 🔧 Desenvolvimento

### Hot-reload (Vite)
Quando você salva um arquivo `.jsx` ou `.css`, a página recarrega automaticamente em dev.

### Debug
O DevTools fica aberto por padrão em dev para inspecionar React components, network, console, etc.

### Adicionar novo idioma
1. Edite `src/locales.js`
2. Adicione novo objeto ao `locales`
3. Adicione `<option>` ao seletor de idioma em `App.jsx`

## 🐛 Troubleshooting

| Problema | Solução |
|----------|---------|
| `npm: not recognized` | Instale Node.js de nodejs.org |
| Port 5173 já está em uso | `netstat -ano \| findstr :5173` para ver qual processo, depois encerre |
| Electron não abre | Verifique se Vite está rodando em outro terminal |
| Caracteres acentuados não aparecem | Salve arquivos em UTF-8 (padrão do VS Code) |

## 📚 API Wayback Machine (CDX)

A aplicação consulta `https://web.archive.org/cdx/` para:
- Listar todas as versões arquivadas de uma URL
- Filtrar por tipo de arquivo (MIME type)
- Filtrar por período de datas

Documentação oficial: https://github.com/internetarchive/wayback/tree/master/cdx_api

## 💡 Exemplos de Uso

### Buscar todas as imagens de um site
```
URL original: http://example.com
Tipo: Imagens
Clique: Buscar
```

### Buscar arquivos de um período específico
```
URL original: http://example.com/assets/
De: 2020-01-01
Até: 2020-12-31
Tipo: Todos
Clique: Buscar
```

### Baixar múltiplos arquivos em paralelo
- Selecione os itens desejados (checkbox)
- Clique "Baixar selecionados"
- Escolha a pasta
- Acompanhe o progresso na barra inferior

## ⚙️ Próximas Melhorias

- [ ] Histórico de buscas
- [ ] Extensões de arquivo específicas (`.jpg`, `.mp3`, etc.)
- [ ] Limite de tamanho configurável
- [ ] Cancelamento de downloads
- [ ] Suporte a proxies

---

**Versão**: 0.2.0  
**Última atualização**: Nov 13, 2025