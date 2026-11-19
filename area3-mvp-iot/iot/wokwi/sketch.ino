/*
 * ELO — Ponto de Coleta Inteligente (Arduino Uno / Wokwi)
 *
 * Mesma lógica do ponto_coleta.ino (Tinkercad), com as peças que o Wokwi tem:
 *   - Peso (balança): potenciômetro no A0 (no hardware real, célula de carga + HX711)
 *   - Temperatura: sensor NTC no A1 (no Tinkercad, TMP36)
 *   - LCD 16x2 I2C no endereço 0x27 (biblioteca LiquidCrystal_I2C)
 *   - Teclado 4x4 nos pinos 2..9, LED no 10, buzzer no 11
 *
 * Fluxos no teclado:
 *   - Entrega (padrão): protocolo de 6 dígitos + '#', depois a doação na balança (peso sobe e fica
 *     estável por 3 s) → evento "entrega_depositada".
 *   - Retirada: 'B', protocolo + '#', código de retirada (4 dígitos, só de quem pediu) + '#'
 *     → evento "retirada". A API confere o código e marca o que estava no ponto como recebido
 *     (o código aparece como **** no visor).
 *   - '*' cancela e volta ao início.
 * As teclas também podem vir pelo Serial (o teste automatizado do Wokwi usa isso).
 *
 * Saída: cada evento é uma linha JSON no Serial, no MESMO formato que a API recebe em
 * POST /iot/pontos/{id}/eventos. Nenhum dado pessoal é captado.
 */
#include <Keypad.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>

// ----- Pinos -----
const int PINO_PESO = A0;
const int PINO_TEMP = A1;
const int PINO_LED = 10;
const int PINO_BUZZER = 11;

// ----- Limiares (iguais aos da API) -----
const float CAPACIDADE_KG = 300.0;     // fundo de escala da balança
const float DELTA_MINIMO_KG = 0.5;     // variação mínima para considerar depósito
const float TEMPERATURA_MAX_C = 30.0;
const float ESTOQUE_BAIXO_PCT = 15.0;
const float BETA_NTC = 3950;           // coeficiente do NTC do Wokwi
const unsigned long ESTABILIZAR_MS = 3000;     // peso precisa ficar estável por 3 s
const unsigned long TEMPO_DEPOSITO_MS = 60000; // sem depósito em 60 s: pendente
const unsigned long INTERVALO_LEITURA_MS = 60000;

// ----- Teclado 4x4 -----
const byte LINHAS = 4, COLUNAS = 4;
char teclas[LINHAS][COLUNAS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte pinosLinhas[LINHAS] = {9, 8, 7, 6};
byte pinosColunas[COLUNAS] = {5, 4, 3, 2};
Keypad teclado = Keypad(makeKeymap(teclas), pinosLinhas, pinosColunas, LINHAS, COLUNAS);

LiquidCrystal_I2C lcd(0x27, 16, 2);

enum Estado { AGUARDANDO_PROTOCOLO, AGUARDANDO_DEPOSITO, RETIRADA_PROTOCOLO, RETIRADA_CODIGO };
Estado estado = AGUARDANDO_PROTOCOLO;

String protocolo = "";
String codigo = "";
float pesoAntes = 0;
unsigned long inicioDeposito = 0;
unsigned long inicioEstavel = 0;
unsigned long ultimaLeitura = 0;

float lerPesoKg() {
  int bruto = analogRead(PINO_PESO);            // 0..1023
  return bruto * (CAPACIDADE_KG / 1023.0);
}

float lerTemperaturaC() {
  // Nos extremos (0 ou 1023) a fórmula daria infinito e o JSON sairia inválido: limita a faixa
  int v = constrain(analogRead(PINO_TEMP), 1, 1022);
  return 1 / (log(1 / (1023. / v - 1)) / BETA_NTC + 1.0 / 298.15) - 273.15;
}

void mostrar(const char* l1, const String& l2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(l1);
  lcd.setCursor(0, 1);
  lcd.print(l2);
}

void alerta(bool ligado) {
  digitalWrite(PINO_LED, ligado ? HIGH : LOW);
  if (ligado) tone(PINO_BUZZER, 1000, 200);
}

void enviarLeitura() {
  float peso = lerPesoKg();
  float temp = lerTemperaturaC();
  Serial.print("{\"tipo\":\"leitura_sensor\",\"peso_kg\":");
  Serial.print(peso, 2);
  Serial.print(",\"temperatura_c\":");
  Serial.print(temp, 1);
  Serial.println("}");

  bool estoqueBaixo = (peso / CAPACIDADE_KG) * 100.0 < ESTOQUE_BAIXO_PCT;
  alerta(temp > TEMPERATURA_MAX_C || estoqueBaixo);
}

void enviarEntrega(float delta, float pesoDepois) {
  Serial.print("{\"tipo\":\"entrega_depositada\",\"protocolo\":\"");
  Serial.print(protocolo);
  Serial.print("\",\"delta_peso_kg\":");
  Serial.print(delta, 2);
  Serial.print(",\"peso_kg\":");
  Serial.print(pesoDepois, 2);
  Serial.print(",\"temperatura_c\":");
  Serial.print(lerTemperaturaC(), 1);
  Serial.println("}");
}

/** A API confere o código e responde; aqui o visor só diz que a retirada foi enviada. */
void enviarRetirada() {
  float peso = lerPesoKg();
  Serial.print("{\"tipo\":\"retirada\",\"protocolo\":\"");
  Serial.print(protocolo);
  Serial.print("\",\"codigo\":\"");
  Serial.print(codigo);
  Serial.print("\",\"delta_peso_kg\":0,\"peso_kg\":");
  Serial.print(peso, 2);
  Serial.println("}");
}

void reiniciar() {
  protocolo = "";
  codigo = "";
  estado = AGUARDANDO_PROTOCOLO;
  mostrar("ELO Ponto Coleta", "Protocolo + #");
}

/** Teclado ou Serial (o teste automatizado manda as teclas pelo Serial). */
char proximaTecla() {
  char t = teclado.getKey();
  if (t) return t;
  while (Serial.available()) {
    char c = Serial.read();
    if ((c >= '0' && c <= '9') || c == '#' || c == '*' || (c >= 'A' && c <= 'D')) return c;
  }
  return 0;
}

void setup() {
  Serial.begin(9600);
  pinMode(PINO_LED, OUTPUT);
  pinMode(PINO_BUZZER, OUTPUT);
  lcd.init();
  lcd.backlight();
  reiniciar();
  enviarLeitura();
  ultimaLeitura = millis();
}

void loop() {
  unsigned long agora = millis();

  // Telemetria periódica (estoque e temperatura)
  if (agora - ultimaLeitura >= INTERVALO_LEITURA_MS) {
    enviarLeitura();
    ultimaLeitura = agora;
  }

  char tecla = proximaTecla();
  if (tecla == '*') {
    reiniciar();
    return;
  }

  // ----- Entrega: protocolo + '#' -----
  if (estado == AGUARDANDO_PROTOCOLO && tecla) {
    if (tecla == 'B') {
      estado = RETIRADA_PROTOCOLO;
      mostrar("Retirada:", "Protocolo + #");
    } else if (tecla >= '0' && tecla <= '9' && protocolo.length() < 6) {
      protocolo += tecla;
      mostrar("Protocolo:", protocolo);
    } else if (tecla == '#') {
      if (protocolo.length() == 6) {
        // Na versão em rede, aqui o dispositivo chama GET /iot/pontos/{id}/protocolos/{protocolo}
        pesoAntes = lerPesoKg();
        inicioDeposito = agora;
        inicioEstavel = 0;
        estado = AGUARDANDO_DEPOSITO;
        mostrar("Coloque a doacao", "na balanca...");
      } else {
        mostrar("Protocolo tem", "6 digitos");
        delay(1500);
        reiniciar();
      }
    }
    return;
  }

  if (estado == AGUARDANDO_DEPOSITO) {
    float pesoAtual = lerPesoKg();
    float delta = pesoAtual - pesoAntes;

    if (delta >= DELTA_MINIMO_KG) {
      if (inicioEstavel == 0) inicioEstavel = agora;
      if (agora - inicioEstavel >= ESTABILIZAR_MS) {
        enviarEntrega(delta, pesoAtual);
        mostrar("Entrega OK!", "Obrigado :)");
        tone(PINO_BUZZER, 1500, 150);
        delay(2500);
        reiniciar();
      }
    } else {
      inicioEstavel = 0;
    }

    if (agora - inicioDeposito >= TEMPO_DEPOSITO_MS) {
      // Sem variação de peso: a entrega fica para confirmação manual do responsável
      mostrar("Peso nao", "detectado");
      delay(2000);
      reiniciar();
    }
    return;
  }

  // ----- Retirada: 'B', protocolo + '#', código de retirada + '#' -----
  if (estado == RETIRADA_PROTOCOLO && tecla) {
    if (tecla >= '0' && tecla <= '9' && protocolo.length() < 6) {
      protocolo += tecla;
      mostrar("Ret. protocolo:", protocolo);
    } else if (tecla == '#') {
      if (protocolo.length() == 6) {
        estado = RETIRADA_CODIGO;
        mostrar("Codigo retirada", "4 digitos + #");
      } else {
        mostrar("Protocolo tem", "6 digitos");
        delay(1500);
        reiniciar();
      }
    }
    return;
  }

  if (estado == RETIRADA_CODIGO && tecla) {
    if (tecla >= '0' && tecla <= '9' && codigo.length() < 4) {
      codigo += tecla;
      String oculto = "";
      for (unsigned int i = 0; i < codigo.length(); i++) oculto += '*';  // não mostra o código
      mostrar("Codigo retirada", oculto);
    } else if (tecla == '#') {
      if (codigo.length() == 4) {
        enviarRetirada();
        mostrar("Retirada enviada", "Aguarde o agente");
        tone(PINO_BUZZER, 1500, 150);
        delay(2500);
        reiniciar();
      } else {
        mostrar("Codigo tem", "4 digitos");
        delay(1500);
        reiniciar();
      }
    }
  }
}
