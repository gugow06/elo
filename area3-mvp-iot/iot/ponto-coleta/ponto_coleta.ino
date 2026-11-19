/*
 * ELO — Ponto de Coleta Inteligente (Arduino Uno / Tinkercad)
 *
 * Sensores:
 *   - Peso (balança): sensor de força FSR no A0 (no Tinkercad representa a célula de carga)
 *   - Temperatura: TMP36 no A1
 * Interface:
 *   - Teclado 4x4 nos pinos 2..9: voluntário digita o protocolo de 6 dígitos e confirma com '#'
 *   - LCD 16x2 I2C (A4/A5): mensagens para o voluntário
 *   - LED (pino 10) e buzzer (pino 11): alerta de temperatura alta ou estoque baixo
 *
 * Saída: cada evento é impresso no Serial como uma linha JSON, no MESMO formato que a API
 * recebe em POST /iot/pontos/{id}/eventos. Com hardware real, ponte_serial.py repassa
 * essas linhas para a API. No Tinkercad (sem rede), o simulador Python faz esse papel.
 *
 * Nenhum dado pessoal é captado: apenas peso, temperatura e o número do protocolo.
 */
#include <Keypad.h>
#include <Adafruit_LiquidCrystal.h>

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
const unsigned long ESTABILIZAR_MS = 3000;   // peso precisa ficar estável por 3 s
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

Adafruit_LiquidCrystal lcd(0);

enum Estado { AGUARDANDO_PROTOCOLO, AGUARDANDO_DEPOSITO };
Estado estado = AGUARDANDO_PROTOCOLO;

String protocolo = "";
float pesoAntes = 0;
unsigned long inicioDeposito = 0;
unsigned long inicioEstavel = 0;
unsigned long ultimaLeitura = 0;

float lerPesoKg() {
  int bruto = analogRead(PINO_PESO);            // 0..1023
  return bruto * (CAPACIDADE_KG / 1023.0);
}

float lerTemperaturaC() {
  float volts = analogRead(PINO_TEMP) * (5.0 / 1024.0);
  return (volts - 0.5) * 100.0;                 // TMP36: 10 mV/°C com offset de 500 mV
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

void reiniciar() {
  protocolo = "";
  estado = AGUARDANDO_PROTOCOLO;
  mostrar("ELO Ponto Coleta", "Protocolo + #");
}

void setup() {
  Serial.begin(9600);
  pinMode(PINO_LED, OUTPUT);
  pinMode(PINO_BUZZER, OUTPUT);
  lcd.begin(16, 2);
  lcd.setBacklight(HIGH);
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

  char tecla = teclado.getKey();

  if (estado == AGUARDANDO_PROTOCOLO && tecla) {
    if (tecla >= '0' && tecla <= '9' && protocolo.length() < 6) {
      protocolo += tecla;
      mostrar("Protocolo:", protocolo);
    } else if (tecla == '*') {
      reiniciar();
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
    if (tecla == '*') reiniciar();
  }
}
