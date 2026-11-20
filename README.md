<div align="center">

<img src="images/elo-logo.svg" alt="ELO" width="200" />

### Cidadãos conectam. Comunidades fortalecem. O município avança.

**Plataforma municipal de mobilização solidária e triagem da demanda socioassistencial.**

[![CI](https://github.com/gugow06/elo/actions/workflows/ci.yml/badge.svg)](https://github.com/gugow06/elo/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-Fastify-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-pandas-3776AB?logo=python&logoColor=white)
![Flutter](https://img.shields.io/badge/Flutter-Android%20%7C%20iOS-02569B?logo=flutter&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

[Sobre](#-sobre) · [Como funciona](#-como-funciona) · [Arquitetura](#-arquitetura) · [Começando](#-começando) · [Global Solution](#-as-4-áreas-da-global-solution) · [Qualidade](#-qualidade-e-segurança) · [Roadmap](#-roadmap) · [Equipe](#-equipe)

</div>

> 🎬 **Vídeo pitch:** [https://youtu.be/MlCGgcn2TPs](https://youtu.be/MlCGgcn2TPs) · 📄 **Documentação (PDF):** [padrão ABNT](docs/ELO-documentacao.pdf) · [versão livre](docs/ELO-documentacao-livre.pdf) · 🔌 **Simulação do ponto de coleta (Wokwi):** _[link público]_

## 👥 Equipe

| Nome | RM |
| --- | --- |
| Gustavo Cristiano Pessoa de Souza | 551924 |
| Ricardo Akira Kato Lopes | 551447 |
| Kevin Richard Xavier | 551736 |
| Vinicius do Carmo Fonseca Freitas | 97599 |
| Gustavo Medeiros Miranda da Silva | 552093 |

---

## 💡 Sobre

A equipe do CRAS é pequena para a demanda que recebe. Boa parte dos pedidos que chegam (cesta básica, roupa, colchão, material escolar) **não precisa de um técnico de nível superior: precisa de um vizinho disponível.** Ao mesmo tempo, quem quer ajudar não sabe quem precisa, e quem precisa não quer se expor, com razão.

O **ELO** conecta a solidariedade que já existe no bairro à rede pública de assistência social, com a **prefeitura como fiadora da confiança**:

- 🟢 **O que a comunidade pode resolver** vai para os voluntários do próprio território, sem expor endereço nem nome.
- 🟡 **O que exige contato pessoal** passa por aprovação técnica.
- 🔴 **O que indica violação de direitos** nunca é exposto: vai direto para a equipe do CRAS, com alerta.

> O sistema SUAS registra o atendimento; **o ELO faz a demanda chegar e mobiliza quem pode atender.**

Projeto desenvolvido para a **FIAP Global Solution 2026/2: CitizenTech** (Engenharia de Software, 4º ano).

> [!NOTE]
> Todos os dados do projeto são **fictícios**. Nenhum dado real de cidadão é usado, nem em testes.

---

## ⚙️ Como funciona

```mermaid
flowchart LR
    A([Cidadã pede ajuda<br/>app · WhatsApp · balcão]) --> B{Triagem<br/>por risco}
    B -- 🟢 verde --> C[Mural do bairro<br/>sem endereço, sem nome]
    B -- 🟡 amarela --> D[Fila do técnico<br/>aprovação de pareamento]
    B -- 🔴 vermelha --> E[Fila do CRAS<br/>com alerta imediato]
    C --> F[Voluntária assume]
    F --> G[[Ponto de Coleta Inteligente<br/>protocolo + balança]]
    G --> H([Família retira com o<br/>código de 4 números])
    G --> I([Voluntária recebe<br/>“Sua ajuda chegou”])
    C -. sem voluntário no prazo .-> E
    H & I --> J[(Dashboard de gestão)]
```

### Triagem por risco: o núcleo do produto

Todo pedido é classificado **antes** de ter qualquer visibilidade.

| Etapa | O que acontece |
| --- | --- |
| **1. Regras determinísticas** | 11 regras versionadas (violência, abuso, ameaça, risco à vida, criança/idoso em risco, fome aguda, situação de rua…). Qualquer acerto força 🔴 **sem consultar nenhum modelo**. |
| **2. Minimização** | Nome, CPF, telefone, e-mail e endereço são removidos do texto antes de qualquer modelo (LGPD). |
| **3. Modelo** | LLM (qualquer endpoint `/v1/chat/completions`) ou classificador offline. Saída estruturada: faixa, categoria, confiança e justificativa. |
| **4. Falha segura** | Confiança abaixo do limiar, erro ou timeout ⇒ 🔴 fila do técnico. **Na dúvida, escalar; nunca expor.** |

O cidadão **nunca vê a faixa de risco**: ele recebe só "Recebemos o seu pedido", um protocolo de 6 dígitos (dá para falar e anotar em papel) e um **código de retirada de 4 números**, que só ele vê.

### No app

- **Início pela localização do aparelho**: pedidos por perto (até 30 km), com banners e atalhos. A conta é criada sem escolher bairro: ele vem da localização.
- **Mapa da rede** com "Você está aqui", locais da rede e pedidos agregados por bairro (nunca a casa de ninguém), e uma visão em lista para leitor de tela.
- **Mensagens**: conversa entre quem pediu e quem está ajudando, e uma aba de **notificações do sistema** ("Sua ajuda chegou", "Sua doação está no ponto").
- **Privacidade**: Termos de Uso e Política de Privacidade aceitos ao criar a conta e disponíveis no Perfil; **exclusão de conta** apaga os dados pessoais e anonimiza o histórico.

### Ponto de Coleta Inteligente (IoT)

A doação é entregue sempre num ponto de coleta, nunca na casa da família. No ponto, a voluntária digita o protocolo num teclado e deposita a doação na balança: o sistema confirma a entrega, avisa a família e devolve **"Sua ajuda chegou"** para quem ajudou. Para **retirar**, quem pediu digita o protocolo e o código de retirada (5 erros bloqueiam por 1 hora). No painel, o agente do ponto também registra entregas e retiradas, e tudo fica num **registro** (log).

| Sensor | Função |
| --- | --- |
| ⚖️ Peso (potenciômetro no Wokwi, FSR no Tinkercad, célula de carga + HX711 no hardware real) | Detecta o depósito e mede o estoque do ponto |
| 🌡️ Temperatura (NTC no Wokwi, TMP36 no Tinkercad) | Conservação dos alimentos, com alerta |

---

## 🏗️ Arquitetura

```mermaid
flowchart TB
    subgraph Clientes
        APP[📱 App Flutter<br/>cidadão: pede e ajuda]
        PAINEL[🖥️ Painel web Next.js<br/>técnico · gestão · agente do ponto]
        IOT[📟 Ponto de Coleta<br/>Arduino no Wokwi / simulador]
    end

    subgraph API[API NestJS + Fastify]
        AUTH[Login sem senha<br/>e-mail ou Google · JWT + perfis]
        SOL[Solicitações]
        TRI[Triagem<br/>regras → LLM → falha segura]
        REDE[Mural · ofertas · conversas<br/>entrega · retirada · registro]
        DEV[Eventos IoT]
        SSE[Tempo real · SSE]
        SLA[Escalonamento por SLA]
    end

    subgraph PG[PostgreSQL 16]
        PUB[(public<br/>operacional)]
        BR[(bronze)] --> PR[(prata<br/>anonimizado)] --> OU[(ouro<br/>modelo estrela)]
    end

    APP & PAINEL --> AUTH
    IOT -- X-Device-Key --> DEV
    SOL --> TRI
    API --> PUB
    PUB -- pipeline Python --> BR
    OU --> PAINEL
```

### Stack

| Camada | Tecnologia |
| --- | --- |
| API | Node.js 22 · NestJS 12 sobre Fastify · Zod · `pg` · JWT (jose) |
| Triagem | TypeScript puro · regras em JSON versionado · LLM Gemini (qualquer endpoint `/v1/chat/completions`) · classificador offline |
| Banco | PostgreSQL 16 · migrações SQL versionadas · camadas bronze/prata/ouro |
| Dados | Python · pandas · SQLAlchemy · Faker |
| Painel web | Next.js 16 · Tailwind · Apache ECharts |
| App | Flutter (Android, iOS e web) · OpenStreetMap (`flutter_map`) · localização do aparelho |
| IoT | Arduino Uno (Wokwi e Tinkercad) · simulador e ponte serial em Python |
| DevOps | Docker Compose · GitHub Actions · Vitest · pytest |

---

## 🚀 Começando

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) com Docker Compose
- Git
- *(desenvolvimento)* Node.js 22 e pnpm 9 · Python 3.12+ · Flutter 3

### Subindo tudo

```bash
git clone https://github.com/gugow06/elo.git
cd elo
cp .env.example .env
docker compose up -d --build
```

| Serviço | Endereço |
| --- | --- |
| 🖥️ Painel (técnico e gestão) | http://localhost:3000 |
| ⚙️ API | http://localhost:3333/saude |
| 📱 App (navegador) | `cd area3-mvp-iot/app && flutter run -d chrome --dart-define=API_URL=http://localhost:3333` |

Na primeira subida, a API aplica as migrações e carrega os dados fictícios, e o pipeline gera 6 meses de histórico para o dashboard. Para usar a triagem com LLM, preencha `LLM_URL`, `LLM_API_KEY` e `LLM_MODELO` no `.env`. Sem isso, a triagem usa as regras + o classificador offline.

### Contas de demonstração

O login é **sem senha**: informe o e-mail (no app e no painel) e use o código de 6 dígitos. No modo demonstração (`MODO_DEMO=true`, padrão do `.env.example`), o código aparece na tela e no log (`docker compose logs api`). A API também aceita o telefone no lugar do e-mail. No app dá para entrar com a conta Google (veja [`area3-mvp-iot/app/README.md`](area3-mvp-iot/app/README.md)).

| Perfil | Pessoa (fictícia) | E-mail | Telefone |
| --- | --- | --- | --- |
| Cidadã (app) | Ana Paula Ribeiro · Jardim São Pedro | `ana.ribeiro@example.com` | `+5511990000001` |
| Cidadã (app) | Maria das Dores Lima · Vila Nova | `maria.lima@example.com` | `+5511990000002` |
| Cidadã que ajuda (app) | Cláudia Martins · Vila Nova | `claudia.martins@example.com` | `+5511990000004` |
| Técnica do CRAS (painel) | Fernanda Costa | `fernanda.costa@example.com` | `+5511990000006` |
| Gestão (painel) | Secretaria de Assistência Social | `secretaria.social@example.com` | `+5511990000007` |
| Agente do ponto (painel) | Joana Pereira | `joana.pereira@example.com` | `+5511990000010` |
| Técnica de outro município (painel) | Patrícia Gomes | `patricia.gomes@example.com` | `+5511990000009` |

### O fluxo completo em 1 minuto

```bash
# 1. Ana entra e pede ajuda
curl -s -X POST localhost:3333/auth/codigo -H 'content-type: application/json' -d '{"email":"ana.ribeiro@example.com"}'
curl -s -X POST localhost:3333/auth/entrar -H 'content-type: application/json' -d '{"email":"ana.ribeiro@example.com","codigo":"<código>"}'
curl -s -X POST localhost:3333/solicitacoes -H 'authorization: Bearer <token-da-ana>' -H 'content-type: application/json' \
  -d '{"relato":"Perdi o emprego e preciso de uma cesta básica para meus dois filhos"}'

# 2. Cláudia (voluntária) vê o mural e assume o pedido
curl -s localhost:3333/mural -H 'authorization: Bearer <token-da-claudia>'
curl -s -X POST localhost:3333/mural/<id-do-pedido>/ofertas -H 'authorization: Bearer <token-da-claudia>'

# 3. No ponto de coleta: protocolo + balança
cd area3-mvp-iot/iot/simulador
python simulador.py entrega --protocolo <protocolo> --kg 8

# 4. Ana retira com o código de retirada (aparece no app dela, em "Meus pedidos")
python simulador.py retirada --protocolo <protocolo> --codigo <código-de-retirada>
```

O mesmo fluxo pelas telas: Ana pede ajuda no app → Cláudia toca em "Quero ajudar" → a agente Joana registra a entrega em **Receber doação** e a retirada em **Retirar doação** no painel (http://localhost:3000) → tudo aparece em **Registro**.

### Desenvolvimento sem Docker

```bash
pnpm install
docker compose up -d db        # só o PostgreSQL
pnpm db:migrate && pnpm db:seed
pnpm --filter @elo/triagem build
pnpm --filter @elo/api dev     # http://localhost:3333
```

---

## 🎓 As 4 áreas da Global Solution

| | Área | Onde | Destaques |
| --- | --- | --- | --- |
| 🧠 | **IA e automação** | [`area1-ia/`](area1-ia/) | Triagem por risco com regras antes do modelo, prompt documentado, falha segura e avaliação em conjuntos de treino e validação |
| 📊 | **Big Data e visualização** | [`area2-dados/`](area2-dados/) | Gerador de dados fictícios, pipeline bronze → prata → ouro com anonimização, modelo estrela e funções analíticas em SQL |
| 📱 | **MVP, IoT e experiência digital** | [`area3-mvp-iot/`](area3-mvp-iot/) | API, painel web, app Flutter e Ponto de Coleta Inteligente com 2 sensores (Wokwi, Tinkercad e simulador) |
| 🛠️ | **DevOps, segurança e qualidade** | [`area4-devops/`](area4-devops/) | Docker Compose, CI no GitHub Actions, práticas de segurança e plano de testes |

### Resultados da triagem

| Conjunto | Acurácia da faixa | Recall da faixa 🔴 | Falsos negativos 🔴 |
| --- | --- | --- | --- |
| Treino (60 relatos, léxico v1) | 95,0% | 86,7% | 2 |
| Treino (60 relatos, léxico v2) | 100,0% | **100,0%** | **0** |
| Validação, classificador offline | 90,0% | 100,0% | 0 |
| **Validação, Gemini 3.5 Flash-Lite + prompt v2** (20 relatos nunca usados nos ajustes) | **100,0%** | **100,0%** | **0** |

Detalhes, matriz de confusão e limitações em [`area1-ia/README.md`](area1-ia/README.md).

---

## 🛡️ Qualidade e segurança

**Segurança e LGPD**

- 🔐 Login sem senha: código de uso único por e-mail, com validade de 10 minutos e guardado como hash, ou conta Google (token conferido). Verificação em duas etapas opcional. JWT com expiração e autorização por perfil.
- 🔑 Retirada protegida: código de 4 números que só quem pediu vê; 5 erros bloqueiam por 1 hora; entregas, retiradas e códigos errados ficam registrados.
- 🗑️ Direitos do titular: aceite dos Termos e da Política de Privacidade (com versão registrada) e exclusão de conta com anonimização.
- ✅ Validação de toda entrada com Zod, inclusive no endpoint IoT.
- 🧾 Auditoria append-only, que registra também a **leitura** de dado sensível.
- 🙈 Mural sem endereço, nome ou relato. Relato original em tabela separada. Pedido 🔴 nunca é público.
- ✂️ Minimização antes do LLM e anonimização no pipeline de dados.
- 📟 Dispositivos IoT autenticados por chave do ponto (hash + comparação em tempo constante).
- 🏙️ Isolamento entre municípios coberto por teste automatizado.

**Testes e CI**: 187 testes automatizados: triagem 11, API 143, pipeline 9 e app 24 (última execução do CI na `main`).

```bash
docker compose up -d db
bash scripts/testar-tudo.sh      # todos os testes, com as saídas salvas em area4-devops/evidencias/
```

A cada push, o GitHub Actions roda os testes da API, da triagem e do pipeline com PostgreSQL, a avaliação da IA, a análise e os testes de acessibilidade do app, gera o APK, faz o build das 4 imagens Docker e sobe a stack verificando a saúde. Detalhes em [`area4-devops/README.md`](area4-devops/README.md).

---

## 🌍 Impacto e ODS

| ODS | Contribuição |
| --- | --- |
| **2** Fome zero | Doação de alimentos mediada e rastreável até a família |
| **10** Redução das desigualdades | Atendimento por vários canais, acessibilidade como requisito e métrica de equidade por canal |
| **11** Cidades e comunidades sustentáveis | Rede de solidariedade por bairro integrada à política pública |

---

## 🗺️ Roadmap

- [x] Fundação: monorepo, banco, API, Docker e CI
- [x] Triagem por risco com avaliação
- [x] Rede cidadã: mural, ofertas, devolutiva e escalonamento por SLA
- [x] Ponto de Coleta Inteligente: API, sketch Tinkercad e simulador
- [x] Pipeline de dados bronze → prata → ouro e funções analíticas
- [x] Painel web: fila do técnico e dashboard de gestão
- [x] App Flutter: cidadão e voluntário (Android, iOS e web)
- [x] Triagem com LLM (Gemini) e avaliação em conjunto de validação
- [x] Dados reais (IBGE), mapa com localização do aparelho, itens do pedido e retirada com código
- [x] Conversas entre cidadãos, notificações do sistema, termos, privacidade e exclusão de conta
- [x] Painel do agente do ponto: receber, retirar e registro
- [ ] Canais WhatsApp e URA 0800, web leve sem JavaScript
- [ ] Credenciamento de voluntários e faixa amarela com visita

A visão completa de produto está em [`docs/PLANO-IMPLEMENTACAO.md`](docs/PLANO-IMPLEMENTACAO.md). Arquitetura detalhada: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## 📁 Estrutura

```
elo/
├─ area1-ia/            🧠 Triagem por risco (regras, prompt, LLM, avaliação)
├─ area2-dados/         📊 Gerador, pipeline bronze/prata/ouro, SQL analítico
├─ area3-mvp-iot/
│  ├─ api/              NestJS + Fastify + PostgreSQL
│  ├─ painel/           Next.js: fila do técnico e gestão
│  ├─ app/              Flutter: cidadão e voluntário
│  └─ iot/              Sketch Arduino (Wokwi e Tinkercad), simulador e ponte serial
├─ area4-devops/        🛠️ Segurança, plano de testes e evidências
├─ docs/                Documentação (texto do PDF), arquitetura, plano e roteiro do pitch
├─ scripts/             testar-tudo.sh (roda todos os testes e salva evidências)
├─ images/              Identidade visual
├─ docker-compose.yml
└─ .github/workflows/   CI
```

---

## 🤖 Uso de IA generativa

| Ferramenta | Para quê |
| --- | --- |
| Claude Code (Anthropic) | Assistente de desenvolvimento: geração e revisão de código (API, app, painel, testes e CI), documentação, roteiro e montagem do vídeo pitch e auditoria de segurança automatizada (skill [security-audit](https://github.com/cloudflare/security-audit-skill), da Cloudflare) |
| Gemini 3.5 Flash-Lite (Google) | Parte do produto: modelo de linguagem da triagem por risco, avaliado nos conjuntos de treino e validação ([área 1](area1-ia/README.md)) |
| Voz neural pt-BR da Microsoft (edge-tts) | Narração do vídeo pitch |

Todo o conteúdo gerado foi revisado pelo grupo, e cada integrante entende e sabe explicar a solução, as decisões de arquitetura e o código da sua área. Os dados do projeto são fictícios, e nenhum dado pessoal real foi enviado a ferramentas de IA.

---

<div align="center">
<sub>Projeto acadêmico · FIAP Global Solution 2026/2 · CitizenTech</sub>
</div>
