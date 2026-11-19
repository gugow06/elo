-- ELO · camada ouro: views e funções analíticas do módulo Gestão.
-- Recriadas a cada execução do pipeline, logo após a carga das tabelas fato/dimensão.
-- Nenhuma delas expõe dado pessoal: só contagens, médias e percentuais.

-- Indicadores principais (aba Visão geral), já respondendo aos filtros
CREATE FUNCTION ouro.indicadores(
  p_inicio date, p_fim date,
  p_municipio text DEFAULT NULL, p_bairro text DEFAULT NULL,
  p_canal text DEFAULT NULL, p_categoria text DEFAULT NULL, p_faixa text DEFAULT NULL)
RETURNS TABLE (
  total_pedidos bigint, verdes bigint, taxa_absorcao numeric, pct_escalado numeric,
  pct_fora_do_app numeric, horas_1a_resposta numeric, horas_1a_resposta_vermelha numeric,
  pct_com_desfecho numeric, cidadaos_atendidos bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    count(*),
    count(*) FILTER (WHERE f.faixa = 'verde'),
    round(count(*) FILTER (WHERE f.desfecho = 'resolvida_rede')::numeric
          / NULLIF(count(*) FILTER (WHERE f.faixa = 'verde'), 0), 4),
    round(avg(f.escalado::int), 4),
    round(avg((f.canal <> 'app')::int), 4),
    round(avg(f.horas_ate_primeira_resposta)::numeric, 1),
    round((avg(f.horas_ate_primeira_resposta) FILTER (WHERE f.faixa = 'vermelha'))::numeric, 1),
    round(avg((f.desfecho IS NOT NULL)::int), 4),
    count(DISTINCT f.cidadao_hash)
  FROM ouro.fato_solicitacao f
  JOIN ouro.dim_bairro b ON b.bairro_id = f.bairro_id
  WHERE f.data_abertura BETWEEN p_inicio AND p_fim
    AND (p_municipio IS NULL OR f.municipio_id::text = p_municipio)
    AND (p_bairro    IS NULL OR b.slug = p_bairro)
    AND (p_canal     IS NULL OR f.canal = p_canal)
    AND (p_categoria IS NULL OR f.categoria = p_categoria)
    AND (p_faixa     IS NULL OR f.faixa = p_faixa);
$$;

-- Série mensal com variação (função de janela LAG)
CREATE VIEW ouro.v_pedidos_mensal AS
SELECT municipio_id, mes, total,
       total - lag(total) OVER w AS variacao_abs,
       round((total - lag(total) OVER w)::numeric / NULLIF(lag(total) OVER w, 0), 4) AS variacao_pct
FROM (SELECT municipio_id, date_trunc('month', data_abertura)::date AS mes, count(*) AS total
      FROM ouro.fato_solicitacao GROUP BY 1, 2) m
WINDOW w AS (PARTITION BY municipio_id ORDER BY mes);

-- Pedidos por canal e semana (aba Equidade)
CREATE VIEW ouro.v_canal_semanal AS
SELECT municipio_id, date_trunc('week', data_abertura)::date AS semana, canal, count(*) AS total
FROM ouro.fato_solicitacao GROUP BY 1, 2, 3;

-- Densidade da rede: voluntários ativos por 200 habitantes (meta do PRD: >= 1)
CREATE VIEW ouro.v_densidade_rede AS
SELECT b.municipio_id, b.bairro, b.slug, b.populacao,
       count(v.voluntario_hash) FILTER (WHERE v.ativo_90d) AS voluntarios_ativos,
       round(count(v.voluntario_hash) FILTER (WHERE v.ativo_90d) * 200.0 / NULLIF(b.populacao, 0), 2) AS voluntarios_por_200_hab
FROM ouro.dim_bairro b
LEFT JOIN ouro.dim_voluntario v ON v.bairro_id = b.bairro_id
GROUP BY b.municipio_id, b.bairro, b.slug, b.populacao;

-- Território: pedidos, escalonamento e absorção por bairro (com ranking)
CREATE VIEW ouro.v_territorio AS
SELECT b.municipio_id, b.bairro, b.slug, b.populacao,
       count(f.*) AS pedidos,
       round(count(f.*) * 1000.0 / NULLIF(b.populacao, 0), 1) AS pedidos_por_mil_hab,
       round(avg(f.escalado::int), 4) AS pct_escalado,
       round(count(*) FILTER (WHERE f.desfecho = 'resolvida_rede')::numeric
             / NULLIF(count(*) FILTER (WHERE f.faixa = 'verde'), 0), 4) AS taxa_absorcao,
       d.voluntarios_ativos, d.voluntarios_por_200_hab,
       rank() OVER (PARTITION BY b.municipio_id ORDER BY avg(f.escalado::int) DESC) AS ranking_escalonamento
FROM ouro.dim_bairro b
LEFT JOIN ouro.fato_solicitacao f ON f.bairro_id = b.bairro_id
LEFT JOIN ouro.v_densidade_rede d ON d.slug = b.slug AND d.municipio_id = b.municipio_id
GROUP BY b.municipio_id, b.bairro, b.slug, b.populacao, d.voluntarios_ativos, d.voluntarios_por_200_hab;

-- Estoque atual: última leitura de cada ponto
CREATE VIEW ouro.v_estoque_atual AS
SELECT DISTINCT ON (l.ponto_coleta_id) l.ponto_coleta_id, l.peso_kg AS estoque_kg, l.temperatura_c, l.lido_em
FROM ouro.fato_leitura_sensor l ORDER BY l.ponto_coleta_id, l.lido_em DESC;

-- Dias até zerar o estoque (média móvel de 7 dias do consumo)
CREATE VIEW ouro.v_previsao_estoque AS
WITH consumo AS (
  SELECT ponto_coleta_id, dia,
         avg(kg_retirados) OVER (PARTITION BY ponto_coleta_id ORDER BY dia
                                 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS media_7d
  FROM ouro.fato_consumo_diario
)
SELECT p.ponto_coleta_id, p.municipio_id, p.ponto, p.capacidade_kg, e.estoque_kg, e.temperatura_c,
       round(c.media_7d::numeric, 2) AS consumo_medio_7d_kg,
       round((e.estoque_kg / NULLIF(c.media_7d, 0))::numeric, 1) AS dias_ate_zerar,
       round((100 * e.estoque_kg / NULLIF(p.capacidade_kg, 0))::numeric, 1) AS ocupacao_pct
FROM ouro.dim_ponto_coleta p
LEFT JOIN ouro.v_estoque_atual e USING (ponto_coleta_id)
LEFT JOIN LATERAL (SELECT media_7d FROM consumo c WHERE c.ponto_coleta_id = p.ponto_coleta_id
                   ORDER BY dia DESC LIMIT 1) c ON true;

-- Alertas de temperatura por ponto e dia (leituras acima de 30 °C)
CREATE VIEW ouro.v_alertas_temperatura AS
SELECT ponto_coleta_id, data, max(temperatura_c) AS temperatura_max_c
FROM ouro.fato_leitura_sensor WHERE temperatura_c > 30
GROUP BY 1, 2;

-- Entregas: sensor x manual e tempo entre assumir e depositar
CREATE VIEW ouro.v_entregas AS
SELECT p.municipio_id, e.origem, count(*) AS entregas,
       round(avg(e.horas_pareamento_ate_deposito)::numeric, 1) AS horas_ate_deposito
FROM ouro.fato_entrega e JOIN ouro.dim_ponto_coleta p USING (ponto_coleta_id)
GROUP BY 1, 2;

-- Qualidade da triagem em produção: origem da decisão e tempo
CREATE VIEW ouro.v_triagem AS
SELECT municipio_id, origem_triagem, faixa, count(*) AS total, round(avg(duracao_ms)::numeric, 1) AS ms_medio
FROM ouro.fato_solicitacao GROUP BY 1, 2, 3;

-- Papel somente leitura para o módulo Gestão: só enxerga a camada ouro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elo_leitura_ouro') THEN
    CREATE ROLE elo_leitura_ouro LOGIN PASSWORD 'elo_leitura_ouro_dev';
  END IF;
END $$;
GRANT USAGE ON SCHEMA ouro TO elo_leitura_ouro;
GRANT SELECT ON ALL TABLES IN SCHEMA ouro TO elo_leitura_ouro;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ouro TO elo_leitura_ouro;
REVOKE ALL ON SCHEMA public, bronze, prata FROM elo_leitura_ouro;
