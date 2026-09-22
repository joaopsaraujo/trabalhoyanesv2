// ============================================================
//  Monitoramento da Água — pH e Energia
//  Lê o Firebase Realtime Database em tempo real e atualiza o
//  painel, o gráfico e a tabela. O simulador grava no banco.
//
//  Usa o Firebase "compat" (carregado por <script> no HTML), então
//  funciona tanto no servidor (Vercel) quanto abrindo o arquivo
//  direto no navegador (dois cliques).
// ============================================================

(function () {
  "use strict";

  // Constantes vindas de firebase-config.js
  const firebaseConfig = window.firebaseConfig;
  const PATHS = window.PATHS;
  const PH_MIN = window.PH_MIN;
  const PH_MAX = window.PH_MAX;
  const MAX_PONTOS = window.MAX_PONTOS;

  // ---------- Configurações de notificação (salvas neste aparelho, sem login) ----------
  const CONFIG_PADRAO = {
    phBaixoAtivo: true, phBaixo: 6.5,
    phAltoAtivo: true,  phAlto: 8.5,
    energiaAtivo: true,
    normalizadoAtivo: false
  };
  let config = carregarConfig();

  function carregarConfig() {
    try {
      const salvo = JSON.parse(localStorage.getItem("configNotif"));
      if (salvo && typeof salvo === "object") return Object.assign({}, CONFIG_PADRAO, salvo);
    } catch (e) { /* localStorage indisponível — usa o padrão */ }
    return Object.assign({}, CONFIG_PADRAO);
  }

  function salvarConfig() {
    try { localStorage.setItem("configNotif", JSON.stringify(config)); } catch (e) { /* ignora */ }
  }

  // ---------- Inicialização do Firebase ----------
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  const atualRef = db.ref(PATHS.atual);
  const historicoRef = db.ref(PATHS.historico);

  // ---------- Estado da aplicação ----------
  const estado = { ph: null, energia: true, oxigenacao: false, timestamp: null };
  const historico = []; // { ph, energia, oxigenacao, timestamp }

  // ---------- Atalhos de DOM ----------
  const $ = (id) => document.getElementById(id);

  // ============================================================
  //  Utilidades
  // ============================================================

  // Converte qualquer coisa vinda do banco para booleano de verdade.
  // Corrige o bug de Boolean("false") === true.
  function paraBooleano(v, padrao = false) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["true", "1", "on", "ok", "sim"].includes(s)) return true;
      if (["false", "0", "off", "nao", "não"].includes(s)) return false;
    }
    return padrao;
  }

  function phValido(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function horaCurta(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  // ============================================================
  //  Conexão com o Firebase (.info/connected)
  // ============================================================
  db.ref(".info/connected").on("value", (snap) => {
    const online = snap.val() === true;
    const badge = $("conexaoBadge");
    badge.classList.toggle("badge-on", online);
    badge.classList.toggle("badge-off", !online);
    $("conexaoTexto").textContent = online ? "Conectado ao Firebase" : "Sem conexão";
  });

  // ============================================================
  //  Leitura do estado atual em tempo real
  // ============================================================
  atualRef.on("value", (snapshot) => {
    const dados = snapshot.val();
    if (!dados) {
      $("mensagemAlerta").textContent =
        'Conectado, mas ainda não há dados em "' + PATHS.atual + '". Use o simulador abaixo.';
      return;
    }

    const ph = phValido(dados.ph);
    if (ph !== null) estado.ph = ph;
    estado.energia = paraBooleano(dados.energia, estado.energia);
    // oxigenação: usa o valor do banco se existir; senão deriva da energia.
    estado.oxigenacao = dados.oxigenacao !== undefined
      ? paraBooleano(dados.oxigenacao)
      : !estado.energia;
    estado.timestamp = Number(dados.timestamp) || Date.now();

    registrarLeitura(estado);
    atualizarUI();
  }, (erro) => {
    console.error("Erro ao ler o Firebase:", erro);
    toast("Erro ao ler o Firebase: " + erro.message);
  });

  // ============================================================
  //  Carrega o histórico já existente (uma vez, na inicialização)
  // ============================================================
  historicoRef.limitToLast(MAX_PONTOS).once("value")
    .then((snap) => {
      const val = snap.val();
      if (val) {
        Object.values(val)
          .map((d) => ({
            ph: phValido(d.ph),
            energia: paraBooleano(d.energia, true),
            oxigenacao: d.oxigenacao !== undefined ? paraBooleano(d.oxigenacao) : !paraBooleano(d.energia, true),
            timestamp: Number(d.timestamp) || 0
          }))
          .filter((d) => d.ph !== null)
          .sort((a, b) => a.timestamp - b.timestamp)
          .forEach((d) => historico.push(d));
        recortarHistorico();
        atualizarGrafico();
        atualizarTabela();
      }
    })
    .catch((erro) => {
      // Regras podem bloquear a leitura do histórico — não é fatal.
      console.warn("Não foi possível carregar o histórico:", erro.message);
    });

  // ============================================================
  //  Histórico em memória
  // ============================================================
  function registrarLeitura(e) {
    const ultimo = historico[historico.length - 1];
    // Evita duplicar leituras praticamente idênticas e muito próximas no tempo.
    if (ultimo &&
        ultimo.ph === e.ph &&
        ultimo.energia === e.energia &&
        Math.abs((e.timestamp || 0) - (ultimo.timestamp || 0)) < 1500) {
      return;
    }
    historico.push({ ph: e.ph, energia: e.energia, oxigenacao: e.oxigenacao, timestamp: e.timestamp });
    recortarHistorico();
    atualizarGrafico();
    atualizarTabela();
  }

  function recortarHistorico() {
    if (historico.length > MAX_PONTOS) historico.splice(0, historico.length - MAX_PONTOS);
  }

  // ============================================================
  //  Atualização da interface
  // ============================================================
  function atualizarUI() {
    const foraFaixa = estado.ph !== null && (estado.ph < PH_MIN || estado.ph > PH_MAX);

    // --- Cartão pH ---
    $("valorPh").textContent = estado.ph === null ? "--" : estado.ph.toFixed(1);
    $("statusPh").textContent = estado.ph === null
      ? "Aguardando leitura…"
      : (foraFaixa ? "pH fora da faixa aceitável" : "pH dentro da faixa aceitável");
    aplicarEstado($("cardPh"), foraFaixa ? "danger" : (estado.ph === null ? "" : "ok"));

    // marcador da escala (0 a 14)
    if (estado.ph !== null) {
      const pct = Math.max(0, Math.min(100, (estado.ph / 14) * 100));
      $("marcadorPh").style.left = pct + "%";
    }

    // --- Cartão Energia ---
    $("statusEnergia").textContent = estado.energia ? "OK" : "FALTA";
    $("energiaMensagem").textContent = estado.energia
      ? "Energia elétrica disponível"
      : "Energia elétrica indisponível";
    $("iconeEnergia").textContent = estado.energia ? "⚡" : "🔌";
    aplicarEstado($("cardEnergia"), estado.energia ? "ok" : "warn");

    // --- Cartão Oxigenação ---
    $("statusOxigenacao").textContent = estado.oxigenacao ? "ATIVADA" : "DESLIGADA";
    $("oxigenacaoMensagem").textContent = estado.oxigenacao
      ? "Oxigenação de emergência ativada"
      : "Sistema funcionando normalmente";
    $("iconeOxigenacao").textContent = estado.oxigenacao ? "🫧" : "⏸️";
    aplicarEstado($("cardOxigenacao"), estado.oxigenacao ? "warn" : "ok");

    // --- Última atualização ---
    if (estado.timestamp) $("ultimaAtualizacao").textContent = "Atualizado às " + horaCurta(estado.timestamp);

    atualizarAlerta(foraFaixa);
    verificarNotificacao();
  }

  function aplicarEstado(card, tipo) {
    card.classList.remove("estado-ok", "estado-warn", "estado-danger");
    if (tipo) card.classList.add("estado-" + tipo);
  }

  function atualizarAlerta(foraFaixa) {
    const alerta = $("alerta");
    const msg = $("mensagemAlerta");
    const cores = {
      danger: ["var(--danger-bg)", "var(--danger-fg)"],
      warn:   ["var(--warn-bg)",   "var(--warn-fg)"],
      ok:     ["var(--ok-bg)",     "var(--ok-fg)"]
    };

    let tipo, texto;
    if (foraFaixa && !estado.energia) {
      tipo = "danger";
      texto = `⚠️ pH fora da faixa (${estado.ph.toFixed(1)}) e falta de energia. Oxigenação de emergência ativada.`;
    } else if (foraFaixa) {
      tipo = "danger";
      texto = `⚠️ pH fora da faixa aceitável. Valor atual: ${estado.ph.toFixed(1)}`;
    } else if (!estado.energia) {
      tipo = "warn";
      texto = "⚡ Falta de energia detectada. Oxigenação de emergência ativada.";
    } else {
      tipo = "ok";
      texto = estado.ph === null ? "Aguardando dados do sensor…" : "✅ Sistema funcionando normalmente.";
    }

    msg.textContent = texto;
    alerta.style.backgroundColor = cores[tipo][0];
    alerta.style.color = cores[tipo][1];
  }

  // ============================================================
  //  Gráfico (Chart.js)
  // ============================================================
  let grafico = null;

  function criarGrafico() {
    if (typeof Chart === "undefined") return;
    const ctx = $("graficoPh").getContext("2d");

    // faixa aceitável desenhada como área de fundo
    const faixaPlugin = {
      id: "faixaAceitavel",
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!scales.y) return;
        const yTopo = scales.y.getPixelForValue(PH_MAX);
        const yBase = scales.y.getPixelForValue(PH_MIN);
        ctx.save();
        ctx.fillStyle = "rgba(22, 163, 74, 0.10)";
        ctx.fillRect(chartArea.left, yTopo, chartArea.right - chartArea.left, yBase - yTopo);
        ctx.restore();
      }
    };

    grafico = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "pH",
          data: [],
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        scales: {
          y: { min: 0, max: 14, ticks: { stepSize: 2 }, title: { display: true, text: "pH" } },
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [faixaPlugin]
    });
  }

  function atualizarGrafico() {
    if (!grafico) return;
    grafico.data.labels = historico.map((d) => horaCurta(d.timestamp || Date.now()));
    grafico.data.datasets[0].data = historico.map((d) => d.ph);
    grafico.data.datasets[0].pointBackgroundColor = historico.map((d) =>
      (d.ph < PH_MIN || d.ph > PH_MAX) ? "#dc2626" : "#2563eb");
    grafico.update();
  }

  // ============================================================
  //  Tabela de leituras
  // ============================================================
  function atualizarTabela() {
    const corpo = $("corpoTabela");
    if (historico.length === 0) {
      corpo.innerHTML = '<tr class="vazio"><td colspan="5">Nenhuma leitura registrada ainda.</td></tr>';
      return;
    }
    const linhas = historico.slice(-12).reverse().map((d) => {
      const fora = d.ph < PH_MIN || d.ph > PH_MAX;
      const situ = fora ? '<span class="pill danger">pH fora</span>'
                : !d.energia ? '<span class="pill warn">Sem energia</span>'
                : '<span class="pill ok">Normal</span>';
      return `<tr>
        <td>${horaCurta(d.timestamp || Date.now())}</td>
        <td><strong>${d.ph.toFixed(1)}</strong></td>
        <td>${d.energia ? "OK" : "Falta"}</td>
        <td>${d.oxigenacao ? "Ativada" : "Desligada"}</td>
        <td>${situ}</td>
      </tr>`;
    }).join("");
    corpo.innerHTML = linhas;
  }

  // ============================================================
  //  Simulador — grava no Firebase (simula o ESP32)
  // ============================================================
  function enviarParaFirebase(novo) {
    const leitura = {
      ph: novo.ph,
      energia: novo.energia,
      oxigenacao: !novo.energia,          // regra: sem energia -> oxigenação ligada
      timestamp: Date.now()
    };
    return atualRef.set(leitura)          // atualiza o estado atual
      .then(() => historicoRef.push(leitura))  // guarda no histórico
      .catch((erro) => {
        // Sem permissão de escrita: atualiza a tela localmente para o demo continuar.
        console.warn("Escrita bloqueada pelas regras:", erro.message);
        toast("Sem permissão de escrita no Firebase — exibindo localmente. Ajuste as Regras (veja o README).");
        estado.ph = leitura.ph;
        estado.energia = leitura.energia;
        estado.oxigenacao = leitura.oxigenacao;
        estado.timestamp = leitura.timestamp;
        registrarLeitura(estado);
        atualizarUI();
      });
  }

  function phAtualParaEnvio() {
    return estado.ph === null ? 7.0 : estado.ph;
  }

  // Botões de pH
  $("btnPhBaixo").addEventListener("click", () => enviarParaFirebase({ ph: 5.5, energia: estado.energia }));
  $("btnPhNormal").addEventListener("click", () => enviarParaFirebase({ ph: 7.2, energia: estado.energia }));
  $("btnPhAlto").addEventListener("click", () => enviarParaFirebase({ ph: 9.2, energia: estado.energia }));

  // Energia
  $("btnFaltaEnergia").addEventListener("click", () => enviarParaFirebase({ ph: phAtualParaEnvio(), energia: false }));
  $("btnEnergiaNormal").addEventListener("click", () => enviarParaFirebase({ ph: phAtualParaEnvio(), energia: true }));

  // Slider de pH manual
  const slider = $("sliderPh");
  slider.addEventListener("input", () => { $("sliderValor").textContent = Number(slider.value).toFixed(1); });
  $("enviarPh").addEventListener("click", () =>
    enviarParaFirebase({ ph: Number(slider.value), energia: estado.energia }));

  // Limpar histórico (só a visualização local)
  $("limparHistorico").addEventListener("click", () => {
    historico.length = 0;
    atualizarGrafico();
    atualizarTabela();
    toast("Histórico da tela limpo.");
  });

  // Simulação automática do ESP32
  let autoTimer = null;
  $("btnAuto").addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      btn.textContent = "▶ Iniciar simulação automática do ESP32";
      btn.classList.remove("btn-warn");
      btn.classList.add("btn-sec");
      return;
    }
    btn.textContent = "⏹ Parar simulação automática";
    btn.classList.remove("btn-sec");
    btn.classList.add("btn-warn");
    const passo = () => {
      // pH oscila em torno de um valor com pequena variação aleatória
      const base = estado.ph === null ? 7.0 : estado.ph;
      let ph = base + (Math.random() - 0.5) * 0.8;
      ph = Math.max(0, Math.min(14, ph));
      enviarParaFirebase({ ph: Number(ph.toFixed(1)), energia: estado.energia });
    };
    passo();
    autoTimer = setInterval(passo, 3000);
  });

  // ============================================================
  //  Notificações (PWA) — avisa quando o pH sai da faixa ou falta energia
  // ============================================================
  const suportaNotif = ("Notification" in window) && ("serviceWorker" in navigator);
  const btnNotif = $("btnNotificacoes");
  let alertaAnterior = null;   // guarda a última situação para notificar só nas mudanças

  function classificarAlerta() {
    // Usa os limites configurados pelo usuário (aba Configurações).
    if (config.phBaixoAtivo && estado.ph !== null && estado.ph < config.phBaixo) return "ph-baixo";
    if (config.phAltoAtivo && estado.ph !== null && estado.ph > config.phAlto) return "ph-alto";
    if (config.energiaAtivo && !estado.energia) return "sem-energia";
    return "ok";
  }

  const TEXTOS_ALERTA = {
    "ph-baixo":    () => ["⚠️ pH baixo", `pH em ${estado.ph.toFixed(1)} — abaixo de ${config.phBaixo}.`],
    "ph-alto":     () => ["⚠️ pH alto", `pH em ${estado.ph.toFixed(1)} — acima de ${config.phAlto}.`],
    "sem-energia": () => ["⚡ Falta de energia", "Oxigenação de emergência ativada."],
    "ok":          () => ["✅ Sistema normalizado", "pH e energia voltaram ao normal."]
  };

  function verificarNotificacao() {
    const atual = classificarAlerta();
    if (alertaAnterior === null) { alertaAnterior = atual; return; } // ignora a 1ª leitura
    if (atual === alertaAnterior) return;
    alertaAnterior = atual;

    if (!suportaNotif || Notification.permission !== "granted") return;
    if (atual === "ok" && !config.normalizadoAtivo) return; // só avisa "normalizado" se o usuário quiser
    const [titulo, corpo] = TEXTOS_ALERTA[atual]();
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(titulo, {
        body: corpo,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: "monitoramento",
        renotify: true
      }))
      .catch((e) => console.warn("Falha ao notificar:", e.message));
  }

  function atualizarBotaoNotif() {
    if (!suportaNotif) {
      btnNotif.textContent = "🔔 Sem suporte a notificações";
      btnNotif.disabled = true;
      return;
    }
    if (Notification.permission === "granted") {
      btnNotif.textContent = "🔔 Notificações ativadas";
      btnNotif.disabled = true;
    } else if (Notification.permission === "denied") {
      btnNotif.textContent = "🔕 Notificações bloqueadas";
      btnNotif.disabled = true;
    } else {
      btnNotif.textContent = "🔔 Ativar notificações";
      btnNotif.disabled = false;
    }
  }

  btnNotif.addEventListener("click", async () => {
    if (!suportaNotif) return;
    try {
      const permissao = await Notification.requestPermission();
      atualizarBotaoNotif();
      if (permissao === "granted") {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("🔔 Notificações ativadas", {
          body: "Você será avisado quando o pH sair da faixa ou faltar energia.",
          icon: "./icon-192.png",
          badge: "./icon-192.png"
        });
      } else if (permissao === "denied") {
        toast("Notificações bloqueadas. Ative nas configurações do navegador/app.");
      }
    } catch (e) {
      toast("Não foi possível ativar as notificações.");
    }
  });

  // Registra o Service Worker (necessário para as notificações no iPhone).
  // Só funciona em https (Vercel) ou localhost — abrindo por file:// ele é ignorado.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js")
      .catch((e) => console.warn("Service Worker não registrado:", e.message));
  }

  // ============================================================
  //  Aba de Configurações (troca de abas + formulário)
  // ============================================================
  function iniciarAbas() {
    const tabs = document.querySelectorAll(".tab");
    const views = { painel: $("viewPainel"), config: $("viewConfig") };
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("ativo"));
        tab.classList.add("ativo");
        const alvo = tab.getAttribute("data-view");
        Object.keys(views).forEach((k) => { views[k].hidden = (k !== alvo); });
      });
    });
  }

  function preencherFormConfig() {
    $("cfgPhBaixoAtivo").checked = config.phBaixoAtivo;
    $("cfgPhBaixo").value = config.phBaixo;
    $("cfgPhAltoAtivo").checked = config.phAltoAtivo;
    $("cfgPhAlto").value = config.phAlto;
    $("cfgEnergia").checked = config.energiaAtivo;
    $("cfgNormalizado").checked = config.normalizadoAtivo;
  }

  function lerFormConfig() {
    config.phBaixoAtivo = $("cfgPhBaixoAtivo").checked;
    config.phAltoAtivo = $("cfgPhAltoAtivo").checked;
    config.energiaAtivo = $("cfgEnergia").checked;
    config.normalizadoAtivo = $("cfgNormalizado").checked;
    const pb = Number($("cfgPhBaixo").value);
    if (Number.isFinite(pb)) config.phBaixo = pb;
    const pa = Number($("cfgPhAlto").value);
    if (Number.isFinite(pa)) config.phAlto = pa;
    salvarConfig();

    const status = $("cfgStatus");
    status.textContent = "✔ Configurações salvas neste aparelho.";
    clearTimeout(status._t);
    status._t = setTimeout(() => { status.textContent = ""; }, 2500);
  }

  function iniciarConfigUI() {
    preencherFormConfig();
    ["cfgPhBaixoAtivo", "cfgPhBaixo", "cfgPhAltoAtivo", "cfgPhAlto", "cfgEnergia", "cfgNormalizado"]
      .forEach((id) => $(id).addEventListener("change", lerFormConfig));

    $("btnTesteNotif").addEventListener("click", () => {
      if (!suportaNotif) { toast("Este navegador não suporta notificações."); return; }
      if (Notification.permission !== "granted") {
        toast("Ative as notificações primeiro (botão 🔔 no topo).");
        return;
      }
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification("🔔 Notificação de teste", {
          body: "Está funcionando! Os alertas chegarão assim.",
          icon: "./icon-192.png",
          badge: "./icon-192.png"
        }))
        .catch(() => toast("Não foi possível enviar a notificação de teste."));
    });

    $("btnRestaurarCfg").addEventListener("click", () => {
      config = Object.assign({}, CONFIG_PADRAO);
      salvarConfig();
      preencherFormConfig();
      toast("Configurações restauradas para o padrão.");
    });
  }

  // ============================================================
  //  Boot
  // ============================================================
  criarGrafico();
  iniciarAbas();
  iniciarConfigUI();
  atualizarUI();
  atualizarBotaoNotif();
  $("sliderValor").textContent = Number(slider.value).toFixed(1);
})();
