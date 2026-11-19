# Ponto de Coleta no Wokwi

Simulação do Ponto de Coleta Inteligente no [Wokwi](https://wokwi.com): Arduino Uno com teclado 4×4, LCD 16×2 I2C, balança, sensor de temperatura, LED e buzzer. A lógica é a mesma do sketch do Tinkercad ([`../ponto-coleta/ponto_coleta.ino`](../ponto-coleta/ponto_coleta.ino)), gerado a partir deste com `python iot/wokwi/gerar_tinkercad.py`.

| Peça no Wokwi | Papel | Pino | No Tinkercad / hardware real |
| --- | --- | --- | --- |
| Potenciômetro `balanca` | Balança (peso) | A0 | FSR / célula de carga + HX711 |
| Sensor NTC | Temperatura | A1 | TMP36 |
| Teclado membrana 4×4 | Protocolo e código | linhas 9, 8, 7, 6 · colunas 5, 4, 3, 2 | igual |
| LCD 16×2 I2C (0x27) | Mensagens | SDA A4 · SCL A5 | igual (outra biblioteca) |
| LED vermelho + 220 Ω | Alerta | 10 | igual |
| Buzzer | Bipe | 11 | igual |

## Abrir no wokwi.com

1. Em [wokwi.com](https://wokwi.com) → **New Project** → **Arduino Uno**.
2. Cole o conteúdo de [`sketch.ino`](sketch.ino) na aba `sketch.ino`.
3. Na aba `diagram.json`, cole o conteúdo de [`diagram.json`](diagram.json).
4. Em **Library Manager**, adicione **Keypad** e **LiquidCrystal I2C**, ou crie a aba `libraries.txt` com o conteúdo de [`libraries.txt`](libraries.txt).
5. Clique em **Play** e use o teclado: clique nele e digite pelo teclado do computador, ou pelo Serial Monitor.
6. **Save** e **Share** dão o link público para o PDF da entrega.

## Como usar

- **Entrega:** digite o protocolo de 6 números e `#`. O visor pede a doação: gire a balança para aumentar o peso e espere 3 s. O visor mostra "Entrega OK!" e o Serial imprime o evento `entrega_depositada`.
- **Retirada:** `B`, o protocolo e `#`, depois o código de retirada (4 números, só de quem pediu) e `#`. O visor mostra o código como `****`, e o Serial imprime o evento `retirada` com o código. Quem confere o código é a API, e com ele o que estava no ponto conta como recebido.
- **Alerta:** aumente a temperatura do sensor NTC acima de 30 °C, ou deixe a balança abaixo de 15% da capacidade. O LED acende e o buzzer toca na próxima leitura (a cada 60 s e ao ligar).
- `*` cancela e volta ao início.

As linhas JSON do Serial têm o mesmo formato que a API recebe em `POST /iot/pontos/{id}/eventos`. Com hardware real, [`../simulador/ponte_serial.py`](../simulador/ponte_serial.py) repassa essas linhas para a API.

## Teste automático (Wokwi CLI)

[`cenario-entrega.yaml`](cenario-entrega.yaml) liga o ponto, faz uma entrega e uma retirada, e confere as linhas JSON no Serial. As teclas vão pelo Serial, porque o teclado membrana não tem controle de automação no Wokwi.

```bash
# compilar (gera build/sketch.ino.hex, que o wokwi.toml usa)
arduino-cli compile --fqbn arduino:avr:uno --output-dir build sketch   # com o sketch numa pasta "sketch"
# rodar (precisa de WOKWI_CLI_TOKEN da sua conta do Wokwi)
wokwi-cli . --scenario cenario-entrega.yaml --timeout 30000
```
