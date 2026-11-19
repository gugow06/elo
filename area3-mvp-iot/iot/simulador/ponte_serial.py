"""
Ponte serial: lê as linhas JSON que o Arduino imprime no Serial e repassa para a API.
Usada apenas com hardware real (o Tinkercad não expõe porta serial).

  pip install pyserial
  python ponte_serial.py --porta COM3 --ponto jardim
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request

from simulador import API_URL, PONTOS


def main() -> None:
    import serial  # pyserial, opcional

    p = argparse.ArgumentParser()
    p.add_argument("--porta", required=True)
    p.add_argument("--ponto", default="jardim", choices=PONTOS.keys())
    args = p.parse_args()
    ponto_id, chave = PONTOS[args.ponto]

    with serial.Serial(args.porta, 9600, timeout=2) as s:
        print(f"Lendo {args.porta} e enviando para {API_URL} ...")
        while True:
            linha = s.readline().decode(errors="ignore").strip()
            if not linha.startswith("{"):
                continue
            try:
                corpo = json.loads(linha)
            except json.JSONDecodeError:
                continue
            req = urllib.request.Request(
                f"{API_URL}/iot/pontos/{ponto_id}/eventos",
                data=json.dumps(corpo).encode(),
                method="POST",
                headers={"content-type": "application/json", "x-device-key": chave},
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    print(corpo["tipo"], r.status, r.read().decode())
            except urllib.error.HTTPError as e:
                print(corpo["tipo"], e.code, e.read().decode())


if __name__ == "__main__":
    main()
