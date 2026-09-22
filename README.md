# 💧 Monitoramento da Água — pH e Energia

Sistema web de monitoramento e **dashboard** para acompanhar o pH da água e o
fornecimento de energia, com alertas automáticos e histórico. Feito para a
disciplina de **Arquitetura de Computadores** (projeto PEI1).

Arquitetura (conforme os slides):

```
SENSOR DE pH → ESP32 → (Wi-Fi) → FIREBASE REALTIME DATABASE → JAVASCRIPT → INTERFACE WEB → USUÁRIO
```

## O que o sistema faz

- 📊 Mostra o **pH atual**, com faixa aceitável **6.5 – 8.5**.
- ⚡ Mostra o estado da **energia elétrica** (OK / falta).
- 🫧 Aciona a **oxigenação de emergência** automaticamente quando falta energia.
- ⚠️ Gera **alertas** quando o pH sai da faixa ou quando falta energia.
- 📈 **Gráfico** do histórico de pH ao longo do tempo (faixa aceitável destacada).
- 🧾 **Tabela** com as últimas leituras.
- 🟢 Indicador de **conexão** com o Firebase e horário da última atualização.
- 🧪 **Simulador** embutido para testar sem hardware (grava no Firebase igual ao ESP32).
- 📱 **Instalável (PWA)** na tela de início e **notificações** de alerta no iPhone/Android.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura da página (dashboard, alertas, gráfico, tabela, simulador). |
| `style.css` | Visual do sistema (responsivo). |
| `app.js` | Lógica: lê o Firebase em tempo real, atualiza a tela, gráfico e histórico. |
| `firebase-config.js` | Configuração do Firebase e constantes (faixa de pH, caminhos). |
| `esp32_monitoramento.ino` | Exemplo de código do ESP32 para enviar as leituras ao Firebase. |
| `manifest.json` | Configuração do app (PWA) para instalar na tela de início. |
| `sw.js` | Service Worker — necessário para as notificações no iPhone/Android. |
| `icon-192.png` / `icon-512.png` / `icon-180.png` | Ícones do app. |

## Como rodar (localmente)

Basta **dar dois cliques no `index.html`** — ele abre no navegador e já conecta
no Firebase. (O Firebase é carregado por `<script>` comum, então não precisa de
servidor nem instalar nada.)

## 🚀 Deploy no Vercel

O site é 100% estático (só HTML/CSS/JS), então o Vercel hospeda sem nenhuma
configuração. Como não há build, a forma mais simples é pelo GitHub:

**1) Colocar o código no GitHub (pelo navegador, sem instalar nada)**
1. Crie uma conta em <https://github.com> (se ainda não tiver).
2. Clique em **New repository**, dê um nome (ex.: `monitoramento-agua`) e crie.
3. Na página do repositório, clique em **uploading an existing file** e
   **arraste todos os arquivos** desta pasta (index.html, style.css, app.js,
   firebase-config.js, esp32_monitoramento.ino, README.md).
4. Clique em **Commit changes**.

**2) Importar no Vercel**
1. Acesse <https://vercel.com> e faça login **com o GitHub** ("Continue with GitHub").
2. Clique em **Add New… → Project**.
3. Escolha o repositório `monitoramento-agua` e clique em **Import**.
4. Em *Framework Preset*, deixe **Other**. Não precisa mexer em mais nada.
5. Clique em **Deploy** e aguarde. Ele vai gerar um link tipo
   `https://monitoramento-agua.vercel.app`.

> Sempre que você atualizar os arquivos no GitHub, o Vercel publica de novo sozinho.

**Alternativa (Vercel CLI):** se instalar o Node.js, dá pra publicar por linha de
comando dentro da pasta: `npm i -g vercel` e depois `vercel`.

## 🔔 Notificações no iPhone (sem app na loja)

O site é um **PWA**: dá pra adicioná-lo à Tela de Início e receber notificações
como se fosse um aplicativo. **Requisitos:** iPhone com **iOS 16.4 ou mais novo**
e o site publicado em **https** (o Vercel já dá isso).

**Passo a passo no iPhone:**
1. Abra o link do Vercel no **Safari**.
2. Toque em **Compartilhar** (o quadradinho com a seta) → **Adicionar à Tela de Início**.
3. Abra o app pelo **ícone** que apareceu na tela de início (não pelo Safari).
4. Toque no botão **🔔 Ativar notificações** e escolha **Permitir**.
5. Pronto. Quando o pH sair da faixa (6.5–8.5) ou faltar energia, chega uma notificação.

> No Android/Chrome é parecido: menu ⋮ → *Instalar app* / *Adicionar à tela inicial*
> → abrir pelo ícone → **Ativar notificações**.

**Como funciona / limitação importante:**
- As notificações são disparadas **enquanto o app está aberto ou rodando** em
  segundo plano recente. Elas avisam nas **mudanças** de estado (ex.: entrou em
  alerta, ou normalizou) — não ficam repetindo.
- Para receber notificação com o app **totalmente fechado**, é preciso um
  **servidor enviando o push** (Firebase Cloud Messaging + uma Cloud Function que
  dispara quando o dado muda no banco). Isso exige o plano **Blaze** do Firebase e
  já foi deixado preparado no `sw.js` (evento `push`). É o próximo passo, se quiser.

## Correções feitas no código original

1. **Botões do simulador não funcionavam.** No código original o `script.js` era
   um *ES module*; as funções `simularPhBaixo()` etc. ficavam no escopo do módulo
   e o `onclick="..."` do HTML não as enxergava (`ReferenceError`). Agora os
   eventos são registrados com `addEventListener` no `app.js`.
2. **Leitura de energia errada.** `Boolean(dados.energia)` transformava a string
   `"false"` em `true` (string não vazia é sempre `true`). Agora há uma função
   `paraBooleano()` que interpreta `true/false`, `1/0`, `"on"/"off"` etc.
3. **pH inválido quebrava a tela.** `Number(dados.ph)` podia virar `NaN` e
   `ph.toFixed(1)` quebrava. Agora há validação (`phValido`) e estados de
   "Aguardando leitura".
4. **Simulador não conversava com o banco.** Antes ele só mudava a variável local
   e o Firebase sobrescrevia. Agora o simulador **grava** no Firebase
   (`set` + `push`), fechando o ciclo ESP32 → banco → tela.

## Melhorias adicionadas

- Gráfico de pH (Chart.js) com faixa aceitável destacada.
- Histórico persistente no Firebase (nó `historico`) + tabela na tela.
- Indicador de conexão (`.info/connected`) e horário da última leitura.
- Oxigenação pode vir do próprio banco (`oxigenacao`) ou é derivada da energia.
- Design responsivo e estados de cor (verde/âmbar/vermelho).
- Abre com dois cliques (Firebase "compat") — não precisa mais de servidor local.

## Firebase — estrutura de dados

O ESP32 deve escrever o **estado atual** em `monitoramento` e (opcionalmente)
empilhar leituras em `historico`:

```json
{
  "monitoramento": {
    "ph": 7.2,
    "energia": true,
    "oxigenacao": false,
    "timestamp": 1690000000000
  },
  "historico": {
    "-Nxyz...": { "ph": 7.2, "energia": true, "oxigenacao": false, "timestamp": 1690000000000 }
  }
}
```

## Firebase — regras do Realtime Database

Para **testes/apresentação** (leitura e escrita liberadas):

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> ⚠️ Isso deixa o banco público. Bom para a demonstração em sala, mas **não**
> deixe assim em produção. Para algo mais seguro, exija autenticação:

```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null"
  }
}
```

## Usar o SEU próprio Firebase

1. Crie um projeto em <https://console.firebase.google.com>.
2. Ative o **Realtime Database** (modo de teste, para começar).
3. Registre um app **Web** e copie o objeto `firebaseConfig`.
4. Cole os valores em `firebase-config.js`.
5. Aponte o ESP32 (`esp32_monitoramento.ino`) para a mesma `databaseURL`.
