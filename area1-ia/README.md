# Área 1 — IA e automação: triagem por risco

Todo pedido de ajuda passa pela triagem **antes** de ter qualquer visibilidade. Ela decide se o pedido pode ir ao mural do bairro (verde), se precisa de voluntário com aprovação técnica (amarela) ou se vai direto à equipe do CRAS com alerta, sem nunca ser exposto (vermelha).

## Como funciona

```
relato ─▶ normalização ─▶ REGRAS DETERMINÍSTICAS: termo de risco? ──sim──▶ VERMELHA (o modelo nem é chamado)
                                     │não
                                     ▼
              minimização (remove nome, CPF, telefone, e-mail, endereço)
                                     ▼
                   MODELO (LLM ou classificador offline) ─▶ { faixa, categoria, confianca, justificativa }
                                     ▼
               confiança < limiar (0,75)? ──sim──▶ VERMELHA (fila do técnico)
               erro / timeout do modelo?  ──sim──▶ VERMELHA (fila do técnico)
                                     ▼
                         faixa e categoria do modelo
```

Princípio: **na dúvida, escalar para o técnico, nunca expor.** Falso positivo custa tempo do técnico; falso negativo pode custar uma pessoa.

| Arquivo | O que é |
| --- | --- |
| [`triagem/src/lexico.json`](triagem/src/lexico.json) | Regras determinísticas de faixa vermelha (11 regras versionadas) |
| [`triagem/src/prompt.ts`](triagem/src/prompt.ts) | Prompt do modelo de linguagem |
| [`triagem/src/triar.ts`](triagem/src/triar.ts) | Orquestração: regras → minimização → modelo → limiar → falha segura |
| [`triagem/src/offline.ts`](triagem/src/offline.ts) | Classificador por palavras-chave, usado quando não há LLM configurado |
| [`triagem/src/llm.ts`](triagem/src/llm.ts) | Cliente para qualquer endpoint compatível com `/v1/chat/completions` |
| [`triagem/avaliacao/`](triagem/avaliacao/) | Conjuntos rotulados, script de avaliação e resultados |

## Como rodar

```bash
pnpm install
pnpm --filter @elo/triagem test                       # testes (T1, T2, T3)
pnpm --filter @elo/triagem avaliar                    # avaliação no conjunto de treino
pnpm --filter @elo/triagem avaliar validacao          # avaliação no conjunto de validação
```

Sem variáveis de ambiente, a triagem usa as regras + o classificador offline (funciona sem internet). Para usar um LLM, defina no `.env`:

```bash
LLM_URL=https://<provedor>/v1/chat/completions   # ou um servidor local compatível
LLM_API_KEY=<chave>
LLM_MODELO=<nome-do-modelo>
LLM_LIMIAR_CONFIANCA=0.75
```

## Prompt do modelo

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
```

A mensagem do usuário é `RELATO: """<relato já minimizado>"""`. A resposta é validada (faixa, categoria e confiança dentro do esperado). Resposta inválida conta como erro e vai para vermelha.

## Exemplos de entrada e saída

| Relato | Faixa | Categoria | Origem |
| --- | --- | --- | --- |
| "Perdi o emprego e preciso de uma cesta básica para meus dois filhos" | verde | alimento | modelo |
| "Sou idosa, moro sozinha e preciso de alguém para me ajudar a carregar o botijão" | amarela | apoio_idoso | modelo |
| "Meu marido me bate quando bebe e eu tenho medo de ficar em casa" | **vermelha** | — | regra `violencia_fisica` |

## Avaliação e ganho

Dois conjuntos rotulados à mão pelo grupo, com dados fictícios:

- **Treino** (`relatos.csv`, 60 casos: 30 verdes, 15 amarelos, 15 vermelhos): usado para escrever e ajustar as regras.
- **Validação** (`relatos-validacao.csv`, 20 casos): escrito depois e **nunca usado para ajustar regras**. Mede se a triagem generaliza.

| Versão | Conjunto | Acurácia da faixa | Recall da vermelha | Falsos negativos de vermelha |
| --- | --- | --- | --- | --- |
| Léxico v1 | treino | 95,0% | 86,7% | **2** |
| Léxico v2 | treino | 100,0% | 100,0% | 0 |
| Léxico v2 + offline | **validação** | 90,0% | **100,0%** | **0** |
| Léxico v2 + **Gemini 3.5 Flash-Lite** (prompt v2) | treino | 100,0% | 100,0% | 0 |
| Léxico v2 + **Gemini 3.5 Flash-Lite** (prompt v2) | **validação** | **100,0%** | **100,0%** | **0** |

**Prompt v1 × v2:** com o prompt v1 ("na dúvida, escolha a mais grave"), o modelo classificava pedidos comuns de cesta básica como vermelhos ("risco de fome aguda"). O prompt v2 explica o que é vermelho e traz 3 exemplos. Com ele, o LLM acertou os casos que o classificador offline errava na validação (ex.: "minha despensa está vazia e o salário só sai dia 10").

**Cota do provedor:** o plano gratuito do Gemini 2.5 Flash permite só 20 requisições por dia. A avaliação esgotou a cota, e todas as chamadas seguintes caíram em falha segura (vermelha), sem expor nenhum pedido. Por isso, a avaliação final usa o Gemini 3.5 Flash-Lite, com pausa de 6 s entre as chamadas.

**Antes × depois:** a v1 deixou passar 2 casos de risco ("companheiro não deixa eu sair de casa" e "menino vendendo no farol"). As duas regras foram ampliadas (v2). No conjunto de validação, os 2 erros que restam estão no lado seguro ou não envolvem risco: um verde que foi para o técnico por baixa confiança e um amarelo classificado como verde. Nenhum caso de risco ficou de fora.

**Ganho de tempo:** a triagem automática leva menos de 1 ms por relato com o classificador offline. Para comparar com o processo manual, cronometrar um integrante lendo e classificando os 20 relatos de validação e registrar aqui:

| Processo | Tempo por relato |
| --- | --- |
| Triagem manual (cronometrada) | _preencher_ |
| Triagem automática | < 1 ms (offline) · ~0,5–1,5 s (LLM) |

Relatórios completos: [`resultado.md`](triagem/avaliacao/resultado.md), [`resultado-validacao.md`](triagem/avaliacao/resultado-validacao.md), [`resultado-v1.md`](triagem/avaliacao/resultado-v1.md), [`resultado-llm.md`](triagem/avaliacao/resultado-llm.md), [`resultado-validacao-llm.md`](triagem/avaliacao/resultado-validacao-llm.md).

**Limitações:** os conjuntos são pequenos e escritos pelo próprio grupo. Em produção, o conjunto de avaliação seria rotulado por assistentes sociais e revisado periodicamente (RF-306).
