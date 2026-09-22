/*sera usado alterado e usado como base futuramente para funcionamento do site juntamente com hardware 
/* ============================================================
 *  Monitoramento da Água — Firmware de exemplo para ESP32
 *  Lê o sensor de pH, verifica a energia e envia ao Firebase.
 *
 *  Biblioteca necessária (Gerenciador de Bibliotecas do Arduino):
 *    "Firebase ESP Client" (por Mobizt)  ->  #include <Firebase_ESP_Client.h>
 *  Placa: ESP32 (instale o pacote "esp32" pelo Boards Manager)
 *
 *  Fluxo:  Sensor de pH -> ESP32 -> Wi-Fi -> Firebase Realtime Database
 * ============================================================ */

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/RTDBHelper.h"
#include "addons/TokenHelper.h"

// ---------- Configurações que VOCÊ precisa preencher ----------
#define WIFI_SSID      "SUA_REDE_WIFI"
#define WIFI_PASSWORD  "SUA_SENHA_WIFI"

// Pegue no Console do Firebase (Realtime Database) e nas Configurações do projeto:
#define API_KEY        "AIzaSyDj_jqctc70yQZ57uc-XatbPvw_tWRK3CI"
#define DATABASE_URL   "https://monitoramento-ph-default-rtdb.firebaseio.com"

// ---------- Pinos ----------
#define PINO_SENSOR_PH   34   // entrada analógica do sensor de pH
#define PINO_ENERGIA     35   // entrada digital: HIGH = tem energia (ex.: saída de um relé/optoacoplador)

// ---------- Objetos do Firebase ----------
FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;

unsigned long ultimoEnvio = 0;
const unsigned long INTERVALO = 3000;  // envia a cada 3 segundos

// Converte a leitura analógica (0-4095) em um valor de pH aproximado.
// AJUSTE conforme a calibração do SEU sensor (dois pontos: pH 4.0 e pH 7.0).
float lerPh() {
  int leitura = analogRead(PINO_SENSOR_PH);
  float tensao = leitura * (3.3 / 4095.0);
  // Exemplo simples de conversão linear — calibre com soluções-padrão.
  float ph = 7.0 + ((2.5 - tensao) / 0.18);
  if (ph < 0)  ph = 0;
  if (ph > 14) ph = 14;
  return ph;
}

bool temEnergia() {
  return digitalRead(PINO_ENERGIA) == HIGH;
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_ENERGIA, INPUT);

  // Conecta ao Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println("\nWi-Fi conectado: " + WiFi.localIP().toString());

  // Configura o Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  // Login anônimo (habilite "Anônimo" em Authentication no Console).
  // Se as regras estiverem em modo de teste (.write: true), o login pode
  // não ser necessário, mas é recomendado.
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase: autenticado.");
  } else {
    Serial.printf("Firebase (signUp): %s\n", config.signer.signupError.message.c_str());
  }
  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  if (Firebase.ready() && (millis() - ultimoEnvio > INTERVALO)) {
    ultimoEnvio = millis();

    float ph = lerPh();
    bool energia = temEnergia();
    bool oxigenacao = !energia;   // regra do projeto: sem energia -> oxigenação ligada

    // Aciona fisicamente a oxigenação (ex.: um relé) — descomente e ajuste o pino.
    // digitalWrite(PINO_RELE_OXIGENACAO, oxigenacao ? HIGH : LOW);

    unsigned long ts = millis();  // ideal: usar hora real via NTP

    // 1) Atualiza o estado atual em /monitoramento
    FirebaseJson atual;
    atual.set("ph", ph);
    atual.set("energia", energia);
    atual.set("oxigenacao", oxigenacao);
    atual.set("timestamp", (double)ts);
    if (Firebase.RTDB.setJSON(&fbdo, "monitoramento", &atual)) {
      Serial.printf("Enviado: pH=%.1f energia=%d\n", ph, energia);
    } else {
      Serial.println("Erro ao enviar: " + fbdo.errorReason());
    }

    // 2) Empilha a leitura no histórico em /historico
    FirebaseJson leitura;
    leitura.set("ph", ph);
    leitura.set("energia", energia);
    leitura.set("oxigenacao", oxigenacao);
    leitura.set("timestamp", (double)ts);
    Firebase.RTDB.pushJSON(&fbdo, "historico", &leitura);
  }
}
