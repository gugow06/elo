# ELO — Plano de Implementação

| Campo | Valor |
| --- | --- |
| Produto | **ELO**: plataforma municipal de mobilização solidária e triagem da demanda socioassistencial |
| Base | PRD v0.1 (2026-11-05), com o nome **ELO** mantido (o PRD usa "Mutirá") |
| Guia visual | Mockup de 4 telas (login, início, mapa da rede, pedido de ajuda) + `images/elo-logo*.svg` |
| Contexto | **FIAP Global Solution 2026/2 — CitizenTech** (4º ano Eng. de Software, turma 4ESOA) |
| Entrega | **19/11/2026 até 23h55, sem prorrogação** |
| Atualizado em | 2026-11-18 |

O documento tem duas partes:

- **Parte A: entrega da Global Solution.** O que construir até 19/11, como cada peça pontua na rubrica, quem faz o quê e em que ordem.
- **Parte B: visão de produto.** A arquitetura completa do ELO como plataforma municipal. Ela serve de "e depois?" no pitch e de guia se o projeto continuar.

---

# PARTE A — Entrega da Global Solution (19/11)

## A1. Regras do desafio que moldam o plano

| Regra | Consequência no plano |
| --- | --- |
| 4 áreas (IA, Big Data, MVP+IoT, DevOps) + pitch = 20 pts | Cada área tem uma seção própria (A4–A7) e uma pasta própria no .zip |
| "As 4 áreas resolvem o mesmo problema do cidadão. Integrar é diferencial" | Tudo gira em torno do mesmo laço: pedido → triagem → entrega no ponto de coleta → devolutiva → dashboard |
| "Tecnologias fora do conteúdo (até a fase 7) não pontuam" | **Pendência P1 (A11)**: confirmar cada tecnologia da tabela A3 contra o conteúdo do curso |
| "Área que não roda seguindo o README não pontua" | README por área com comandos copiáveis; teste final a partir de um clone limpo (A9) |
| Pitch ≤ 3 min mostrando o protótipo funcionando, link público | Roteiro em A8; gravar com o sistema real, nada de slides |
| Uso de IA generativa deve ser declarado | Seção "Uso de IA generativa" no README; cada integrante precisa entender e saber explicar o código |
| Só dados fictícios | Nenhum dado real de cidadão, nem em teste com colegas |

## A2. Escopo do protótipo

**O laço que precisa funcionar de ponta a ponta (o "fluxo funcional" da rubrica):**

1. A Ana abre o app e pede ajuda: "Perdi o emprego, preciso de cesta básica para meus dois filhos".
2. A **triagem** classifica como **verde / alimento** e sugere o Ponto de Coleta Vila Nova. A Ana recebe o protocolo de 6 dígitos.
3. O pedido aparece no **mural do bairro**, sem endereço e sem nome completo.
4. A Cláudia (voluntária) toca em "Quero ajudar".
5. No ponto de coleta, ela digita o protocolo no teclado e deposita a cesta. A **balança** confirma.
6. A Ana recebe "Sua doação está disponível para retirada"; a Cláudia recebe **"Sua ajuda chegou"**.
7. O **dashboard de gestão** mostra a entrega, o estoque do ponto e os indicadores do bairro.

**Contraprova (mostrada no pitch):** um relato com indício de violência vai direto para a **fila do técnico com alerta** e **nunca** aparece no mural.

### Prioridades

| Prioridade | Entra | Por quê |
| --- | --- | --- |
| **P0: sem isto não pontua** | API + banco · triagem (regras + LLM) com avaliação · 4+ telas do app · simulação dos 2 sensores + circuito Tinkercad · pipeline bronze/prata/ouro · dashboard com 3+ indicadores e filtros · Docker Compose · CI com testes · 5+ casos de teste · diagrama de arquitetura · PDF · .txt · vídeo | Itens explícitos da rubrica |
| **P1: diferenciais** | Sensores alimentando o dashboard ao vivo · aba "Qualidade da IA" no dashboard · fila do técnico com alerta vermelho · ELO Design System aplicado · roteiro de TalkBack | "Áreas integradas" e "IA medida" pesam na escolha do vencedor |
| **P2: só se sobrar tempo** | Pedido por áudio com transcrição · mapa (a lista basta) · build iOS · isolamento entre 2 municípios demonstrado | Bonitos, mas não pontuam diretamente |
| **Fora desta entrega** | WhatsApp, web leve, gov.br, OTP real, URA, chat interno, credenciamento | Ficam na Parte B como roadmap |

## A3. Arquitetura do protótipo

```
                          ┌──────────────────────── Docker Compose ────────────────────────┐
 App Flutter (Android) ──▶│  API (NestJS)                                                   │
   cidadã / voluntária    │   ├─ /solicitacoes ──▶ Triagem: regras ──▶ LLM ──▶ fail-closed  │
                          │   ├─ /mural  /ofertas  /entregas                                │
 Painel web (Next.js) ───▶│   ├─ /iot/pontos/{id}/eventos ◀── Simulador IoT (Python)       │◀── Circuito Tinkercad
   técnico / gestão       │   ├─ /gestao/* (lê só o schema ouro)                            │     (evidência visual)
                          │   └─ WebSocket: alerta vermelho, estoque ao vivo                │
                          │                                                                 │
                          │  PostgreSQL: public │ bronze │ prata │ ouro                     │
                          │                ▲                                                │
                          │  Pipeline (Python, a cada 15 min): public → bronze → prata → ouro
                          └─────────────────────────────────────────────────────────────────┘
 GitHub Actions: lint → testes (API, triagem, pipeline, Flutter) → build das imagens Docker → build do APK
```

| Camada | Tecnologia | Área da rubrica |
| --- | --- | --- |
| App cidadão/voluntário | Flutter (APK Android) | 3 |
| Painel técnico + Gestão | Next.js + Tailwind + Apache ECharts | 2 e 3 |
| API | Node.js + NestJS + Zod | 1, 3, 4 |
| Banco | PostgreSQL 16 (driver `pg`, SQL explícito e migrações versionadas) | 2 |
| Triagem | Regras determinísticas em TypeScript + LLM via API, com modo offline determinístico para a demo nunca depender de rede | 1 |
| Pipeline de dados | Python (pandas + SQLAlchemy + Faker) | 2 |
| IoT | Tinkercad (Arduino Uno) + simulador Python (HTTP) | 3 |
| DevOps | Git/GitHub, Docker Compose, GitHub Actions | 4 |

## A4. Área 1 — IA e automação (4 pts): triagem por risco

| Item da rubrica | Entrega |
| --- | --- |
| **IA aplicada (1,5)** | Serviço de triagem que classifica cada relato em verde/amarela/vermelha + categoria, e sugere o ponto de coleta |
| **Prompts / automação (1)** | Regras determinísticas + prompt do LLM + regra de fail-closed, todos documentados no PDF (abaixo) |
| **Demonstração (0,5)** | 3 exemplos reais de entrada → saída (verde, amarela, vermelha) com prints do painel |
| **Lógica e ganho (1)** | Avaliação num conjunto de 60 relatos rotulados: acurácia, **recall da vermelha** e tempo por triagem, manual × automático |

**Como funciona** (detalhes técnicos na seção 5 da Parte B):

```
relato ─▶ normalização (minúsculas, sem acento) ─▶ REGRAS: termo de risco? ──sim──▶ VERMELHA (LLM nem é chamado)
                                                         │não
                                                         ▼
                          remove nome/CPF/telefone ─▶ LLM (saída JSON) ─▶ confiança < 0,75? ──sim──▶ VERMELHA
                                                         │                       │não
                                     erro/timeout ───────┴──▶ VERMELHA           ▼
                                                                         faixa + categoria do LLM
```

**Regras determinísticas (amostra do léxico):** `bate`, `apanha`, `agred`, `violen`, `abus`, `estupr`, `ameaç`, `arma`, `faca`, `suicid`, `me matar`, `nao quero viver`, `droga`, `crack`, `trabalho infantil`, `crianca sozinha`, `idoso sozinho sem comer`, `passando fome` + `dias`. O léxico completo fica em `area1-ia/lexico.json`, versionado.

**Prompt do LLM:**

```text
Você é um assistente de triagem da assistência social municipal. Classifique o relato de um cidadão.

FAIXAS
- verde: necessidade material de baixo risco, sem contato domiciliar (alimento, roupa, móvel, material escolar).
- amarela: exige contato pessoal ou envolve pessoa frágil (idoso sozinho, transporte a consulta, visita, cuidado).
- vermelha: possível violação de direitos ou risco à vida (violência, criança/idoso em risco, fome aguda,
  saúde mental, situação de rua, trabalho infantil).

REGRAS
- Na dúvida entre duas faixas, escolha a mais grave.
- Não invente fatos que não estão no relato.
- "confianca" é sua certeza de 0 a 1. Seja conservador.
- Responda SOMENTE com JSON válido, sem texto fora dele.

CATEGORIAS: alimento, roupa, movel, material_escolar, apoio_idoso, transporte, outro

FORMATO
{"faixa": "verde|amarela|vermelha", "categoria": "<categoria>", "confianca": 0.0,
 "justificativa": "<uma frase em linguagem simples>"}

RELATO:
"""{relato_sem_dados_pessoais}"""
```

**Avaliação:**

- Conjunto `area1-ia/avaliacao/relatos.csv`: 60 relatos fictícios escritos pelo grupo e rotulados à mão (30 verdes, 15 amarelos, 15 vermelhos). Incluir casos difíceis: erro de digitação, gíria e violência descrita sem a palavra "violência".
- Script `avaliar.py`: acurácia geral, **recall da faixa vermelha (meta: 100%)**, matriz de confusão e % de casos que chegaram ao LLM.
- Ganho: tempo de triagem manual (um integrante lê e classifica 20 relatos, cronometrado) × tempo da triagem automática por relato.
- Os resultados também aparecem na aba "Qualidade da IA" do dashboard (diferencial "IA medida").

## A5. Área 2 — Big Data e visualização (4 pts)

**Quem decide com isso:** a coordenação do CRAS e o secretário de assistência social. Pergunta-guia: **"onde a rede cidadã não está dando conta, e o que fazer?"**

| Item da rubrica | Entrega |
| --- | --- |
| **Estrutura dos dados (1)** | Data lake em camadas bronze/prata/ouro + modelo estrela |
| **Ingestão e processamento (1)** | Gerador sintético + eventos IoT + IBGE → pipeline Python com anonimização e checagens de qualidade |
| **Dashboard (1,5)** | Módulo "Gestão" do painel web: 5 abas, 6 filtros |
| **Funções analíticas (0,5)** | Funções e views SQL: indicadores filtrados, janela (variação mensal), média móvel (dias até zerar estoque) |

### Estrutura (data lake em camadas)

As camadas são **schemas separados no mesmo PostgreSQL**. O banco operacional da aplicação fica em `public`. O dashboard lê **apenas** `ouro`, que não contém nenhum dado pessoal.

```
PostgreSQL
├─ public   banco operacional do ELO (solicitações, pareamentos, eventos IoT)
├─ bronze   cópia bruta como chegou: extração do public, eventos IoT (JSONB), dados públicos (IBGE, CSV)
├─ prata    limpo e padronizado: tipos corrigidos, bairros normalizados, duplicados removidos, CPF → hash, nomes removidos
└─ ouro     modelo estrela + views de indicadores, lido pelo módulo Gestão
```

O role de banco usado pelo dashboard só tem `SELECT` em `ouro`: mesmo um bug na tela não consegue expor dado pessoal.

| Tabela (ouro) | Conteúdo |
| --- | --- |
| `fato_solicitacao` | 1 linha por pedido: datas (abertura, 1ª resposta, fechamento), faixa, desfecho, escalado (s/n), tempos em horas |
| `fato_leitura_sensor` | 1 linha por leitura: ponto, peso, temperatura, umidade, horário |
| `fato_entrega` | Entregas com origem (sensor ou manual) e tempo entre pareamento e depósito |
| `fato_consumo_diario` | kg retirados por ponto e por dia |
| `dim_tempo` | Data, semana, mês, dia da semana |
| `dim_bairro` | Bairro, município, população (IBGE), CRAS de referência |
| `dim_canal` | App, WhatsApp, balcão, web leve |
| `dim_categoria` / `dim_faixa` | Alimento, roupa, móvel, material escolar / verde, amarela, vermelha |
| `dim_ponto_coleta` | Ponto, bairro, capacidade em kg |
| `dim_voluntario` | Nível, bairro, data de entrada, ativo nos últimos 90 dias (sem nome) |

### Ingestão e processamento

1. **Gerador de dados sintéticos** (`area2-dados/gerador`, Python + Faker pt-BR): ~5.000 solicitações em 6 meses, 2 municípios, 8 bairros. Distribuições propositalmente desiguais para o dashboard ter história:
   - canais: app 55%, WhatsApp 30%, balcão 12%, web leve 3%;
   - faixas: verde 70%, amarela 18%, vermelha 12%;
   - 1 bairro com poucos voluntários e alto escalonamento ao CRAS;
   - pico de alimentos no fim do mês.
2. **Eventos IoT** do simulador (A6), gravados pela API em `public` e copiados para `bronze`.
3. **Dado público real**: população por município (IBGE) para os indicadores por habitante. Dá o "dado real" que o pitch pede.
4. **ETL em Python (pandas + SQLAlchemy)**: `public → bronze` (extração), `bronze → prata` (limpeza, padronização, **anonimização**) e `prata → ouro` (dimensões, fatos, tempos calculados). Um comando: `python -m pipeline`. Roda como serviço agendado no Docker Compose (a cada 15 min na demo) e como etapa no CI.
5. **Qualidade de dados**: checagens que reprovam o pipeline: nenhum CPF em claro na prata/ouro, datas coerentes (fechamento ≥ abertura), faixa sempre preenchida. O log de cada execução vai para o PDF.

### Dashboard: módulo "Gestão" do painel web

O dashboard fica **dentro do painel web do ELO** (`/gestao`), não numa ferramenta separada:

- **É o que o PRD pede**: o painel do gestor (RF-601 a RF-606) faz parte do produto, com o mesmo login e perfil.
- **LGPD**: o dado não sai do sistema. Acesso por perfil, só agregados.
- **IoT ao vivo**: o card do ponto de coleta atualiza por WebSocket no momento do depósito.
- **Um só protótipo no vídeo**: cidadão, técnico e gestor no mesmo sistema.

Implementação: páginas Next.js + **Apache ECharts**. Os filtros ficam na URL (`?periodo=90d&bairro=vila-nova&canal=whatsapp`), então todo recorte pode ser compartilhado.

Filtros globais: **período, município, bairro, canal, categoria, faixa**.

| Aba | Indicadores | Decisão que apoia |
| --- | --- | --- |
| **1. Visão geral** (P0) | Total de pedidos · **Taxa de absorção pela rede** · **% escalado ao CRAS** · Tempo médio até a 1ª resposta por faixa · Variação mensal | A rede está aliviando o CRAS? |
| **2. Equidade** | **% de pedidos fora do app** (meta ≥ 30%) · Pedidos por canal ao longo do tempo | A inclusão funciona ou só quem tem smartphone é atendido? |
| **3. Território** | Pedidos por bairro · **Voluntários ativos por 200 habitantes** (meta ≥ 1) · Ranking de bairros por escalonamento | Onde recrutar voluntários e onde reforçar a equipe técnica |
| **4. Pontos de coleta (IoT)** | Estoque atual por ponto (ao vivo) · **Dias até zerar** · Alertas de temperatura · % de entregas confirmadas por sensor | Qual ponto precisa de campanha de arrecadação agora |
| **5. Qualidade da IA** | Acurácia · **Recall da faixa vermelha** · Tempo manual × automático | Dá para confiar na triagem automática? |

A aba 1 sozinha já cumpre o mínimo da rubrica (3+ indicadores com filtros). As outras entram por ordem, conforme o tempo.

Acessibilidade: todo gráfico tem o botão **"Ver como tabela"**, e as metas aparecem como texto ("27%, abaixo da meta de 30%"), nunca só como cor.

### Funções analíticas (SQL, camada `ouro`)

```sql
-- Indicadores principais, já respondendo aos filtros
CREATE FUNCTION ouro.indicadores(p_inicio date, p_fim date,
                                 p_bairro text DEFAULT NULL, p_canal text DEFAULT NULL)
RETURNS TABLE (total_pedidos bigint, taxa_absorcao numeric, pct_escalado numeric,
               pct_fora_do_app numeric, horas_1a_resposta numeric)
LANGUAGE sql STABLE AS $$
  SELECT
    count(*),
    count(*) FILTER (WHERE f.desfecho = 'resolvida_rede')::numeric
      / NULLIF(count(*) FILTER (WHERE f.faixa = 'verde'), 0),
    avg(f.escalado::int),
    avg((c.canal <> 'app')::int),
    avg(f.horas_ate_primeira_resposta)
  FROM ouro.fato_solicitacao f
  JOIN ouro.dim_canal  c USING (canal_id)
  JOIN ouro.dim_bairro b USING (bairro_id)
  WHERE f.data_abertura BETWEEN p_inicio AND p_fim
    AND (p_bairro IS NULL OR b.slug  = p_bairro)
    AND (p_canal  IS NULL OR c.canal = p_canal);
$$;

-- Variação mensal (função de janela)
CREATE VIEW ouro.v_pedidos_mensal AS
SELECT mes, total,
       total - lag(total) OVER (ORDER BY mes) AS variacao_abs,
       round((total - lag(total) OVER (ORDER BY mes))::numeric
             / NULLIF(lag(total) OVER (ORDER BY mes), 0), 3) AS variacao_pct
FROM (SELECT date_trunc('month', data_abertura) AS mes, count(*) AS total
      FROM ouro.fato_solicitacao GROUP BY 1) m;

-- Voluntários ativos por 200 habitantes, por bairro
CREATE VIEW ouro.v_densidade_rede AS
SELECT b.bairro, b.populacao,
       count(DISTINCT v.voluntario_id) AS voluntarios_ativos,
       round(count(DISTINCT v.voluntario_id) * 200.0 / NULLIF(b.populacao, 0), 2) AS voluntarios_por_200_hab
FROM ouro.dim_bairro b
LEFT JOIN ouro.dim_voluntario v ON v.bairro_id = b.bairro_id AND v.ativo_90d
GROUP BY b.bairro, b.populacao;

-- Dias até zerar o estoque (média móvel de 7 dias do consumo)
CREATE VIEW ouro.v_previsao_estoque AS
WITH consumo AS (
  SELECT ponto_id, dia,
         avg(kg_retirados) OVER (PARTITION BY ponto_id ORDER BY dia
                                 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS media_7d
  FROM ouro.fato_consumo_diario
)
SELECT p.ponto, e.estoque_kg, c.media_7d,
       round(e.estoque_kg / NULLIF(c.media_7d, 0), 1) AS dias_ate_zerar
FROM ouro.v_estoque_atual e
JOIN ouro.dim_ponto_coleta p USING (ponto_id)
JOIN LATERAL (SELECT media_7d FROM consumo c
              WHERE c.ponto_id = e.ponto_id ORDER BY dia DESC LIMIT 1) c ON true;
```

Essas funções são testadas com dados de seed conhecidos (ex.: 10 pedidos verdes, 6 resolvidos pela rede → taxa = 0,6).

## A6. Área 3 — MVP, IoT e experiência digital (4 pts)

| Item da rubrica | Entrega |
| --- | --- |
| **Protótipo, 4+ telas (1)** | 6 telas no app + 2 no painel web (abaixo) |
| **IoT, 2+ sensores (1)** | Ponto de Coleta Inteligente: peso + temperatura/umidade (Tinkercad + simulador) |
| **Fluxo funcional (1)** | O laço de A2, do pedido à devolutiva |
| **Arquitetura (1)** | Diagrama de A3, redesenhado no PDF (draw.io/Excalidraw) |

### Telas

| # | Tela | Onde | Base no mockup |
| --- | --- | --- | --- |
| 1 | Entrar: "Entrar na minha conta" (e-mail + código enviado pelo Resend), "Criar uma conta" e "Ou continue com" Google (real), Apple e Facebook (simulados, contas fictícias) | App | Tela 1 |
| 2 | Início (saudação, 4 atalhos, pedidos próximos) | App | Tela 2 |
| 3 | Pedir ajuda (relato em texto, bairro, ponto de coleta) → confirmação com protocolo de 6 dígitos | App | Novo, no ELO DS |
| 4 | Mural do bairro, em lista (com alternância para mapa se der tempo) | App | Tela 3; pedidos agregados por bairro, nunca pino na casa |
| 5 | Detalhe do pedido + "Quero ajudar" + instruções do ponto de coleta | App | Tela 4, sem compartilhar e sem fotos de voluntários |
| 6 | Acompanhar pedido (linha do tempo) / "Sua ajuda chegou" | App | Novo |
| 7 | Fila do técnico (ordenada por risco, alerta vermelho, reclassificar com justificativa) | Painel web | Novo |
| 8 | Gestão (dashboard da A5) | Painel web | Novo |

O app usa os tokens do ELO Design System (seção 3 da Parte B) com as correções de contraste: tag âmbar com texto escuro e link verde em `#006B52`.

### IoT: Ponto de Coleta Inteligente

**Onde se encaixa:** na etapa de entrega do laço. Pelo PRD, doação material vai sempre para ponto de coleta, nunca para a casa do cidadão (RS-02). O ponto inteligente confirma a entrega sozinho e dispara a devolutiva "Sua ajuda chegou" (P6). Não capta nenhum dado pessoal: só peso, temperatura e o número do protocolo.

| Componente | Papel | Tinkercad (Arduino Uno) |
| --- | --- | --- |
| **Sensor 1: peso** | Detecta o depósito e mede o estoque | Sensor de força (FSR) no pino analógico, representando a balança |
| **Sensor 2: temperatura** | Conservação dos alimentos | TMP36 |
| Teclado 4×4 | Voluntário digita o **protocolo de 6 dígitos** | Keypad 4×4 |
| LCD 16×2 | "Digite o protocolo" / "Entrega registrada" | LCD 16×2 |
| LED + buzzer | Estoque baixo ou temperatura alta | LED vermelho + piezo |

Se Wokwi (ESP32) estiver no conteúdo, trocar por célula de carga + HX711 e DHT22: o ESP32 envia direto para a API, sem precisar do simulador.

**Fluxo:**

1. A voluntária digita o protocolo; o LCD confirma o pedido ("Cesta básica, Vila Nova").
2. Ela deposita a doação; o peso sobe acima do limiar (ex.: +2 kg) e se estabiliza por 3 s.
3. O dispositivo envia `entrega_depositada { ponto_id, protocolo, delta_peso_kg, temperatura_c, ts }`.
4. A API valida o protocolo (existe, está pareado, é deste ponto), marca **entregue** e grava o evento.
5. Cidadã e voluntária recebem os avisos; o card do dashboard atualiza na hora.
6. A cada 60 s, o dispositivo envia telemetria (`leitura_sensor`) para estoque e temperatura.

**Integração (o Tinkercad não tem rede):** o circuito no Tinkercad é a **evidência visual** (print + link no PDF, sketch `.ino` no repositório). Um **simulador Python** (`area3-mvp-iot/iot/simulador`) envia exatamente as mesmas mensagens para a API por HTTP. É ele que aparece integrado na demo. A rubrica aceita mock.

| Método | Rota | O que faz |
| --- | --- | --- |
| `POST` | `/iot/pontos/{id}/eventos` | Recebe `entrega_depositada` e `leitura_sensor` |
| `GET` | `/iot/pontos/{id}/estado` | Estoque atual, última temperatura, alertas |

**Regras:**

- Protocolo inválido ou de outro ponto: LCD mostra "Protocolo não encontrado" e nada muda.
- Peso não subiu em 60 s: entrega fica pendente para confirmação manual.
- Temperatura > 30 °C por 10 min: alerta ao responsável pelo ponto.
- Limitação assumida no PDF: o peso prova que algo foi depositado, não o conteúdo. O responsável pelo ponto valida a retirada.

**Próximo passo (citar no pitch):** botão SOS para idoso que mora sozinho. Fica para depois porque monitora o domicílio, que é dado sensível.

## A7. Área 4 — DevOps, segurança e qualidade (3 pts)

| Item da rubrica | Entrega |
| --- | --- |
| **Organização (0,5)** | Repositório Git organizado por área (A10), commits por integrante, branch `main` protegida + PRs |
| **DevOps (1)** | `docker compose up` sobe tudo + GitHub Actions rodando a cada push |
| **Segurança (0,5)** | 5 práticas (abaixo), exigência mínima é 2 |
| **Testes (1)** | Plano com 8 casos + evidência de execução (abaixo) |

**Docker Compose:** `db` (PostgreSQL 16), `api`, `painel`, `pipeline` (agendado a cada 15 min), `simulador-iot` (perfil `demo`). Um `.env.example` com todas as variáveis; a chave do LLM nunca entra no Git.

**GitHub Actions (`.github/workflows/ci.yml`), a cada push e PR:**

1. Lint e typecheck (API e painel), `flutter analyze`.
2. Testes: API + triagem (Vitest), pipeline (pytest, com Postgres como serviço do job), Flutter (widget tests).
3. Build das imagens Docker.
4. Build do APK (`flutter build apk --release`), publicado como artefato do job.

O print do pipeline verde e do APK gerado vai para o PDF. Isso cobre a evidência de "CI/CD" e se aproxima do diferencial "um commit dispara build e testes sem passo manual".

**Práticas de segurança:**

1. **Autenticação** JWT na API; perfis cidadão / voluntário / técnico / gestor com permissão por rota.
2. **Validação de entrada** com Zod em todas as rotas, inclusive no endpoint IoT.
3. **Chave por dispositivo IoT** (`X-Device-Key`, guardada como hash).
4. **Proteção de dados**: endereço e nome completo nunca saem no mural; relato vermelho não aparece para voluntário; anonimização no pipeline; dashboard lê só agregados.
5. **Minimização no LLM**: nome, CPF e telefone são removidos do texto antes de enviar.

**Plano de testes:**

| # | Caso | Tipo | Resultado esperado |
| --- | --- | --- | --- |
| T1 | Relato com termo de violência | Unitário (triagem) | Vermelha sem chamar o LLM; não aparece no mural |
| T2 | LLM indisponível / timeout | Unitário (triagem) | Vermelha, vai para a fila do técnico (fail-closed) |
| T3 | Conjunto de avaliação | Integração (triagem) | Recall da faixa vermelha = 100% |
| T4 | Mural do bairro | Integração (API) | Nenhum item contém endereço nem nome completo |
| T5 | Protocolo inválido no ponto de coleta | Integração (API IoT) | 404; o pedido não muda |
| T6 | Depósito com peso acima do limiar | Integração (API IoT) | Pedido vira "entregue" e a devolutiva é gerada |
| T7 | Pipeline | Integração (pytest) | Nenhum CPF em claro em prata/ouro; datas coerentes |
| T8 | Função `ouro.indicadores` | Integração (SQL) | Taxa de absorção = 0,6 no seed conhecido |

Evidência: saída dos testes no CI (print) + tabela acima com status e data de execução no PDF.

## A8. Vídeo pitch (5 pts, até 3 min)

| Tempo | Bloco | O que mostrar |
| --- | --- | --- |
| 0:00–0:30 | **O problema** | Persona Ana. Uma assistente social do CRAS atende a referência de milhares de famílias, e boa parte dos pedidos é de baixa complexidade (cesta, roupa, colchão). Trazer um número real de fonte oficial (ex.: famílias no CadÚnico do município, MDS) |
| 0:30–0:50 | **A solução** | ELO: conecta a solidariedade do bairro à rede pública, com a prefeitura como fiadora e triagem por risco |
| 0:50–2:10 | **Demonstração** | (1) Ana pede ajuda no app → protocolo. (2) Painel: triagem verde e, em seguida, um relato de violência indo para a fila com alerta e **fora do mural**. (3) Cláudia assume, digita o protocolo no ponto de coleta e a balança sobe → "Sua ajuda chegou". (4) Dashboard: estoque do ponto mudando ao vivo + indicadores por bairro + recall da IA |
| 2:10–2:40 | **Impacto** | Menos demanda simples na fila do CRAS, devolutiva para quem ajuda, equidade por canal. ODS 2, 10 e 11 |
| 2:40–3:00 | **Fechamento** | "O sistema SUAS registra o atendimento; o ELO faz a demanda chegar e mobiliza quem pode atender." |

Gravar a demo em partes e editar. Publicar no YouTube como **não listado** (o link funciona para quem tiver) e testar o link numa aba anônima.

**ODS:** 2 (fome zero: doação de alimentos), 10 (redução das desigualdades: equidade por canal e acessibilidade), 11 (cidades e comunidades sustentáveis: rede de bairro).

## A9. Cronograma até a entrega

Assumindo 5 integrantes. Com menos pessoas, juntar os papéis 4+5 e 2+5.

| Papel | Responsável por |
| --- | --- |
| **1. IA + API** | API NestJS (solicitações, mural, ofertas, entregas, IoT), triagem, conjunto de avaliação |
| **2. Dados + Gestão** | Gerador, pipeline, SQL da camada ouro, módulo Gestão no painel |
| **3. App** | Flutter: 6 telas com o ELO DS, integração com a API, APK |
| **4. IoT + Painel técnico** | Circuito Tinkercad, sketch, simulador, fila do técnico |
| **5. DevOps + Qualidade + Entrega** | Repositório, Docker Compose, CI, testes, diagrama, PDF, .txt, edição do vídeo |

| Quando | Todos / marcos |
| --- | --- |
| **18/11, até ~01h** | Repositório criado com a estrutura de A10 · Docker Compose com Postgres de pé · schema e seed mínimos · contrato da API combinado (rotas e JSON) para cada um trabalhar em paralelo |
| **19/11, 08h–13h** | Cada papel constrói a sua área contra o contrato. **Marco 13h:** cada área roda sozinha |
| **13h–16h** | Integração: app ↔ API, simulador ↔ API ↔ dashboard, pipeline ↔ Gestão. Testes T1–T8 verdes no CI |
| **16h–18h** | **Congelar funcionalidades.** Prints e evidências de cada área · diagrama de arquitetura · avaliação da IA rodada e registrada |
| **18h–20h30** | Gravar e editar o pitch · subir no YouTube · testar o link em aba anônima |
| **20h30–22h** | README raiz e por área · PDF · .txt · **teste do zero:** um integrante clona o repositório numa máquina limpa e segue só o README |
| **até 22h30** | **Enviar.** A folga de 1h25 é para imprevisto na plataforma |

**Se atrasar, cortar nesta ordem** (o P0 nunca é cortado): build iOS → mapa (fica só a lista) → atualização ao vivo por WebSocket (vira recarregar a cada 10 s) → abas 2, 3 e 5 do dashboard → fila do técnico com reclassificação (fica só a lista ordenada).

## A10. Checklist de entrega

**Estrutura do .zip (organizado por área, como pede o desafio):**

```
elo-global-solution.zip
├─ README.md                 visão geral, pré-requisitos, `docker compose up`, links, uso de IA generativa
├─ integrantes.txt           nome do grupo, RM e nome de cada integrante, link do vídeo pitch
├─ ELO-entregaveis.pdf       solução, arquitetura e evidências de cada área
├─ area1-ia/                 triagem (regras, prompt, avaliação) + README
├─ area2-dados/              gerador, pipeline, sql/ (bronze/prata/ouro, funções) + README
├─ area3-mvp-iot/
│  ├─ app/                   Flutter + APK em releases/
│  ├─ painel/                Next.js (fila do técnico + Gestão)
│  ├─ api/                   NestJS
│  └─ iot/                   sketch .ino, prints do Tinkercad, simulador
├─ area4-devops/             docker-compose.yml, .github/workflows, plano de testes + evidências
└─ docs/                     PRD, este plano, diagrama de arquitetura
```

**Conteúdo do PDF:** problema e cidadão · solução e ODS · arquitetura · área 1 (regras, prompt, 3 exemplos, métricas) · área 2 (camadas, modelo estrela, log do pipeline, prints das abas com filtros, SQL das funções) · área 3 (prints das 8 telas, circuito Tinkercad, fluxo completo) · área 4 (CI verde, `docker compose ps`, práticas de segurança, plano de testes com resultados) · uso de IA generativa.

**Antes de enviar:**

- [ ] Cada área roda seguindo **só** o README, a partir de um clone limpo
- [ ] PDF com solução, arquitetura e evidências das 4 áreas
- [ ] Prints do dashboard e da IA funcionando no PDF
- [ ] Evidência de Docker e CI no PDF
- [ ] `.txt` com nome do grupo, RM e nome de cada integrante e o link do pitch
- [ ] Link do vídeo público (ou não listado) e testado em aba anônima, também no README
- [ ] Uso de IA generativa declarado no README
- [ ] Nenhum segredo no repositório (`.env` fora do Git)
- [ ] Enviado na plataforma até 22h30 de 19/11

## A11. Pendências que podem custar pontos

| # | Pendência | Risco |
| --- | --- | --- |
| **P1** | Confirmar que **Flutter, NestJS, Next.js, PostgreSQL, Python/pandas, Tinkercad, Docker e GitHub Actions** estão no conteúdo até a fase 7 | Tecnologia fora do conteúdo zera a área inteira. Se alguma não estiver, trocar pela equivalente vista em aula **antes** de começar |
| P2 | Quantos integrantes há no grupo | Redistribuir os papéis de A9 |
| P3 | Qual LLM usar e quem fornece a chave | Sem chave, a triagem roda só com as regras + modo offline; a avaliação continua valendo |
| P4 | Escrever os 60 relatos de avaliação | Sem eles não há métrica de IA (1 pt) |

---

# PARTE B — Visão de produto (pós-entrega)

A arquitetura abaixo é o ELO como plataforma municipal, conforme o PRD. Ela não precisa estar pronta para a Global Solution. Serve para responder "e depois?" no pitch e para guiar a continuidade do projeto.

> O ELO é um produto independente: **não segue o padrão Phoenyx** (componentes, layout, login, rodapé). Cada escolha se justifica pelo PRD, não por herança de outros projetos.

### O que muda entre o protótipo e o produto

| Item do produto | No protótipo da Parte A |
| --- | --- |
| Nuvem no Brasil, KMS, backups, observabilidade completa | Docker Compose local |
| Login gov.br | Login simulado com a mesma interface OIDC |
| OTP por SMS | Código exibido no console da API |
| WhatsApp oficial, URA 0800, web leve | Fora da entrega |
| Transcrição / LLM / TTS | LLM via API com dados fictícios; áudio é P2 |
| Isolamento multi-tenant por RLS | P2 (demonstração opcional) |
| Pentest, RIPD, auditoria WCAG externa | Testes automatizados + checklist próprio |
| Publicação em loja | Não há; APK Android e, depois, iPhone via Mac |

### Rodando o app sem loja (Flutter)

| Situação | Como fazer |
| --- | --- |
| Desenvolvimento no Android | `flutter run` com cabo USB ou depuração por Wi-Fi. Funciona no Windows |
| APK para instalar / entregar | `flutter build apk --release` gera o `.apk` localmente, sem conta em serviço nenhum. Para aparelhos antigos: `--split-per-abi` |
| iPhone | No **Mac**: Xcode, clonar o repositório, `flutter run` com o iPhone conectado e o **Modo de Desenvolvedor** ativado |
| Assinatura iOS gratuita | O app **expira em 7 dias** e precisa ser reinstalado pelo Mac |
| Assinatura iOS paga | Só para distribuir a vários iPhones sem cabo (ad hoc ou TestFlight, sem publicar na App Store) |
| Celular falando com a API local | Túnel HTTPS (cloudflared/ngrok): Android 9+ e iOS bloqueiam `http://` por padrão. URL por `--dart-define=API_URL=...` |
| Flavors | `dev` (local, logs) e `demo` (túnel fixo, seed, selo "DEMO" no ícone) |

## 1. Decisão de stack (resumo)

| Camada | Escolha | Por que esta e não a alternativa |
| --- | --- | --- |
| Linguagem | **TypeScript** no backend e na web; **Dart** no app (Flutter) | Contratos únicos via OpenAPI geram os clients das duas linguagens |
| Monorepo | **pnpm workspaces + Turborepo** (o app Flutter mora em `apps/mobile` com Melos/FVM, fora do grafo pnpm) | Cache de build e CI por pacote |
| API | **NestJS sobre o adapter Fastify** | Guards, interceptors e injeção de dependência resolvem RBAC por território, auditoria de **leitura** (RNF-S05) e adaptadores trocáveis (LLM, transcrição, WhatsApp, SMS). Fastify puro exigiria montar tudo isso à mão |
| Contratos | **Zod** em `packages/contracts` → **OpenAPI 3.1** como fonte da verdade → client TS (orval) e client Dart (openapi-generator `dart-dio`) | Um contrato, gerado para todos os consumidores; o CI quebra se o client estiver desatualizado |
| Banco | **PostgreSQL 16 com RLS** (`FORCE ROW LEVEL SECURITY`) | ADR-02: isolamento no banco, não em filtro de aplicação |
| Acesso a dados | **Driver `pg` com SQL explícito** e migrações `.sql` versionadas (no protótipo). Drizzle ORM é a opção para a versão de produção, com políticas RLS declaradas no schema | SQL explícito facilita auditar o que roda sobre dado sensível; sem camada extra para o prazo da entrega |
| Jobs / filas | **pg-boss** (fila no próprio Postgres) | Enfileirar na **mesma transação** que cria a solicitação: nada se perde se um worker cair (RNF-O04). Dispensa Redis na fase 1 |
| Tempo real | WebSocket (gateway do NestJS) para chat e alerta vermelho; push via **FCM/APNs** (firebase_messaging; opcional no protótipo) | |
| Painéis (técnico, gestor, admin) | **Next.js (App Router) + Tailwind + primitivos Radix**, com componentes próprios do **ELO Design System** | Radix entrega foco, teclado e ARIA corretos; a aparência é 100% ELO (seção 3). shadcn pode servir de ponto de partida de código, sem o visual padrão |
| App cidadão/voluntário | **Flutter** (Android + iOS) — **decidido (D7)** | Veja 1.1 |
| Web leve | **App separado: Fastify + HTML renderizado no servidor, sem React** | Next.js sempre envia o runtime do React (~90 KB gzip), o que estoura sozinho o orçamento de 100 KB (RNF-O02, ADR-01) |
| Transcrição | Interface `TranscriptionProvider`; começar com **faster-whisper self-host** em GPU no Brasil | Dado sensível fica no país (RNF-S13); custo por minuto medido desde o início (RNF-O05) |
| Classificador | Motor determinístico em TS puro **+** LLM atrás da interface `RiskClassifier` | ADR-03; ver seção 5 |
| Síntese de voz (RC-06) | Interface `TtsProvider` (Azure/Google pt-BR ou Piper self-host) | Toda resposta precisa existir em áudio |
| Infra | Nuvem com região no Brasil (AWS sa-east-1, Azure Brazil South, OCI Vinhedo ou Magalu Cloud): containers, Postgres gerenciado, storage S3 com KMS | RNF-S13 |
| Observabilidade | OpenTelemetry → Grafana/Loki/Tempo (ou Datadog) + Sentry; `tenant_id` em todo log e métrica; remoção de PII nos logs | RNF-O07 |

### 1.1 Mobile: por que Flutter (D7, decidido em 2026-11-18)

Com design system próprio, a comparação muda: o reuso de UI entre web e mobile já era zero nas duas opções (React Native não renderiza DOM), e os contratos saem do OpenAPI para qualquer linguagem. O que sobra de diferença:

| Critério | **Flutter** | **Expo / React Native** |
| --- | --- | --- |
| Fidelidade ao design system ELO | **Melhor.** Desenha cada pixel; Android e iOS ficam idênticos ao mockup | Usa componentes nativos; diferenças sutis entre plataformas |
| Android de entrada (persona Ana) | **Melhor.** Impeller com AOT, desempenho estável em aparelho fraco | Bom com Hermes + New Architecture; listas longas pedem mais cuidado |
| Acessibilidade (TalkBack/VoiceOver) | Boa, via `Semantics`. Widgets próprios **exigem** `Semantics` explícito; esquecer = controle mudo | Boa; componentes nativos já chegam com papel acessível |
| Fonte a 200% (RNF-A07) | `TextScaler` respeita o sistema; testável em golden test | `fontScale` respeita o sistema |
| Testes | Widget tests + **golden tests** (regressão visual) + `integration_test`/Patrol; `meetsGuideline(textContrastGuideline)` e `labeledTapTargetGuideline` nativos no framework | Jest + RNTL; Maestro para e2e |
| Offline (agente, fase 2) | drift (SQLite) maduro | expo-sqlite / WatermelonDB |
| Correção urgente sem loja | Não há OTA oficial (Shorebird é pago) | **EAS Update** (OTA). *Irrelevante no protótipo* |
| Demo sem loja | APK local trivial; iPhone exige Mac | APK local ou EAS; **Expo Go roda em iPhone sem Mac** |
| Compartilhamento com o resto do monorepo | Tipos/client gerados do OpenAPI; validação (Zod) **reescrita** em Dart; textos/i18n via ARB gerado | Importa Zod, i18n e client direto |
| Time | Exige Dart. Curva curta para quem vem de TS/Java | Mesmo time do backend e do painel |

**Opinião:** Flutter é uma escolha boa para o ELO, não um compromisso. Para um app com identidade visual forte, usado em Android barato e com acessibilidade como critério de aceite, ele tem vantagens concretas (golden tests e checagens de acessibilidade nativas do framework). O custo real é um só: **duas linguagens no projeto**. Se houver pelo menos um dev mobile dedicado que vá dominar Dart, vá de Flutter. Se o app for tocado pelas mesmas pessoas do backend e do painel, Expo reduz troca de contexto.

**Decisão final: Flutter.** A demo começa no Android (APK) e depois vai para o iPhone usando o Mac disponível, o que elimina a única vantagem que restava ao Expo (Expo Go sem Mac).

PWA não serve como app principal (push e leitor de tela no iOS), mas a **web leve** cobre quem não instala nada.

#### Pacotes Flutter

| Necessidade | Pacote |
| --- | --- |
| Estado / DI | Riverpod |
| Rotas | go_router |
| HTTP + client gerado | dio + `openapi-generator` (dart-dio) |
| Modelos imutáveis | freezed + json_serializable |
| Armazenamento seguro de token | flutter_secure_storage |
| Áudio (pedir ajuda falando) | record + just_audio |
| Mapa | flutter_map (tiles OSM próprios/no Brasil) ou google_maps_flutter |
| Push | firebase_messaging |
| Offline (fase 2) | drift |
| i18n / linguagem simples | intl + ARB gerado de `packages/i18n` |
| Testes | flutter_test (golden + guidelines de a11y), Patrol para e2e |

---

## 2. Estrutura do monorepo

```
elo/
├─ apps/
│  ├─ api/            NestJS (REST + WebSocket + webhooks WhatsApp/SMS/URA)
│  ├─ worker/         Mesmo código da API, entrypoint de jobs pg-boss (SLA, alertas, transcrição, notificações)
│  ├─ painel/         Next.js: técnico, gestor, admin, encarregado LGPD
│  ├─ mobile/         Flutter: cidadão + voluntário (perfis no mesmo app), flavors dev/demo
│  │  └─ packages/elo_ui/   Componentes Flutter do ELO Design System + Widgetbook
│  └─ web-leve/       Fastify SSR, HTML puro, formulários com POST
├─ iot/
│  ├─ ponto-coleta/   Sketch Arduino (.ino) + link e prints do circuito Tinkercad
│  └─ simulador/      Simulador dos sensores → API (HTTP/MQTT)
├─ dados/
│  ├─ gerador/        Dados sintéticos (Faker pt-BR)
│  ├─ pipeline/       ETL bronze → prata → ouro + checagens de qualidade
│  └─ sql/            Schemas bronze/prata/ouro, views e funções analíticas (o dashboard fica em apps/painel, rota /gestao)
├─ packages/
│  ├─ contracts/      Schemas Zod, enums de domínio, openapi.json, clients gerados (TS e Dart)
│  ├─ db/             Schema Drizzle com políticas RLS, migrações, seeds de 2 municípios de teste
│  ├─ triagem/        Normalização de texto, léxico determinístico, orquestração com o LLM, golden set
│  ├─ design-tokens/  FONTE ÚNICA do ELO DS (JSON W3C/Style Dictionary) → Tailwind preset, CSS vars (web leve), ThemeData Dart
│  ├─ ui-web/         Componentes React do ELO DS sobre primitivos Radix + Storybook
│  ├─ i18n/           Textos em linguagem simples + glossário SUAS (RNF-A15) → JSON (web) e ARB (Flutter)
│  └─ config/         tsconfig, eslint (incl. jsx-a11y), prettier
└─ docs/
   ├─ adr/            ADR-01..N
   └─ PLANO-IMPLEMENTACAO.md
```

Para a entrega da Global Solution, o .zip segue a organização por área de A10; as pastas acima são o destino do código depois da entrega.

Fluxo Git (PRD §16): `main` protegida; uma branch por fase (`feat/fase-0-fundacao`, `feat/fase-1-laco`, ...), um PR por fase, com PRs menores por feature apontando para a branch da fase.

---

## 3. ELO Design System

Design system próprio, derivado do mockup oficial e dos arquivos em `images/`. Não herda nada de outros produtos. Uma única fonte de tokens alimenta os três alvos: painel (Tailwind), web leve (CSS puro) e app (ThemeData do Flutter).

```
Figma (biblioteca ELO) ──▶ tokens.json (formato W3C) ──▶ Style Dictionary ──┬─▶ tailwind-preset.ts   (painel)
                                                                            ├─▶ elo.css (variáveis)  (web leve)
                                                                            └─▶ elo_tokens.dart      (app)
```

### 3.1 Princípios visuais (lidos do mockup)

- **Acolhedor, não burocrático**: fundo claro levemente quente, cards brancos com cantos generosos, saudação pelo nome.
- **Ação primeiro**: a home abre com 4 atalhos grandes e coloridos; o botão principal ocupa a largura toda.
- **Cor organiza, ícone + texto explicam**: cada tipo de conteúdo tem cor própria, mas nunca só cor (RNF-A08).
- **Pouca densidade**: um assunto por card, texto curto, linguagem simples.

### 3.2 Cores

**Marca** (dos SVGs do logo):

| Token | Valor | Uso | Contraste em branco |
| --- | --- | --- | --- |
| `brand-900` | `#003B2E` | Logo, títulos, botão primário, chip selecionado | ~13:1 ✅ |
| `brand-700` (derivado) | ≈ `#006B52` | Links, texto verde, item ativo da navegação | ~6,5:1 ✅ |
| `brand-600` | `#078D6C` | Ícones, ilustrações, preenchimentos, FAB "Publicar" | ~4,2:1: só gráfico ou texto grande |
| `brand-100` | verde-menta claro | Fundo do atalho "Pedir ajuda", status "Em andamento" | fundo |
| `accent-500` | `#FFB000` | Pingo do logo, tag de categoria, destaque | ~1,9:1: **nunca texto branco em cima** |

**Tipos de conteúdo** (cards da home e pinos do mapa). O mesmo par cor + ícone aparece em todo lugar:

| Tipo | Cor | Ícone | Fundo pastel |
| --- | --- | --- | --- |
| Pedido de ajuda | verde (`brand-600`) | coração | menta |
| Oferecer ajuda / rede de voluntários | azul | mãos dadas / pessoas | azul-claro |
| Serviço público (CRAS, CREAS, UBS) | roxo | prédio público | lilás |
| Oportunidades (fase 3) | laranja | maleta | pêssego |

**Neutros e estados**: fundo da tela (off-white), superfície (branco), borda, texto primário (≈ `brand-900` ou cinza-900), texto secundário (cinza-600, ≥ 4,5:1), além de `sucesso`, `atencao`, `erro` e `info`. Cada um tem uma variante de texto que passa 4,5:1.

Regras de contraste (P9):
- Tag de categoria: texto `brand-900` sobre âmbar, ou âmbar só como fundo de ícone.
- Texto sobre pastel: sempre a variante escura da cor do tipo. Valores finais fechados pelo script de contraste.
- O script em `design-tokens` valida **todos** os pares texto/fundo declarados e quebra o CI se algum ficar abaixo de 4,5:1 (texto) ou 3:1 (componente).

### 3.3 Tipografia

- Família: **Nunito Sans** (humanista, aberta, boa leitura em pt-BR, licença OFL), a mais próxima do mockup. Alternativa a testar com baixa visão: **Atkinson Hyperlegible Next**. Arquivos **empacotados** no app e no servidor, sem CDN do Google (desempenho e LGPD).
- Escala (tamanho/altura de linha): display 28/34 bold · título 22/28 bold · cabeçalho 18/24 semibold · corpo **16/24** · apoio 14/20 · legenda 12/16 (só para informação não essencial).
- Corpo nunca abaixo de 16. Tudo em unidades escaláveis (`sp`, `rem`); layout testado a 200% (RNF-A07).

### 3.4 Forma, espaço e elevação

| Token | Valores |
| --- | --- |
| Espaçamento (grade 4) | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 |
| Raio | `sm` 8 (checkbox, tag) · `md` 12 (inputs) · `lg` 16 (cards, atalhos) · `xl` 24 (bottom sheet) · `full` (botões, chips, busca, FAB) |
| Elevação | `e1` sombra suave para cards · `e2` para bottom sheet e card flutuante do mapa |
| Alvo de toque | mínimo **48 × 48** (RNF-A05); botão primário com 52 de altura |
| Ícones | Estilo cheio e arredondado, como no mockup (Phosphor Fill ou Material Symbols Rounded, ambos disponíveis para web e Flutter) |

### 3.5 Componentes (inventário do mockup)

| Componente | Variações | Requisito de acessibilidade |
| --- | --- | --- |
| Botão | primário (verde escuro, largura total), secundário (contorno), texto, com ícone | Rótulo textual sempre; estado de carregando anunciado |
| Atalho da home | 4 tipos (seção 3.2) | Card inteiro é um único botão com nome ("Pedir ajuda") |
| Card de pedido | tag de categoria, bairro, título, resumo, contagem de ajudantes, status | Lido como um bloco: "Alimentação. Família precisa de cesta básica. Bairro Vila Nova. Em andamento." |
| Tag / status | categoria (cor do tipo), status (Em andamento, Concluído...) | Texto, nunca só cor |
| Chip de filtro | selecionado (preenchido) / não selecionado | Papel de botão de alternância, estado "selecionado" anunciado |
| Campo de busca | com ícone | `label` real, não só placeholder |
| Checklist de itens | marcado / desmarcado | Checkbox nativo, alvo de 48 |
| Pino de mapa | 4 tipos, com ícone | Todo pino também aparece na **Lista**; o mapa nunca é a única via |
| Card flutuante do mapa | unidade + distância + ação | Distância e direção por extenso |
| Barra de navegação inferior | 5 itens + FAB central "Publicar" | Rótulo visível em todos; FAB com nome "Pedir ajuda" |
| Cabeçalho | logo, notificações (com contador), avatar | Contador anunciado ("3 notificações") |
| Bottom sheet | login, confirmações | Foco preso dentro e devolvido ao fechar (RNF-A04) |
| Feedback | toast, banner, estado vazio, erro | Região `live` / `SemanticsService.announce` |
| Player de áudio | resposta falada (RC-06) | Controles com nome; velocidade ajustável |

Catálogo vivo: **Storybook** (web) e **Widgetbook** (Flutter), com teste de acessibilidade automático em cada história.

### 3.6 Logo e marca

- Arquivos de referência em `images/` (`elo-logo.svg`, `elo-logo-ajustada.svg`, `elo-favicon.svg`).
- Versões a produzir: horizontal, só símbolo (ícone do app com área de segurança para Android adaptativo e iOS), monocromática e negativa (logo branco sobre `brand-900`).
- O logo sempre com `aria-label="ELO"` / `Semantics(label: 'ELO')`.

### 3.7 Onde o mockup conflita com o PRD

O visual vale como guia; estes pontos precisam mudar na implementação:

| Tela | Elemento do mockup | Conflito | Ajuste proposto |
| --- | --- | --- | --- |
| Login | "Continue com Google / Apple / Facebook" | Login social não comprova identidade para política pública (PRD: gov.br + OTP) | **Mantido como no mockup.** Google real (ID token conferido na API); Apple e Facebook simulados no protótipo (só com `MODO_DEMO`). A conta social é vinculada a um cadastro com e-mail, telefone e bairro. Verificação forte (gov.br) fica para o roadmap |
| Login | "Criar uma conta" (sugere senha) | Cidadão não cria senha (persona Ana) | Mantido, sem senha: nome, e-mail, telefone, bairro e perfil; o e-mail é confirmado por código |
| Mapa | Pinos de pedido em ponto exato da rua | **P3 / RS-01**: endereço nunca público | O mapa mostra só equipamentos públicos e pontos de coleta; pedidos aparecem **agregados por bairro** ("3 pedidos em Vila Nova") |
| Mapa | Sem lista equivalente visível | RNF-A10 / RF-402 | Alternar **Mapa / Lista** no topo, com a lista como padrão quando o leitor de tela está ativo; distância e direção por extenso ("2,4 km ao norte") |
| Pedido | Botão compartilhar | Espalha o pedido para fora do território e da moderação | Remover, ou compartilhar só o link do mural do bairro, sem o pedido |
| Pedido | "4 pessoas ajudando" com fotos | Expõe a identidade dos voluntários; o PRD modela uma oferta por pareamento | Contagem sem foto ("4 vizinhos ajudando"); ver decisão D3 |
| Pedido | Checklist de itens | Não existe no modelo de domínio | Bom para cestas: modelar `ItemSolicitacao` com oferta por item (D3) |
| Início | Card "Oportunidades de emprego e cursos" | Fase 3 | Esconder por feature flag até a fase 3 |
| Mapa | Cor do pino distingue o tipo | RNF-A08 | Já há ícone por tipo; manter ícone + rótulo, nunca só cor |

---

## 4. Arquitetura de segurança e dados

### 4.1 Multi-tenant com RLS (ADR-02)

- Toda tabela de domínio tem `municipio_id`; política `USING (municipio_id = current_setting('app.municipio_id')::uuid)`.
- A aplicação conecta com um role **sem** `BYPASSRLS` e que não é dono das tabelas; `FORCE ROW LEVEL SECURITY` em todas. Migrações rodam com outro role.
- **Contexto por request:** com pool de conexões, o tenant tem que ser `set_config(..., true)` **dentro de uma transação** por request. Um wrapper `withTenant(ctx, tx => ...)` sobre o Drizzle abre a transação, aplica `municipio_id`, `operador_id`, `perfil` e `unidades`, e é a **única** forma de obter um handle de banco nos serviços (lint proíbe importar o client cru). Se o pooler for PgBouncer, usar modo *transaction*.
- **Teste de aceite da Fase 0:** suíte com Testcontainers que cria 2 municípios e tenta ler, atualizar e contar dados do outro em toda tabela; um teste que garante que nenhuma tabela nova nasce sem política (consulta a `pg_policies` vs `pg_tables`).

### 4.2 Camadas de acesso

1. **Tenant** (RLS): município.
2. **Território/unidade** (RLS + guard): técnico vê o próprio CRAS; acesso fora do território exige justificativa registrada (RNF-S04).
3. **Compartimento vermelho** (RNF-S09): schema `sigilo` separado, com política extra por perfil CREAS. O relato vermelho **não** fica em `solicitacao`; a solicitação pública só guarda status neutro.
4. **Campo**: CPF, NIS, telefone, endereço e relato com criptografia em envelope (chave por tenant no KMS). Busca por CPF via *blind index* (HMAC).

### 4.3 Auditoria (MD-03 / RNF-S05)

- Interceptor do NestJS registra **toda leitura** de recurso marcado `@Sensivel()`: quem, o quê, quando, IP/canal, qual registro, finalidade.
- Tabela `evento_auditoria` append-only: `REVOKE UPDATE, DELETE`, particionada por mês, com hash encadeado para evidenciar adulteração.
- Tela de consulta para o encarregado LGPD (RF-805).

### 4.4 Autenticação

| Ator | Método |
| --- | --- |
| Cidadão | gov.br (OIDC) **ou** OTP via SMS/WhatsApp; sessão longa no app (secure-store), curta na web leve |
| Voluntário | OTP para anônimo; gov.br obrigatório para verificado (PRD §8.3) |
| Operador | E-mail + OTP + **TOTP obrigatório** (RNF-S12); sessão curta, revogável |
| Consulta sem login | Protocolo de 6 dígitos + data de nascimento, com rate limit e bloqueio progressivo (6 dígitos é pouco: ~1M combinações por município) |

Tokens: access JWT de 10 min + refresh rotativo com detecção de reuso.

### 4.5 Protocolo de 6 dígitos (RC-02 / RF-204)

Sequência por município embaralhada (permutação, não aleatório puro): sem colisão, sem ordem previsível, e sem dígitos ambíguos ao falar, se o município quiser. Unicidade garantida por constraint `(municipio_id, protocolo)`.

---

## 5. Triagem de risco (o núcleo)

```
relato (texto | transcrição)
   │
   ├─▶ 1. Normalização: minúsculas, sem acento, gírias/erros de transcrição comuns, stemming pt-BR
   ├─▶ 2. Regras determinísticas (RT-03): léxico versionado por município
   │        bateu? ──▶ VERMELHA. Fim. O LLM nem é chamado.
   ├─▶ 3. Minimização: remove nome, CPF, telefone e endereço do texto
   ├─▶ 4. LLM com saída estruturada: { faixa, categoria, confianca, justificativa }
   ├─▶ 5. confianca < limiar do município (RF-303) ──▶ VERMELHA
   ├─▶ 6. Categoria fora das liberadas na fase ──▶ fila do técnico
   └─▶ 7. Grava em `classificacao` (MD-02, imutável) + auditoria
Qualquer erro, timeout ou indisponibilidade em 3–6 ──▶ VERMELHA / fila do técnico (RNF-O04)
```

- O pacote `packages/triagem` é TS puro, sem I/O, 100% testável.
- **Golden set**: conjunto rotulado por assistentes sociais. O CI **reprova** o build se houver um único falso negativo vermelho (meta "zero tolerado", §14.4).
- Mudança no léxico é versionada e revisada por técnico, nunca deploy silencioso.
- Fornecedor de LLM: só um que processe no Brasil, ou com base legal e contrato de transferência internacional analisados no RIPD. Isso é decisão D5.

---

## 6. Canais

| Canal | Implementação | Fase |
| --- | --- | --- |
| App | Flutter; perfis cidadão/voluntário; gravação de áudio nativa | 1 |
| WhatsApp | Cloud API (Meta) direto ou via BSP brasileiro; webhook → máquina de estados de conversa (persistida); áudio de entrada → transcrição; resposta em texto **e** áudio (TTS) | 1 |
| Atendimento assistido | Tela no painel: abrir em nome de terceiro, consentimento verbal registrado, cadastro provisório, **ficha impressa** (PDF/HTML de impressão) | 1 |
| Web leve | Fastify SSR, formulário POST, sem JS obrigatório; orçamento de 100 KB verificado no CI (Lighthouse CI + size check) | 1 |
| SMS | Provedor nacional atrás de `SmsProvider`; resposta ao telefone de referência | 1 (RF-707) |
| URA 0800 | Provedor de voz em nuvem (Twilio/Zenvia/Vonage ou PABX municipal) → mesmo núcleo; protocolo lido duas vezes | 1.5 |
| App do agente | Mesmo app com perfil agente + SQLite offline (drift / expo-sqlite) + sync com resolução de conflito | 2 |

Todos chamam o mesmo serviço `SolicitacaoService.abrir(canal, ...)` (RC-01). Os canais não têm regra de negócio própria.

---

## 7. Roadmap detalhado

Estimativas assumindo **2 backend, 1 web, 1 mobile, 1 design/QA de acessibilidade, PO meio período**. Sprints de 2 semanas.

### Pré-fase — gates não técnicos (em paralelo, começam já)

| Item | Por que bloqueia |
| --- | --- |
| **Q11**: parecer da Procuradoria sobre contato cidadão–voluntário | Sem ele o diferencial do produto cai |
| **Q7**: número oficial do WhatsApp + verificação Meta | Leva semanas; é gargalo da Fase 1 |
| Adesão do município/Phoenyx ao **Login gov.br** (credenciamento de serviço) | Prazo externo; usar OTP como fallback até sair |
| Q2/Q3: município-piloto e porte | Define seeds, categorias e se a rede nasce com OSCs |
| RIPD (RNF-S10) iniciado | Go-live depende dele |
| Marca **ELO**: o próprio PRD §4.1 lista colisões (Elo Assessoria, Elo Serviços, Elo Itinerante). Rodar a busca INPI e definir domínio antes do lançamento comercial | Risco jurídico já mapeado no PRD |

### Fase 0 — Fundação (≈ 3 sprints)

- Monorepo, CI (lint, typecheck, testes, build), ambientes dev/homolog.
- `packages/db`: modelo de §9 do PRD, RLS, roles, seeds de 2 municípios.
- Auth de operador com TOTP; OTP de cidadão; esqueleto gov.br.
- Perfis e permissões (RF-804), territórios e unidades (RF-803).
- Auditoria de leitura e escrita; medição de custo por tenant (tabela `uso_recurso`).
- ELO Design System: biblioteca Figma, `design-tokens` (Style Dictionary → 3 alvos), componentes base em `ui-web` e no app, catálogo Storybook/Widgetbook, todos testados com axe/guidelines de a11y e leitor de tela.
- Projeto Flutter criado com flavors `dev`/`demo`, client Dart gerado do OpenAPI e pipeline de `flutter build apk`.
- ADRs 01–03 + ADR de fila (pg-boss) + ADR de criptografia de campo.
- **Aceite:** teste automatizado de isolamento entre 2 municípios verde no CI.

### Fase 1 — O laço completo (≈ 8 sprints)

| Sprint | Entrega |
| --- | --- |
| 1 | Solicitação (texto), protocolo, linha do tempo, consulta por protocolo + nascimento; categorias da fase |
| 2 | Triagem: normalização, léxico, LLM, limiar, compartimento vermelho, alerta ativo ao plantão |
| 3 | Painel técnico: fila por risco/espera, ficha, reclassificação com justificativa, encaminhamento, desfecho |
| 4 | App: login, home, pedir ajuda (texto + áudio), acompanhar; transcrição |
| 5 | Rede cidadã: mural por bairro, lista/mapa, oferta, pareamento verde automático, ponto de coleta, chat interno, denúncia + suspensão preventiva |
| 6 | Confirmações + **"Sua ajuda chegou"**; escalonamento por SLA (J5); WhatsApp texto/áudio ponta a ponta |
| 7 | Atendimento assistido + cadastro provisório + ficha impressa; web leve; SMS ao telefone de referência |
| 8 | Painel gestor (RF-601..606, métricas de equidade); auditoria WCAG 2.2 AA completa; teste com usuários cegos (RNF-A16); pentest |

**Aceite (PRD):** solicitação nasce no WhatsApp por áudio → classificada → assumida → entregue → confirmada → fechada → voluntário recebe o desfecho; o fluxo inteiro navegável por TalkBack e VoiceOver. Automatizar esse fluxo como teste e2e.

### Fase 1.5 — URA (≈ 2–3 sprints)

URA 0800, protocolo falado, consulta por voz, retorno por SMS/ligação ativa.

### Fase 2 — Rede ampliada (≈ 6–8 sprints)

Credenciamento (trilha documental), faixa amarela com aprovação de pareamento, painel de OSC, campanhas, app do agente offline, CadÚnico (se houver convênio), exportação CSV para o prontuário, importação CadSUAS.

### Fase 3 — Escala

Emprego e cursos, protocolo municipal, dados abertos anonimizados, onboarding self-service de município, branding por tenant.

---

## 8. Qualidade e acessibilidade no CI

| Verificação | Ferramenta | Bloqueia merge? |
| --- | --- | --- |
| Tipos, lint, a11y estático | tsc, ESLint + jsx-a11y | Sim |
| Unitários / integração | Vitest; Testcontainers (Postgres real com RLS) | Sim |
| Isolamento multi-tenant | Suíte dedicada + checagem de `pg_policies` | Sim |
| Golden set da triagem | Vitest | Sim (zero falso negativo vermelho) |
| E2E web + axe | Playwright + @axe-core/playwright | Sim |
| Mobile (Flutter) | `flutter analyze`, widget + golden tests, `meetsGuideline` (contraste, alvo de toque, rótulo), Patrol para e2e | Sim nas branches de fase |
| Orçamento da web leve | Lighthouse CI (3G, < 100 KB, ≤ 3 s) | Sim |
| Contraste dos tokens | Script em `design-tokens` | Sim |
| Segurança | CodeQL/Semgrep, `pnpm audit`, secret scanning, ZAP em homolog | Sim (alta/crítica) |
| Leitor de tela real | Roteiro manual TalkBack + VoiceOver por release (RNF-A02) | Gate de release |

---

## 9. Decisões que preciso de vocês

| # | Decisão | Minha recomendação |
| --- | --- | --- |
| D1 | NestJS ou Fastify puro | **NestJS** (adapter Fastify): RBAC e auditoria por interceptor compensam o peso |
| D2 | Nuvem | A que a Phoenyx já opera com região no Brasil; preferir uma que tenha GPU no país para o Whisper |
| D3 | Modelo de oferta: 1 voluntário por pedido (PRD) ou por item (mockup) | **Por item** para alimento/material escolar; 1 por pedido para móvel |
| D4 | WhatsApp direto na Cloud API ou via BSP | BSP brasileiro se a prefeitura não tiver equipe para operar a verificação Meta |
| D5 | Fornecedor do LLM da triagem | Decidir junto com o RIPD; exigir processamento no Brasil ou base legal de transferência documentada |
| D6 | Painéis em Next.js ou SPA Vite | **Next.js**: roteamento, layouts e SSR do login prontos; como é tudo autenticado, também funcionaria como SPA Vite sem perda grande |
| D7 | App em Flutter ou Expo | ✅ **Decidido: Flutter** (Android via APK, iPhone via Mac) |
| D8 | Fonte do DS | Nunito Sans, validando Atkinson Hyperlegible Next em teste com baixa visão |

---

## 10. Riscos técnicos principais

| Risco | Mitigação |
| --- | --- |
| RLS burlada por conexão sem `set_config` | Default do role sem tenant = zero linhas; teste de isolamento obrigatório no CI |
| Falso negativo vermelho | Regra antes do modelo, fail-closed, golden set bloqueante, revisão por amostragem (RF-306) |
| Erro de transcrição apagando termo de risco | Léxico inclui variantes fonéticas; áudio original guardado para o técnico ouvir |
| Custo de LLM/WhatsApp/transcrição fora de controle | Medição por tenant desde a Fase 0, franquia e alerta em 80% |
| Atraso externo (Meta, gov.br, Procuradoria) | Começam na pré-fase; OTP e web leve como fallback |
| Acessibilidade deixada para o fim | Componentes base já nascem testados com leitor de tela na Fase 0; gate por sprint |
