# 🚀 WAYBACK MEDIA SAVER - GUIA DE INSTALAÇÃO (PT-BR)

## 📋 Pré-requisitos

Você precisará de:
- **Windows 10+**
- **Node.js 16+** (baixe em https://nodejs.org/)
- **Conexão com internet**

## ⚡ Instalação Rápida (3 Passos)

### Passo 1: Instalar Node.js

1. Acesse https://nodejs.org/
2. Clique no botão **"LTS"** (versão recomendada)
3. Abra o arquivo `.msi` e siga o instalador
4. Reinicie seu computador (ou terminal PowerShell)

**Verificar se funcionou:**
```powershell
node -v
npm -v
```

### Passo 2: Abrir Terminal na Pasta do Projeto

```powershell
cd 'C:\Users\atama\Documents\Unwanted Tools\app-wayback'
```

### Passo 3: Executar o Setup Automático

```powershell
.\setup.ps1
```

Se receber erro de permissão:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup.ps1
```

## 🎮 Usar a Aplicação

### Primeira Vez (Com Hot-Reload para Desenvolvimento)

```powershell
npm run electron-dev
```

Isso vai:
1. Iniciar servidor Vite em http://localhost:5173
2. Abrir a janela do Wayback Media Saver
3. Ativar DevTools (F12 para debugging)
4. Recarregar automaticamente quando você editar código

### Versão Pronta para Usar (Build de Produção)

```powershell
npm run electron-build
npm start
```

## 💡 Como Usar o Aplicativo

### Passo a Passo:

1. **Cole um link do Wayback Machine**
   - Exemplo: `https://web.archive.org/web/*/http://example.com`
   - Ou: `https://web.archive.org/web/20021002215047/http://pulseultra.com/assets/gallery/01.jpg`

2. **Escolha o tipo de conteúdo**
   - Imagens (JPEG, PNG, GIF, WebP, etc.)
   - Áudio & Vídeo (MP3, MP4, OGG, etc.)
   - Documentos (PDF, TXT, etc.)
   - Todos (sem filtro)

3. **Adicione filtros (opcional)**
   - Clique no botão "Filtros"
   - Selecione data inicial e final
   - Clique "Aplicar filtros"

4. **Clique em "Buscar"**
   - Aguarde a aplicação consultar o Wayback Machine
   - Você verá "X itens encontrados"

5. **Selecione os arquivos**
   - Marque o checkbox de cada arquivo desejado
   - Você pode visualizar imagens (clique na miniatura)
   - Você pode ouvir áudio/vídeo (player embutido)

6. **Clique "Baixar selecionados"**
   - Uma janela abrirá pedindo a pasta de destino
   - Escolha onde salvar os arquivos
   - Clique "Selecionar Pasta"

7. **Acompanhe o progresso**
   - Uma barra aparecerá no fundo mostrando:
     - Nome do arquivo
     - Status (Fila, Baixando, Concluído, Erro)
     - Barra de progresso com percentual

## 🌐 Trocar Idioma

No topo direito da janela, há um dropdown com as opções:
- **Português (BR)** 🇧🇷
- **English (US)** 🇺🇸

Clique para trocar o idioma instantaneamente.

## 🎨 Personalizações (Opcional)

### Mudar cores

Edite `src/App.css` e procure por `:root`:

```css
:root {
  --bg: #0f1724;           /* Cor de fundo */
  --card: #0b1220;         /* Cor dos cards */
  --accent: #60a5fa;       /* Cor de destaque (azul) */
  --muted: #9ca3af;        /* Cor de texto secundário */
  --text: #e6eef8;         /* Cor de texto principal */
}
```

Salve e o Vite recarregará automaticamente (se em modo dev).

### Adicionar novo idioma

1. Abra `src/locales.js`
2. No objeto `locales`, adicione um novo idioma (ex: `'es-ES'`):

```javascript
'es-ES': {
  title: 'Guardador de Medios de Wayback',
  // ... mais textos em espanhol
}
```

3. No arquivo `src/App.jsx`, procure pelo `<select id="langSelect">`
4. Adicione uma nova opção:

```jsx
<option value="es-ES">Español (ES)</option>
```

5. Salve e veja aparecer no dropdown!

## 🔧 Troubleshooting

### ❌ "npm: The term 'npm' is not recognized"

**Solução:**
1. Instale Node.js de nodejs.org
2. Reinicie PowerShell/VS Code
3. Tente novamente

### ❌ "Port 5173 already in use"

**Solução:**
```powershell
# Encontre qual processo está usando a porta
netstat -ano | findstr :5173

# Encerre o Electron anterior
# Ou mude a porta em vite.config.js
```

### ❌ "Electron não abre"

**Solução:**
1. Certifique-se que Vite está rodando
2. Você deve ver "VITE v5.0.0 ready in XX ms"
3. Se não, tente: `npm run dev` em outro terminal
4. Volte para npm run electron-dev

### ❌ "Caracteres acentuados não aparecem"

**Solução:**
- Certifique-se de salvar os arquivos em UTF-8
- VS Code faz isso por padrão (veja "UTF-8" no canto inferior)

### ❌ "Os downloads são muito lentos"

**Solução:**
- Isso é normal! O Wayback Machine pode ser lento
- Tente novamente mais tarde
- Verifique sua conexão com internet

## 📂 Estrutura de Pastas (Referência)

```
app-wayback/
├── src/                      ← Código React (edite aqui)
│   ├── App.jsx              ← Arquivo principal
│   ├── App.css              ← Estilos (customizar cores aqui)
│   ├── locales.js           ← Traduções (adicione idiomas aqui)
│   └── components/          ← Componentes menores
├── electron/                ← Código Electron (backend)
├── index.html               ← Template HTML
├── package.json             ← Dependências
├── vite.config.js           ← Configuração Vite
├── README.md                ← Documentação técnica
├── QUICKSTART.md            ← Outro guia
└── setup.ps1                ← Script de instalação
```

## 💾 Como Salvar Personalizações

Depois de editar qualquer arquivo:
1. Salve o arquivo (Ctrl+S)
2. Vite recarregará a aplicação automaticamente
3. Veja as mudanças na janela do Electron

## 📈 Próximas Features Possíveis

Você pode adicionar:
- ✨ Histórico de buscas
- ✨ Extensões de arquivo específicas
- ✨ Limite de tamanho configurável
- ✨ Cancelamento de downloads
- ✨ Suporte a proxies

## 🆘 Precisa de Ajuda?

Consulte os arquivos:
- **START.txt** — Início rápido
- **README.md** — Documentação completa
- **TECHNICAL.md** — Detalhes técnicos
- **ARCHITECTURE.md** — Como funciona

## ✅ Você Está Pronto!

Agora você tem tudo para:
- ✓ Usar a aplicação
- ✓ Personalizar cores e idiomas
- ✓ Estender com novas features
- ✓ Fazer build para produção

Aproveite! 🎉

---

**Wayback Media Saver v0.2.0**
Nov 13, 2025

Para começar: `.\setup.ps1` → `npm run electron-dev`