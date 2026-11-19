"""
Testes do pipeline de dados (T7 e T8 do plano de testes).

Unitários: checagens de qualidade e pseudonimização.
Integração (precisam de DATABASE_URL com o banco migrado): executam gerador + pipeline
e verificam a camada ouro e o isolamento do papel somente leitura.
"""
from __future__ import annotations

import os

import pandas as pd
import pytest
from sqlalchemy import create_engine, text

from pipeline import etl
from pipeline.conexao import motor

TEM_BANCO = bool(os.environ.get("DATABASE_URL"))


def tabelas_minimas(**sobrescrever) -> dict[str, pd.DataFrame]:
    agora = pd.Timestamp.now(tz="UTC")
    sol = pd.DataFrame({"id": ["s1"], "faixa": ["verde"], "criado_em": [agora], "fechado_em": [agora + pd.Timedelta(hours=2)],
                        "categoria": ["alimento"]})
    t = {"solicitacao": sol, "classificacao": pd.DataFrame({"solicitacao_id": ["s1"]})}
    t.update(sobrescrever)
    return t


def test_pseudonimo_e_estavel_e_nao_reversivel():
    a = etl.pseudonimo("11111111-1111-1111-1111-111111111111")
    assert a == etl.pseudonimo("11111111-1111-1111-1111-111111111111")
    assert len(a) == 16 and "1111" not in a
    assert etl.pseudonimo(None) is None


def test_qualidade_reprova_coluna_pessoal():
    t = tabelas_minimas(classificacao=pd.DataFrame({"solicitacao_id": ["s1"], "cpf": ["12345678909"]}))
    with pytest.raises(etl.ErroQualidade, match="coluna pessoal"):
        etl.checar_qualidade_prata(t)


def test_qualidade_reprova_texto_com_formato_de_cpf():
    t = tabelas_minimas(classificacao=pd.DataFrame({"solicitacao_id": ["s1"], "obs": ["meu cpf 123.456.789-09"]}))
    with pytest.raises(etl.ErroQualidade, match="formato de CPF"):
        etl.checar_qualidade_prata(t)


def test_qualidade_reprova_datas_incoerentes():
    agora = pd.Timestamp.now(tz="UTC")
    sol = pd.DataFrame({"id": ["s1"], "faixa": ["verde"], "criado_em": [agora], "fechado_em": [agora - pd.Timedelta(hours=1)]})
    with pytest.raises(etl.ErroQualidade, match="fechamento antes da abertura"):
        etl.checar_qualidade_prata(tabelas_minimas(solicitacao=sol))


def test_qualidade_aceita_dado_limpo():
    etl.checar_qualidade_prata(tabelas_minimas())


@pytest.mark.skipif(not TEM_BANCO, reason="precisa de DATABASE_URL")
class TestIntegracao:
    @pytest.fixture(scope="class", autouse=True)
    def rodar_pipeline(self):
        from pipeline.gerador import gerar
        gerar(forcar=True, total=1500)
        etl.executar()

    def test_t7_prata_e_ouro_sem_dado_pessoal(self):
        with motor().connect() as c:
            colunas = c.execute(text("""
                SELECT table_schema, table_name, column_name FROM information_schema.columns
                WHERE table_schema IN ('prata', 'ouro')
                  AND column_name IN ('cpf', 'nome', 'telefone', 'texto', 'cidadao_id', 'voluntario_id', 'data_nascimento')
                  AND table_name NOT IN ('bairro', 'municipio', 'ponto_coleta')""")).all()
        assert colunas == []

    def test_t8_taxa_de_absorcao_bate_com_o_calculo_direto(self):
        with motor().connect() as c:
            sql = c.execute(text("SELECT taxa_absorcao FROM ouro.indicadores(current_date - 365, current_date)")).scalar_one()
            esperado = c.execute(text("""
                SELECT round(count(*) FILTER (WHERE desfecho = 'resolvida_rede')::numeric
                             / count(*) FILTER (WHERE faixa = 'verde'), 4)
                FROM prata.solicitacao""")).scalar_one()
        assert float(sql) == pytest.approx(float(esperado))

    def test_filtro_por_canal_reduz_o_total(self):
        with motor().connect() as c:
            todos = c.execute(text("SELECT total_pedidos FROM ouro.indicadores(current_date - 365, current_date)")).scalar_one()
            whatsapp = c.execute(text("SELECT total_pedidos FROM ouro.indicadores(current_date - 365, current_date, p_canal => 'whatsapp')")).scalar_one()
        assert 0 < whatsapp < todos

    def test_papel_de_leitura_nao_acessa_dado_operacional(self):
        url = etl_url_leitura()
        eng = create_engine(url, future=True)
        with eng.connect() as c:
            assert c.execute(text("SELECT count(*) FROM ouro.fato_solicitacao")).scalar_one() > 0
        with eng.connect() as c, pytest.raises(Exception, match="permission denied"):
            c.execute(text("SELECT count(*) FROM public.usuario"))


def etl_url_leitura() -> str:
    from pipeline.conexao import url_banco
    base = url_banco()
    # troca usuário e senha pelos do papel somente leitura
    prefixo, resto = base.split("://", 1)
    return f"{prefixo}://elo_leitura_ouro:elo_leitura_ouro_dev@{resto.split('@', 1)[1]}"
