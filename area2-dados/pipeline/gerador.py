"""
Gerador de dados FICTÍCIOS do ELO.

Simula 6 meses de operação nos 2 municípios do seed: cidadãos, voluntários, pedidos
com triagem, ofertas, entregas nos pontos de coleta e telemetria dos sensores.
Os dados são escritos no banco OPERACIONAL (schema public), como se tivessem sido
gerados pelo próprio sistema. O pipeline depois extrai, limpa e agrega.

As distribuições são propositalmente desiguais para o dashboard ter uma história:
- o bairro Jardim São Pedro tem poucos voluntários e muitos pedidos escalados ao CRAS;
- pedidos de alimento aumentam no fim do mês;
- a maioria dos pedidos ainda chega pelo app (meta de equidade: >= 30% fora do app).

Uso:
  python -m pipeline.gerador            # gera se ainda não houver histórico
  python -m pipeline.gerador --forcar   # apaga o histórico gerado e gera de novo
"""
from __future__ import annotations

import argparse
import hashlib
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from faker import Faker
from sqlalchemy import text

from .conexao import motor

SEMENTE = 2026
DIAS = 180
MARCADOR = "gerador-elo"  # gravado em evento_auditoria para identificar o histórico gerado

# Perfil de cada bairro: volume relativo, voluntários e chance de a rede absorver um pedido verde.
PERFIL_BAIRRO = {
    ("São Bento do Vale", "vila-nova"): dict(peso=1.0, voluntarios=26, absorcao=0.78, whatsapp=0.30),
    ("São Bento do Vale", "jardim"): dict(peso=1.1, voluntarios=31, absorcao=0.82, whatsapp=0.25),
    ("São Bento do Vale", "centro"): dict(peso=0.8, voluntarios=18, absorcao=0.70, whatsapp=0.22),
    ("São Bento do Vale", "jardim-sao-pedro"): dict(peso=1.3, voluntarios=4, absorcao=0.34, whatsapp=0.42),
    ("Campo Alegre do Norte", "centro"): dict(peso=0.9, voluntarios=12, absorcao=0.62, whatsapp=0.30),
    ("Campo Alegre do Norte", "vila-esperanca"): dict(peso=0.7, voluntarios=6, absorcao=0.48, whatsapp=0.35),
}

RELATOS = {
    "alimento": ["Preciso de uma cesta básica, o dinheiro não deu esse mês", "Estou desempregada e a comida está acabando",
                 "Preciso de leite e fralda para o bebê", "Queria ajuda com arroz, feijão e óleo"],
    "roupa": ["Preciso de roupas de frio para as crianças", "Precisamos de cobertores", "Meu filho precisa de tênis"],
    "movel": ["Preciso de um colchão, estamos dormindo no chão", "Minha geladeira queimou", "Precisamos de uma cama"],
    "material_escolar": ["Meus filhos precisam de cadernos e lápis", "Preciso de mochila para minha filha"],
    "apoio_idoso": ["Sou idosa e moro sozinha, preciso de companhia", "Preciso de ajuda para carregar o botijão"],
    "transporte": ["Preciso de carona para levar meu pai ao hospital", "Tenho consulta e não tenho como ir"],
    "outro": ["Relato encaminhado à equipe técnica"],
}


@dataclass
class Bairro:
    id: str
    municipio_id: str
    municipio: str
    slug: str
    pontos: list[str]


def escolher(rng: random.Random, opcoes: dict[str, float]) -> str:
    return rng.choices(list(opcoes), weights=list(opcoes.values()))[0]


def cpf_ficticio(rng: random.Random) -> str:
    base = [rng.randint(0, 9) for _ in range(9)]
    for peso_ini in (10, 11):
        soma = sum(d * (peso_ini - i) for i, d in enumerate(base))
        base.append(0 if (soma * 10) % 11 == 10 else (soma * 10) % 11)
    return "".join(map(str, base))


def ja_gerado(conn) -> bool:
    return bool(conn.execute(text("SELECT 1 FROM evento_auditoria WHERE acao = :m LIMIT 1"), {"m": MARCADOR}).first())


def apagar_gerado(conn) -> None:
    """Remove só o histórico gerado (identificado pelos usuários criados pelo gerador)."""
    conn.execute(text("""
        CREATE TEMP TABLE _ger ON COMMIT DROP AS
        SELECT id FROM usuario WHERE telefone LIKE '+5500%'"""))
    conn.execute(text("CREATE TEMP TABLE _sol ON COMMIT DROP AS SELECT id FROM solicitacao WHERE cidadao_id IN (SELECT id FROM _ger)"))
    for tabela in ("notificacao", "entrega", "oferta", "classificacao", "relato"):
        conn.execute(text(f"DELETE FROM {tabela} WHERE solicitacao_id IN (SELECT id FROM _sol)"))
    conn.execute(text("DELETE FROM notificacao WHERE usuario_id IN (SELECT id FROM _ger)"))
    conn.execute(text("DELETE FROM solicitacao WHERE id IN (SELECT id FROM _sol)"))
    conn.execute(text("DELETE FROM usuario WHERE id IN (SELECT id FROM _ger)"))
    conn.execute(text("DELETE FROM evento_iot WHERE payload ? 'gerado'"))
    conn.execute(text("DELETE FROM evento_auditoria WHERE acao = :m"), {"m": MARCADOR})


def carregar_bairros(conn) -> list[Bairro]:
    linhas = conn.execute(text("""
        SELECT b.id, b.municipio_id, m.nome AS municipio, b.slug,
               coalesce(array_agg(p.id) FILTER (WHERE p.id IS NOT NULL), '{}') AS pontos
        FROM bairro b JOIN municipio m ON m.id = b.municipio_id
        LEFT JOIN ponto_coleta p ON p.bairro_id = b.id
        GROUP BY b.id, b.municipio_id, m.nome, b.slug""")).mappings().all()
    return [Bairro(str(l["id"]), str(l["municipio_id"]), l["municipio"], l["slug"], [str(p) for p in l["pontos"]]) for l in linhas]


def gerar(forcar: bool = False, total: int = 5000) -> dict:
    rng = random.Random(SEMENTE)
    fake = Faker("pt_BR")
    Faker.seed(SEMENTE)
    agora = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    inicio = agora - timedelta(days=DIAS)

    with motor().begin() as conn:
        if ja_gerado(conn):
            if not forcar:
                return {"gerado": False, "motivo": "histórico já existe (use --forcar)"}
            apagar_gerado(conn)

        bairros = [b for b in carregar_bairros(conn) if (b.municipio, b.slug) in PERFIL_BAIRRO]
        pontos_mun: dict[str, list[str]] = {}
        for b in bairros:
            pontos_mun.setdefault(b.municipio_id, []).extend(b.pontos)

        usuarios, sols, relatos, classifs, ofertas, entregas, eventos = [], [], [], [], [], [], []
        seq_tel = 0

        def novo_usuario(b: Bairro, perfil: str, criado: datetime) -> str:
            nonlocal seq_tel
            seq_tel += 1
            uid = str(uuid.uuid4())
            usuarios.append(dict(id=uid, municipio_id=b.municipio_id, bairro_id=b.id, perfil=perfil, nome=fake.name(),
                                 cpf=cpf_ficticio(rng), telefone=f"+5500{seq_tel:09d}",
                                 data_nascimento=fake.date_of_birth(minimum_age=18, maximum_age=88), criado_em=criado))
            return uid

        voluntarios: dict[str, list[str]] = {}
        for b in bairros:
            perfil = PERFIL_BAIRRO[(b.municipio, b.slug)]
            voluntarios[b.id] = [novo_usuario(b, "voluntario", inicio + timedelta(days=rng.randint(0, DIAS - 1)))
                                 for _ in range(perfil["voluntarios"])]

        pesos = [PERFIL_BAIRRO[(b.municipio, b.slug)]["peso"] for b in bairros]
        protocolos: dict[str, set[str]] = {}
        for _ in range(total):
            b = rng.choices(bairros, weights=pesos)[0]
            perfil = PERFIL_BAIRRO[(b.municipio, b.slug)]
            dia = rng.randint(0, DIAS - 2)
            criado = inicio + timedelta(days=dia, hours=rng.randint(7, 21), minutes=rng.randint(0, 59))
            fim_de_mes = criado.day >= 20

            faixa = escolher(rng, {"verde": 0.70, "amarela": 0.18, "vermelha": 0.12})
            if faixa == "verde":
                categoria = escolher(rng, {"alimento": 0.55 if fim_de_mes else 0.38, "roupa": 0.2, "movel": 0.17, "material_escolar": 0.18})
            elif faixa == "amarela":
                categoria = escolher(rng, {"apoio_idoso": 0.6, "transporte": 0.4})
            else:
                categoria = "outro"
            canal = escolher(rng, {"app": 1 - perfil["whatsapp"] - 0.15, "whatsapp": perfil["whatsapp"], "balcao": 0.12, "web_leve": 0.03})

            cidadao = novo_usuario(b, "cidadao", criado - timedelta(days=rng.randint(0, 30)))
            sid = str(uuid.uuid4())
            p = str(rng.randint(100000, 999999))
            while p in protocolos.setdefault(b.municipio_id, set()):
                p = str(rng.randint(100000, 999999))
            protocolos[b.municipio_id].add(p)

            ponto = (b.pontos or pontos_mun.get(b.municipio_id) or [None])[0] if faixa == "verde" else None
            escalado, desfecho, primeira, fechado, status = False, None, None, None, "concluida"

            if faixa == "verde":
                absorvido = rng.random() < perfil["absorcao"]
                if absorvido and voluntarios[b.id]:
                    assumido = criado + timedelta(hours=rng.uniform(0.5, 30))
                    depositado = assumido + timedelta(hours=rng.uniform(2, 48))
                    fechado = depositado + timedelta(hours=rng.uniform(2, 72))
                    primeira, desfecho = assumido, "resolvida_rede"
                    ofertas.append(dict(id=str(uuid.uuid4()), solicitacao_id=sid, voluntario_id=rng.choice(voluntarios[b.id]), criado_em=assumido))
                    kg = round(rng.uniform(3, 15) if categoria == "alimento" else rng.uniform(1, 25), 2)
                    entregas.append(dict(id=str(uuid.uuid4()), solicitacao_id=sid, ponto_coleta_id=ponto,
                                         origem="sensor" if rng.random() < 0.72 else "manual", delta_peso_kg=kg, criado_em=depositado))
                else:
                    escalado = True
                    primeira = criado + timedelta(hours=48 + rng.uniform(1, 24))
                    fechado = primeira + timedelta(hours=rng.uniform(4, 96))
                    desfecho = "resolvida_cras" if rng.random() < 0.85 else "nao_atendida"
            else:
                horas = rng.uniform(0.2, 4) if faixa == "vermelha" else rng.uniform(4, 48)
                primeira = criado + timedelta(hours=horas)
                fechado = primeira + timedelta(hours=rng.uniform(12, 240))
                desfecho = escolher(rng, {"resolvida_cras": 0.6, "encaminhada": 0.35, "nao_atendida": 0.05})

            sols.append(dict(id=sid, municipio_id=b.municipio_id, protocolo=p, cidadao_id=cidadao, bairro_id=b.id,
                             ponto_coleta_id=ponto, canal=canal, faixa=faixa, categoria=categoria, status=status,
                             titulo=f"Pedido de {categoria.replace('_', ' ')}", escalado=escalado, desfecho=desfecho,
                             criado_em=criado, primeira_resposta_em=primeira, fechado_em=fechado))
            relatos.append(dict(solicitacao_id=sid, texto=rng.choice(RELATOS[categoria])))
            origem = "regra" if faixa == "vermelha" and rng.random() < 0.7 else "offline"
            classifs.append(dict(solicitacao_id=sid, faixa=faixa, categoria=categoria, confianca=1 if origem == "regra" else round(rng.uniform(0.76, 0.95), 2),
                                 origem=origem, justificativa="Histórico gerado", duracao_ms=rng.randint(1, 5), criado_em=criado))

        # Telemetria diária dos pontos: estoque sobe com entregas e desce com retiradas
        entregas_por_ponto_dia: dict[tuple[str, str], float] = {}
        for e in entregas:
            chave = (e["ponto_coleta_id"], e["criado_em"].date().isoformat())
            entregas_por_ponto_dia[chave] = entregas_por_ponto_dia.get(chave, 0) + e["delta_peso_kg"]
        capacidades = dict(conn.execute(text("SELECT id::text, capacidade_kg::float FROM ponto_coleta")).all())
        for ponto_id, cap in capacidades.items():
            estoque = cap * 0.4
            for d in range(DIAS):
                dia = inicio + timedelta(days=d, hours=12)
                entrou = entregas_por_ponto_dia.get((ponto_id, dia.date().isoformat()), 0)
                saiu = min(estoque + entrou, entrou * rng.uniform(0.7, 1.15) + rng.uniform(0, 3))
                estoque = max(0.0, min(cap, estoque + entrou - saiu))
                onda_calor = 140 <= d <= 146
                temp = round(rng.uniform(31, 35) if onda_calor else rng.uniform(19, 29), 1)
                eventos.append(dict(ponto_coleta_id=ponto_id, tipo="leitura_sensor", recebido_em=dia,
                                    payload=f'{{"tipo":"leitura_sensor","peso_kg":{estoque:.2f},"temperatura_c":{temp},'
                                            f'"umidade_pct":{rng.uniform(40, 80):.1f},"kg_entrada":{entrou:.2f},"kg_saida":{saiu:.2f},"gerado":true}}'))

        conn.execute(text("""INSERT INTO usuario (id, municipio_id, bairro_id, perfil, nome, cpf, telefone, data_nascimento, criado_em)
                             VALUES (:id, :municipio_id, :bairro_id, CAST(:perfil AS perfil_usuario), :nome, :cpf, :telefone, :data_nascimento, :criado_em)"""), usuarios)
        conn.execute(text("""INSERT INTO solicitacao (id, municipio_id, protocolo, cidadao_id, bairro_id, ponto_coleta_id, canal, faixa, categoria,
                                 status, titulo, escalado, desfecho, criado_em, primeira_resposta_em, fechado_em)
                             VALUES (:id, :municipio_id, :protocolo, :cidadao_id, :bairro_id, :ponto_coleta_id, CAST(:canal AS canal_origem),
                                 CAST(:faixa AS faixa_risco), CAST(:categoria AS categoria_pedido), CAST(:status AS status_pedido), :titulo,
                                 :escalado, CAST(:desfecho AS desfecho_pedido), :criado_em, :primeira_resposta_em, :fechado_em)
                             ON CONFLICT (municipio_id, protocolo) DO NOTHING"""), sols)
        conn.execute(text("INSERT INTO relato (solicitacao_id, texto) VALUES (:solicitacao_id, :texto)"), relatos)
        conn.execute(text("""INSERT INTO classificacao (solicitacao_id, faixa, categoria, confianca, origem, justificativa, duracao_ms, criado_em)
                             VALUES (:solicitacao_id, CAST(:faixa AS faixa_risco), CAST(:categoria AS categoria_pedido), :confianca,
                                 CAST(:origem AS origem_classif), :justificativa, :duracao_ms, :criado_em)"""), classifs)
        conn.execute(text("INSERT INTO oferta (id, solicitacao_id, voluntario_id, ativa, criado_em) VALUES (:id, :solicitacao_id, :voluntario_id, true, :criado_em)"), ofertas)
        conn.execute(text("""INSERT INTO entrega (id, solicitacao_id, ponto_coleta_id, origem, delta_peso_kg, criado_em)
                             VALUES (:id, :solicitacao_id, :ponto_coleta_id, :origem, :delta_peso_kg, :criado_em)"""), entregas)
        conn.execute(text("INSERT INTO evento_iot (ponto_coleta_id, tipo, payload, recebido_em) VALUES (:ponto_coleta_id, :tipo, CAST(:payload AS jsonb), :recebido_em)"), eventos)
        conn.execute(text("INSERT INTO evento_auditoria (acao, entidade, detalhe) VALUES (:m, 'historico', CAST(:d AS jsonb))"),
                     {"m": MARCADOR, "d": f'{{"semente":{SEMENTE},"dias":{DIAS},"solicitacoes":{len(sols)}}}'})

    return {"gerado": True, "usuarios": len(usuarios), "solicitacoes": len(sols), "ofertas": len(ofertas),
            "entregas": len(entregas), "leituras_iot": len(eventos)}


def main() -> None:
    ap = argparse.ArgumentParser(description="Gera histórico fictício de 6 meses do ELO")
    ap.add_argument("--forcar", action="store_true")
    ap.add_argument("--total", type=int, default=5000)
    args = ap.parse_args()
    print(gerar(forcar=args.forcar, total=args.total))


if __name__ == "__main__":
    main()
