# Arquitetura do ELO

## Visão geral: as 4 áreas e como se conectam

```mermaid
flowchart TB
    subgraph A3[Área 3 · MVP e IoT]
        APP[📱 App Flutter<br/>cidadão · voluntário]
        PAINEL[🖥️ Painel Next.js<br/>fila do técnico · gestão]
        IOT[📟 Ponto de Coleta Inteligente<br/>peso + temperatura · teclado · LCD<br/>Tinkercad + simulador]
        API[API NestJS + Fastify]
    end

    subgraph A1[Área 1 · IA e automação]
        TRI[Triagem por risco<br/>1 regras determinísticas<br/>2 minimização<br/>3 LLM Gemini / offline<br/>4 falha segura]
        SLA[Automação: escalonamento<br/>por SLA ao CRAS]
    end

    subgraph A2[Área 2 · Big Data]
        PUB[(public<br/>operacional)]
        BR[(bronze)]
        PR[(prata<br/>anonimizada)]
        OU[(ouro<br/>modelo estrela +<br/>funções analíticas)]
        ETL[Pipeline Python<br/>a cada 15 min]
    end

    subgraph A4[Área 4 · DevOps]
        DC[Docker Compose]
        CI[GitHub Actions<br/>testes · imagens · APK]
    end

    APP -- HTTPS/JSON + JWT --> API
    PAINEL -- JSON + JWT · SSE --> API
    IOT -- X-Device-Key --> API
    API --> TRI
    TRI -- só texto minimizado --> LLM[(LLM externo)]
    API --> PUB
    SLA --> PUB
    PUB --> ETL --> BR --> PR --> OU
    OU -- papel somente leitura --> API
    DC -. sobe .- API & PAINEL & ETL & PUB
    CI -. valida .- A1 & A2 & A3
```

## Integração entre as áreas

| De → para | O que passa | Por quê |
| --- | --- | --- |
| IoT → API → app | Evento `entrega_depositada` | A balança confirma a entrega e dispara "Sua ajuda chegou" |
| IoT → dados → dashboard | Leituras de peso e temperatura | Estoque ao vivo, previsão de dias até zerar, alertas de calor |
| IA → dados → dashboard | Origem e tempo de cada decisão da triagem + avaliações | Aba "Qualidade da IA" (IA medida) |
| Dados → IA | Relatos fictícios rotulados | Conjuntos de avaliação de treino e validação |
| IA → rede cidadã | Faixa e ponto de coleta sugerido | Verde vai ao mural; vermelho nunca é exposto |

## Fluxo principal (sequência)

```mermaid
sequenceDiagram
    actor Ana as Ana (cidadã)
    participant App
    participant API
    participant Tri as Triagem
    actor Claudia as Cláudia (voluntária)
    participant Ponto as Ponto de Coleta (IoT)
    participant Painel as Painel (gestão)

    Ana->>App: "Perdi o emprego, preciso de cesta básica"
    App->>API: POST /solicitacoes
    API->>Tri: regras → minimização → LLM
    Tri-->>API: verde · alimento · confiança 0,95
    API-->>App: protocolo 482913 (sem a faixa)
    Claudia->>App: mural do bairro → "Quero ajudar"
    App->>API: POST /mural/{id}/ofertas
    API-->>App: protocolo + instruções do ponto
    Claudia->>Ponto: digita 482913 e deposita 8 kg
    Ponto->>API: entrega_depositada (Δ peso 8 kg)
    API-->>Ana: "Sua doação chegou, pode retirar"
    API-->>Claudia: "Sua ajuda chegou!"
    API-->>Painel: SSE: estoque atualizado ao vivo
```

## Contraprova: relato com indício de violência

```mermaid
sequenceDiagram
    actor C as Cidadã
    participant API
    participant Tri as Triagem
    actor F as Técnica do CRAS
    C->>API: "Meu marido me bate quando bebe"
    API->>Tri: regras determinísticas
    Tri-->>API: VERMELHA (regra violencia_fisica, LLM não é chamado)
    API-->>C: "Recebemos o seu pedido… a equipe do CRAS está cuidando"
    API-->>F: 🔔 alerta em tempo real + fila com prioridade
    Note over API: nunca aparece no mural, nenhum voluntário é notificado
```

## Tecnologias por área

| Área | Tecnologias |
| --- | --- |
| IA e automação | TypeScript, regras em JSON, Gemini via endpoint `/v1/chat/completions`, Vitest |
| Big Data | PostgreSQL 16 (schemas bronze/prata/ouro), Python, pandas, SQLAlchemy, Faker, SQL analítico, Apache ECharts |
| MVP e IoT | NestJS, Fastify, Zod, JWT, Next.js 16, Tailwind 4, Flutter, Arduino (Tinkercad), Python |
| DevOps | Git, GitHub, Docker, Docker Compose, GitHub Actions, pytest, flutter_test |
