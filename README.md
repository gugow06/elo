# ELO

**Plataforma municipal de mobilização solidária e triagem da demanda socioassistencial.**

O ELO conecta a solidariedade que já existe no bairro à rede pública de assistência social. O cidadão pede ajuda, a plataforma **classifica o pedido por risco**: o que a comunidade pode resolver vai para os voluntários do território; o que indica violação de direitos nunca é exposto e vai direto para a equipe técnica do CRAS, com alerta.

Projeto da **FIAP Global Solution 2026/2: CitizenTech** (Engenharia de Software, 4º ano).

> Todos os dados do projeto são **fictícios**. Nenhum dado real de cidadão é usado.

## Organização por área

| Pasta | Área da Global Solution | Conteúdo |
| --- | --- | --- |
| [`area1-ia/`](area1-ia/) | IA e automação | Triagem por risco: regras determinísticas + LLM, avaliação |
| [`area2-dados/`](area2-dados/) | Big Data e visualização | Gerador de dados, pipeline bronze → prata → ouro, funções analíticas |
| [`area3-mvp-iot/`](area3-mvp-iot/) | MVP, IoT e experiência digital | API, painel web, app Flutter, Ponto de Coleta Inteligente (IoT) |
| [`area4-devops/`](area4-devops/) | DevOps, segurança e qualidade | Docker, CI, práticas de segurança, plano de testes |
| [`docs/`](docs/) | — | Plano de implementação e arquitetura |

## Como rodar

**Pré-requisitos:** Docker Desktop (com Docker Compose) e Git. Para desenvolver sem Docker: Node.js 22 e pnpm 9.

```bash
git clone <url-do-repositorio> elo
cd elo
cp .env.example .env
docker compose up -d --build
```

Verificação:

```bash
curl http://localhost:3333/saude
# {"status":"ok","banco":"ok",...}
```

Na primeira subida, a API aplica as migrações e carrega os dados fictícios de demonstração.

### Desenvolvimento sem Docker (opcional)

```bash
pnpm install
docker compose up -d db          # só o PostgreSQL
pnpm db:migrate
pnpm db:seed
pnpm --filter @elo/api dev       # API em http://localhost:3333
pnpm test                        # testes de todos os pacotes
```

## Arquitetura

O plano completo, com a arquitetura e o mapeamento para a rubrica, está em [`docs/PLANO-IMPLEMENTACAO.md`](docs/PLANO-IMPLEMENTACAO.md).

## Uso de IA generativa

> **A preencher pelo grupo antes da entrega** (exigência da FIAP): ferramentas de IA generativa utilizadas e para quê.

## Integrantes

Ver `integrantes.txt` na entrega.
