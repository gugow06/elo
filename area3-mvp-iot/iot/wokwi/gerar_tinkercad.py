"""Gera iot/ponto-coleta/ponto_coleta.ino (Tinkercad) a partir de iot/wokwi/sketch.ino.
Só muda o que difere entre os simuladores: LCD (Adafruit_LiquidCrystal), temperatura (TMP36),
peso (FSR) e o cabeçalho."""
from pathlib import Path

# Uso: python iot/wokwi/gerar_tinkercad.py (de qualquer pasta)
raiz = Path(__file__).resolve().parent.parent
s = open(f'{raiz}/wokwi/sketch.ino', encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b)


rep(""" * ELO — Ponto de Coleta Inteligente (Arduino Uno / Wokwi)
 *
 * Mesma lógica do ponto_coleta.ino (Tinkercad), com as peças que o Wokwi tem:
 *   - Peso (balança): potenciômetro no A0 (no hardware real, célula de carga + HX711)
 *   - Temperatura: sensor NTC no A1 (no Tinkercad, TMP36)
 *   - LCD 16x2 I2C no endereço 0x27 (biblioteca LiquidCrystal_I2C)
 *   - Teclado 4x4 nos pinos 2..9, LED no 10, buzzer no 11""",
    """ * ELO — Ponto de Coleta Inteligente (Arduino Uno / Tinkercad)
 *
 * Gerado a partir de ../wokwi/sketch.ino (mesma lógica), com as peças que o Tinkercad tem:
 *   - Peso (balança): sensor de força FSR no A0 (no hardware real, célula de carga + HX711)
 *   - Temperatura: TMP36 no A1 (no Wokwi, sensor NTC)
 *   - LCD 16x2 I2C (Adafruit_LiquidCrystal, A4/A5)
 *   - Teclado 4x4 nos pinos 2..9, LED no 10, buzzer no 11""")
rep("""#include <Keypad.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>""", """#include <Keypad.h>
#include <Adafruit_LiquidCrystal.h>""")
rep("""const float BETA_NTC = 3950;           // coeficiente do NTC do Wokwi
""", "")
rep("""LiquidCrystal_I2C lcd(0x27, 16, 2);""", """Adafruit_LiquidCrystal lcd(0);""")
rep("""float lerTemperaturaC() {
  // Nos extremos (0 ou 1023) a fórmula daria infinito e o JSON sairia inválido: limita a faixa
  int v = constrain(analogRead(PINO_TEMP), 1, 1022);
  return 1 / (log(1 / (1023. / v - 1)) / BETA_NTC + 1.0 / 298.15) - 273.15;
}""", """float lerTemperaturaC() {
  float volts = analogRead(PINO_TEMP) * (5.0 / 1024.0);
  return (volts - 0.5) * 100.0;                 // TMP36: 10 mV/°C com offset de 500 mV
}""")
rep("""  lcd.init();
  lcd.backlight();""", """  lcd.begin(16, 2);
  lcd.setBacklight(HIGH);""")
rep(""" * As teclas também podem vir pelo Serial (o teste automatizado do Wokwi usa isso).""",
    """ * As teclas também podem vir pelo Serial Monitor.""")
rep("""/** Teclado ou Serial (o teste automatizado manda as teclas pelo Serial). */""", """/** Teclado ou Serial Monitor. */""")
open(f'{raiz}/ponto-coleta/ponto_coleta.ino', 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
