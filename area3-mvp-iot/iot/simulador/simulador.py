"""
Simulador do Ponto de Coleta Inteligente do ELO.

Reproduz exatamente as mensagens que o dispositivo (Arduino/ESP32) envia à API:
  - leitura_sensor:      peso da balança (estoque) + temperatura + umidade, a cada N segundos
  - entrega_depositada:  voluntário digitou o protocolo e o peso subiu

Só usa a biblioteca padrão do Python (sem dependências).

Exemplos:
  python simulador.py estado
  python simulador.py entrega --protocolo 482913 --kg 8
  python simulador.py telemetria --intervalo 5 --vezes 12
  python simulador.py calor
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

API_URL = os.environ.get("API_URL", "http://localhost:3333").rstrip("/")

# Ids e chaves dos pontos do seed de demonstração (dados fictícios).
PONTOS = {
    "vila-nova": ("00000000-0000-4000-8000-000000000001", "demo-chave-ponto-vila-nova"),
    "jardim": ("00000000-0000-4000-8000-000000000002", "demo-chave-ponto-jardim"),
    "campo-centro": ("00000000-0000-4000-8000-000000000003", "demo-chave-ponto-campo-centro"),
}


class Dispositivo:
    def __init__(self, ponto: str):
        if ponto not in PONTOS:
            sys.exit(f"Ponto desconhecido: {ponto}. Opções: {', '.join(PONTOS)}")
        self.ponto_id, self.chave = PONTOS[ponto]
        self.nome = ponto

    def _req(self, metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
        dados = json.dumps(corpo).encode() if corpo is not None else None
        req = urllib.request.Request(
            f"{API_URL}/iot/pontos/{self.ponto_id}{caminho}",
            data=dados,
            method=metodo,
            headers={"content-type": "application/json", "x-device-key": self.chave},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def estado(self) -> dict:
        status, corpo = self._req("GET", "/estado")
        if status != 200:
            sys.exit(f"Erro {status}: {corpo}")
        return corpo

    @staticmethod
    def temperatura(base: float = 24.0) -> float:
        return round(base + random.uniform(-1.5, 1.5), 1)

    @staticmethod
    def umidade(base: float = 55.0) -> float:
        return round(base + random.uniform(-5, 5), 1)

    def leitura(self, peso_kg: float, temperatura_c: float, umidade_pct: float) -> dict:
        _, corpo = self._req("POST", "/eventos", {
            "tipo": "leitura_sensor",
            "peso_kg": round(peso_kg, 2),
            "temperatura_c": temperatura_c,
            "umidade_pct": umidade_pct,
        })
        return corpo

    def entrega(self, protocolo: str, kg: float) -> None:
        print(f"[teclado] protocolo digitado: {protocolo}")
        status, conf = self._req("GET", f"/protocolos/{protocolo}")
        lcd(*conf.get("lcd", ["Erro", str(status)]))
        if not conf.get("valido"):
            return

        peso_antes = self.estado()["estoque_kg"]
        print(f"[balança] peso antes: {peso_antes:.1f} kg")
        print("[balança] aguardando estabilizar...")
        time.sleep(1.5)
        peso_depois = peso_antes + kg
        print(f"[balança] peso depois: {peso_depois:.1f} kg (+{kg:.1f} kg)")

        status, corpo = self._req("POST", "/eventos", {
            "tipo": "entrega_depositada",
            "protocolo": protocolo,
            "delta_peso_kg": round(kg, 2),
            "peso_kg": round(peso_depois, 2),
            "temperatura_c": self.temperatura(),
        })
        linhas = corpo.get("lcd") or (corpo.get("message") or {}).get("lcd") or ["Erro", str(status)]
        lcd(*linhas)
        print(f"[api] HTTP {status}")


def lcd(l1: str, l2: str = "") -> None:
    borda = "+" + "-" * 16 + "+"
    print(borda)
    print(f"|{l1[:16]:<16}|")
    print(f"|{l2[:16]:<16}|")
    print(borda)


def main() -> None:
    p = argparse.ArgumentParser(description="Simulador do Ponto de Coleta Inteligente do ELO")
    p.add_argument("--ponto", default="jardim", choices=PONTOS.keys())
    sub = p.add_subparsers(dest="comando", required=True)

    sub.add_parser("estado", help="Mostra o estado do ponto (estoque e limiares)")

    e = sub.add_parser("entrega", help="Simula o depósito de uma doação")
    e.add_argument("--protocolo", required=True)
    e.add_argument("--kg", type=float, default=8.0)

    t = sub.add_parser("telemetria", help="Envia leituras periódicas dos sensores")
    t.add_argument("--intervalo", type=float, default=60)
    t.add_argument("--vezes", type=int, default=0, help="0 = infinito")
    t.add_argument("--consumo-kg", type=float, default=0.0, help="kg retirados por leitura (simula retiradas)")

    sub.add_parser("calor", help="Envia uma leitura com temperatura acima do limite")

    args = p.parse_args()
    d = Dispositivo(args.ponto)

    if args.comando == "estado":
        print(json.dumps(d.estado(), indent=2, ensure_ascii=False))
    elif args.comando == "entrega":
        d.entrega(args.protocolo, args.kg)
    elif args.comando == "calor":
        peso = d.estado()["estoque_kg"]
        print(d.leitura(peso, 33.5, 70.0))
    elif args.comando == "telemetria":
        peso = d.estado()["estoque_kg"]
        n = 0
        while args.vezes == 0 or n < args.vezes:
            peso = max(0.0, peso - args.consumo_kg)
            r = d.leitura(peso, d.temperatura(), d.umidade())
            print(f"[{time.strftime('%H:%M:%S')}] peso={peso:.1f} kg  alertas={r.get('alertas', [])}")
            n += 1
            time.sleep(args.intervalo)


if __name__ == "__main__":
    main()
