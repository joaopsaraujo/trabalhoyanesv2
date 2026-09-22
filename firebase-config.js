// ============================================================
//  Configuração do Firebase
//  Substitua os valores abaixo pelos do SEU projeto Firebase
//  (Console Firebase > Configurações do projeto > Seus apps > Web).
//  Obs.: essas chaves de app web NÃO são secretas — a segurança
//  de verdade vem das Regras do Realtime Database (veja o README).
// ============================================================
window.firebaseConfig = {
  apiKey: "AIzaSyDj_jqctc70yQZ57uc-XatbPvw_tWRK3CI",
  authDomain: "monitoramento-ph.firebaseapp.com",
  databaseURL: "https://monitoramento-ph-default-rtdb.firebaseio.com",
  projectId: "monitoramento-ph",
  storageBucket: "monitoramento-ph.firebasestorage.app",
  messagingSenderId: "712911339308",
  appId: "1:712911339308:web:d5b6648a8afa5c36fe3689"
};

// Caminhos usados no Realtime Database
window.PATHS = {
  atual: "monitoramento",   // estado atual — o ESP32 escreve aqui
  historico: "historico"    // histórico de leituras (lista com push)
};

// Faixa de pH considerada aceitável
window.PH_MIN = 6.5;
window.PH_MAX = 8.5;

// Quantos pontos manter no gráfico / tabela
window.MAX_PONTOS = 60;
