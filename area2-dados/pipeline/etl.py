"""
Pipeline de dados do ELO: public (operacional) → bronze → prata → ouro.

  bronze  cópia bruta do que existe no sistema, com data da extração (nada é alterado)
  prata   limpo, tipado e ANONIMIZADO: sem nome, CPF, telefone ou relato; ids pessoais viram hash
  ouro    modelo estrela + views e funções analíticas lidas pelo módulo Gestão do painel

Uso:
  python -m pipeline.etl              # executa uma vez
  python -m pipeline.etl --loop 900   # executa a cada 15 minutos (serviço do Docker Compose)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

from .conexao import motor

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"
SAL = os.environ.get("PIPELINE_SAL_HASH", "elo-pipeline-sal-demo")

TABELAS_BRONZE = {
    "solicitacao": "SELECT * FROM public.solicitacao",
    "classificacao": "SELECT * FROM public.classificacao",
    "oferta": "SELECT * FROM public.oferta",
    "entrega": "SELECT * FROM public.entrega",
    "evento_iot": "SELECT id, ponto_coleta_id, tipo, payload::text AS payload, recebido_em FROM public.evento_iot",
    "usuario": "SELECT * FROM public.usuario",
    "bairro": "SELECT * FROM public.bairro",
    "municipio": "SELECT * FROM public.municipio",
    "ponto_coleta": "SELECT id, municipio_id, bairro_id, nome, capacidade_kg, estoque_kg FROM public.ponto_coleta",
}

CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")


class ErroQualidade(Exception):
    pass


def pseudonimo(valor) -> str | None:
    """Hash irreversível (com sal) para manter contagens distintas sem expor a identidade."""
    if pd.isna(valor):
        return None
    return hashlib.sha256(f"{SAL}:{valor}".encode()).hexdigest()[:16]


def log(etapa: str, msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {etapa:<7} {msg}", flush=True)


# ---------------------------------------------------------------- bronze

def bronze(eng: Engine) -> dict[str, pd.DataFrame]:
    extraido_em = datetime.now(timezone.utc)
    dados: dict[str, pd.DataFrame] = {}
    with eng.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS bronze"))
        for nome, sql in TABELAS_BRONZE.items():
            df = pd.read_sql(text(sql), conn)
            df["_extraido_em"] = extraido_em
            df.to_sql(nome, conn, schema="bronze", if_exists="replace", index=False)
            dados[nome] = df
            log("bronze", f"{nome}: {len(df)} linhas")
    return dados


# ---------------------------------------------------------------- prata

def horas_entre(fim: pd.Series, inicio: pd.Series) -> pd.Series:
    return ((fim - inicio).dt.total_seconds() / 3600).round(2)


def prata(eng: Engine, b: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    sol = b["solicitacao"].copy()
    for col in ("criado_em", "primeira_resposta_em", "fechado_em"):
        sol[col] = pd.to_datetime(sol[col], utc=True)
    sol = sol.drop_duplicates(subset=["id"])
    sol["categoria"] = sol["categoria"].str.strip().str.lower()
    sol["cidadao_hash"] = sol["cidadao_id"].map(pseudonimo)
    sol["horas_ate_primeira_resposta"] = horas_entre(sol["primeira_resposta_em"], sol["criado_em"])
    sol["horas_ate_fechamento"] = horas_entre(sol["fechado_em"], sol["criado_em"])
    # Anonimização: fora da prata ficam cidadao_id, titulo livre e qualquer texto do relato
    prata_sol = sol[["id", "municipio_id", "bairro_id", "ponto_coleta_id", "cidadao_hash", "canal", "faixa", "categoria",
                     "status", "escalado", "desfecho", "criado_em", "primeira_resposta_em", "fechado_em",
                     "horas_ate_primeira_resposta", "horas_ate_fechamento"]]

    cls = b["classificacao"].sort_values("criado_em").drop_duplicates("solicitacao_id", keep="first")
    prata_cls = cls[["solicitacao_id", "origem", "confianca", "duracao_ms"]].rename(columns={"origem": "origem_triagem"})

    of = b["oferta"].copy()
    of["voluntario_hash"] = of["voluntario_id"].map(pseudonimo)
    prata_of = of[["solicitacao_id", "voluntario_hash", "criado_em"]].rename(columns={"criado_em": "assumido_em"})

    ent = b["entrega"][["solicitacao_id", "ponto_coleta_id", "origem", "delta_peso_kg", "criado_em"]].rename(
        columns={"criado_em": "depositado_em"})

    ev = b["evento_iot"]
    leituras = ev[ev["tipo"] == "leitura_sensor"].copy()
    payload = leituras["payload"].map(json.loads)
    leituras["peso_kg"] = payload.map(lambda p: p.get("peso_kg"))
    leituras["temperatura_c"] = payload.map(lambda p: p.get("temperatura_c"))
    leituras["umidade_pct"] = payload.map(lambda p: p.get("umidade_pct"))
    leituras["kg_saida"] = payload.map(lambda p: p.get("kg_saida", 0.0))
    prata_leit = leituras[["ponto_coleta_id", "recebido_em", "peso_kg", "temperatura_c", "umidade_pct", "kg_saida"]]

    usu = b["usuario"]
    vol = usu[usu["perfil"] == "voluntario"].copy()
    vol["voluntario_hash"] = vol["id"].map(pseudonimo)
    prata_vol = vol[["voluntario_hash", "municipio_id", "bairro_id", "criado_em"]]

    tabelas = {"solicitacao": prata_sol, "classificacao": prata_cls, "oferta": prata_of, "entrega": ent,
               "leitura_sensor": prata_leit, "voluntario": prata_vol,
               "bairro": b["bairro"].drop(columns=["_extraido_em"]),
               "municipio": b["municipio"].drop(columns=["_extraido_em"]),
               "ponto_coleta": b["ponto_coleta"].drop(columns=["_extraido_em"])}

    checar_qualidade_prata(tabelas)
    with eng.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS prata"))
        for nome, df in tabelas.items():
            df.to_sql(nome, conn, schema="prata", if_exists="replace", index=False)
            log("prata", f"{nome}: {len(df)} linhas")
    return tabelas


def checar_qualidade_prata(t: dict[str, pd.DataFrame]) -> None:
    """Checagens que REPROVAM o pipeline (não seguem para a camada ouro)."""
    proibidas = {"cpf", "nome", "telefone", "texto", "relato", "cidadao_id", "voluntario_id", "data_nascimento"}
    for nome, df in t.items():
        if nome in ("bairro", "municipio", "ponto_coleta"):
            continue
        vazadas = proibidas & set(df.columns)
        if vazadas:
            raise ErroQualidade(f"prata.{nome} contém coluna pessoal: {sorted(vazadas)}")
        for col in df.select_dtypes(include="object").columns:
            if df[col].astype(str).str.contains(CPF_RE).any():
                raise ErroQualidade(f"prata.{nome}.{col} contém algo com formato de CPF")
    s = t["solicitacao"]
    if s["faixa"].isna().any():
        raise ErroQualidade("solicitação sem faixa de risco")
    invertidas = s["fechado_em"].notna() & (s["fechado_em"] < s["criado_em"])
    if invertidas.any():
        raise ErroQualidade(f"{int(invertidas.sum())} solicitações com fechamento antes da abertura")
    log("prata", "qualidade OK: sem dado pessoal, faixas preenchidas, datas coerentes")


# ---------------------------------------------------------------- ouro

def ouro(eng: Engine, p: dict[str, pd.DataFrame]) -> None:
    sol = p["solicitacao"].merge(p["classificacao"], how="left", left_on="id", right_on="solicitacao_id").drop(columns=["solicitacao_id"])
    sol = sol.merge(p["oferta"], how="left", left_on="id", right_on="solicitacao_id").drop(columns=["solicitacao_id"])
    sol = sol.merge(p["entrega"][["solicitacao_id", "origem", "depositado_em"]].rename(columns={"origem": "origem_entrega"}),
                    how="left", left_on="id", right_on="solicitacao_id").drop(columns=["solicitacao_id"])
    sol["data_abertura"] = sol["criado_em"].dt.date
    fato_sol = sol.rename(columns={"id": "solicitacao_id"})[[
        "solicitacao_id", "municipio_id", "bairro_id", "ponto_coleta_id", "data_abertura", "canal", "faixa", "categoria",
        "status", "desfecho", "escalado", "origem_triagem", "confianca", "duracao_ms", "cidadao_hash", "voluntario_hash",
        "horas_ate_primeira_resposta", "horas_ate_fechamento", "origem_entrega", "criado_em", "fechado_em"]]

    ent = p["entrega"].merge(p["oferta"], how="left", on="solicitacao_id")
    ent["horas_pareamento_ate_deposito"] = horas_entre(pd.to_datetime(ent["depositado_em"], utc=True), pd.to_datetime(ent["assumido_em"], utc=True))
    ent["data"] = pd.to_datetime(ent["depositado_em"], utc=True).dt.date
    fato_ent = ent[["solicitacao_id", "ponto_coleta_id", "origem", "delta_peso_kg", "data", "horas_pareamento_ate_deposito"]]

    leit = p["leitura_sensor"].copy()
    leit["recebido_em"] = pd.to_datetime(leit["recebido_em"], utc=True)
    leit["data"] = leit["recebido_em"].dt.date
    fato_leit = leit.rename(columns={"recebido_em": "lido_em"})
    consumo = leit.groupby(["ponto_coleta_id", "data"], as_index=False)["kg_saida"].sum().rename(columns={"data": "dia", "kg_saida": "kg_retirados"})

    datas = pd.date_range(fato_sol["data_abertura"].min(), pd.Timestamp.now().normalize(), freq="D")
    dim_tempo = pd.DataFrame({"data": datas.date, "ano": datas.year, "mes": datas.month, "dia": datas.day,
                              "semana_iso": datas.isocalendar().week.values, "dia_semana": datas.day_of_week,
                              "mes_inicio": datas.to_period("M").to_timestamp().date})

    bai = p["bairro"].merge(p["municipio"][["id", "nome", "uf"]].rename(columns={"id": "municipio_id", "nome": "municipio"}), on="municipio_id")
    dim_bairro = bai.rename(columns={"id": "bairro_id", "nome": "bairro"})[["bairro_id", "municipio_id", "municipio", "uf", "bairro", "slug", "populacao"]]
    dim_municipio = p["municipio"].rename(columns={"id": "municipio_id", "nome": "municipio"})[["municipio_id", "municipio", "uf", "populacao"]]
    dim_ponto = p["ponto_coleta"].rename(columns={"id": "ponto_coleta_id", "nome": "ponto"})[["ponto_coleta_id", "municipio_id", "bairro_id", "ponto", "capacidade_kg", "estoque_kg"]]

    vol = p["voluntario"].copy()
    ativos = set(p["oferta"].loc[pd.to_datetime(p["oferta"]["assumido_em"], utc=True) >= pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=90), "voluntario_hash"])
    vol["ativo_90d"] = vol["voluntario_hash"].isin(ativos)
    dim_vol = vol.rename(columns={"criado_em": "entrou_em"})

    tabelas = {"fato_solicitacao": fato_sol, "fato_entrega": fato_ent, "fato_leitura_sensor": fato_leit,
               "fato_consumo_diario": consumo, "dim_tempo": dim_tempo, "dim_bairro": dim_bairro,
               "dim_municipio": dim_municipio, "dim_ponto_coleta": dim_ponto, "dim_voluntario": dim_vol}

    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS ouro CASCADE"))
        conn.execute(text("CREATE SCHEMA ouro"))
        for nome, df in tabelas.items():
            df.to_sql(nome, conn, schema="ouro", index=False)
            log("ouro", f"{nome}: {len(df)} linhas")
        conn.execute(text((SQL_DIR / "ouro_funcoes.sql").read_text(encoding="utf-8")))
        log("ouro", "views, funções analíticas e permissões criadas")


def executar() -> None:
    inicio = time.perf_counter()
    eng = motor()
    b = bronze(eng)
    p = prata(eng, b)
    ouro(eng, p)
    log("fim", f"pipeline concluído em {time.perf_counter() - inicio:.1f} s")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, default=0, help="segundos entre execuções (0 = uma vez)")
    ap.add_argument("--gerar", action="store_true", help="gera o histórico fictício antes, se ainda não existir")
    args = ap.parse_args()
    if args.gerar:
        from .gerador import gerar
        log("gerador", str(gerar()))
    while True:
        try:
            executar()
        except ErroQualidade as e:
            log("ERRO", f"qualidade reprovada: {e}")
            if not args.loop:
                raise SystemExit(1)
        if not args.loop:
            break
        time.sleep(args.loop)


if __name__ == "__main__":
    main()
