# IoT — Ponto de Coleta Inteligente

Pelo PRD do ELO, a doação material é entregue **sempre num ponto de coleta**, nunca na casa do cidadão. O Ponto de Coleta Inteligente confirma a entrega sozinho: a voluntária digita o protocolo do pedido, coloca a doação na balança e o sistema avisa a família e devolve **"Sua ajuda chegou"** para quem ajudou.

O ponto **não capta nenhum dado pessoal**: só peso, temperatura e o número do protocolo.

## Sensores e componentes

| Componente | Função | Pino (Arduino Uno) |
| --- | --- | --- |
| **Sensor 1: peso** (FSR no Tinkercad; célula de carga + HX711 no hardware real) | Detecta o depósito e mede o estoque do ponto | A0 |
| **Sensor 2: temperatura** (TMP36) | Conservação dos alimentos | A1 |
| Teclado 4×4 | Voluntário digita o protocolo de 6 dígitos e confirma com `#` (`*` apaga) | Linhas 9, 8, 7, 6 · Colunas 5, 4, 3, 2 |
| LCD 16×2 I2C | Mensagens ("Protocolo + #", "Entrega OK!") | SDA A4 · SCL A5 |
| LED vermelho (+ resistor 220 Ω) | Alerta de temperatura alta ou estoque baixo | 10 |
| Buzzer piezo | Bipe de confirmação e alerta | 11 |

Ligação dos sensores analógicos:
- **FSR:** um terminal no 5 V, o outro no A0 e num resistor de 10 kΩ para o GND (divisor de tensão).
- **TMP36:** pino esquerdo no 5 V, central no A1, direito no GND.

## Como montar no Tinkercad

1. Em [tinkercad.com](https://www.tinkercad.com) → **Circuits** → **Create new Circuit**.
2. Adicione: Arduino Uno R3, Keypad 4×4, LCD 16×2 (I2C), Force Sensor (FSR), Temperature Sensor (TMP36), LED, Piezo, resistores de 10 kΩ e 220 Ω.
3. Ligue conforme a tabela acima.
4. Em **Code** → **Text**, cole o conteúdo de [`ponto-coleta/ponto_coleta.ino`](ponto-coleta/ponto_coleta.ino).
5. **Start Simulation**. Abra o **Serial Monitor**, digite um protocolo de 6 dígitos + `#` e aumente a força no FSR: depois de 3 s estável, o LCD mostra "Entrega OK!" e o Serial imprime o evento `entrega_depositada` em JSON.
6. Aqueça o TMP36 acima de 30 °C: o LED acende e o buzzer toca.

Para a entrega: print do circuito e o link público da simulação vão no PDF.

## Integração com a API

O Arduino do Tinkercad não tem rede. Por isso, o **simulador** (`simulador/simulador.py`) envia para a API **exatamente as mesmas mensagens** que o sketch imprime no Serial. É ele que aparece integrado na demonstração. Com hardware real, `simulador/ponte_serial.py` lê o Serial e repassa para a API.

```
Tinkercad (evidência)       Simulador Python (demo)        Hardware real
 ponto_coleta.ino            simulador.py                   Arduino ─Serial─▶ ponte_serial.py
        │ JSON no Serial            │ HTTP                                         │ HTTP
        └────────── mesmo formato ──┴──────────▶ POST /iot/pontos/{id}/eventos ◀──┘
```

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/iot/pontos/{id}/estado` | Estoque atual e limiares (o dispositivo sincroniza ao ligar) |
| `GET` | `/iot/pontos/{id}/protocolos/{protocolo}` | Confere o protocolo antes do depósito e devolve o texto do LCD |
| `POST` | `/iot/pontos/{id}/eventos` | Recebe `leitura_sensor`, `entrega_depositada` e `retirada`. A retirada exige o `codigo` de retirada (4 números que só quem pediu tem): com ele, o que estava no ponto conta como recebido e o pedido conclui |

O dispositivo se autentica com a **chave do ponto** no cabeçalho `X-Device-Key`. A API guarda só o hash SHA-256 da chave e compara em tempo constante. Todo payload é validado (Zod).

**Regras:**
- Protocolo inválido, de outro ponto ou de pedido que ninguém assumiu: "Protocolo não encontrado", e nada muda.
- Variação de peso abaixo de 0,5 kg: recusado ("Peso não detectado"). A entrega fica para confirmação manual.
- Temperatura acima de 30 °C, umidade acima de 75% ou estoque abaixo de 15% da capacidade: alerta no ponto e no painel.

## Como rodar o simulador

Com a API rodando (`docker compose up -d` na raiz):

```bash
cd area3-mvp-iot/iot/simulador
python simulador.py estado                              # estoque e limiares do ponto
python simulador.py entrega --protocolo 482913 --kg 8   # voluntária deposita 8 kg
python simulador.py telemetria --intervalo 5 --vezes 12 # leituras a cada 5 s
python simulador.py calor                               # leitura acima de 30 °C (alerta)
python simulador.py --ponto vila-nova estado            # outro ponto
```

O protocolo vem do app da voluntária, quando ela toca em "Quero ajudar". Variável `API_URL` (padrão `http://localhost:3333`).

**Limitação assumida:** o peso prova que *algo* foi depositado, não *o quê*. O responsável pelo ponto valida o conteúdo na retirada.

**Retirada com código:** o protocolo é compartilhado com quem ajuda (para entregar); para **retirar**, quem pediu digita também o código de retirada. Depois de 5 códigos errados, o pedido fica bloqueado por 1 hora. No simulador: `python simulador/simulador.py retirada --protocolo 123456 --codigo 0000`.
