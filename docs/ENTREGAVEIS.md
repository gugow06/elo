# Roteiro do PDF de entregáveis

Estrutura sugerida para o PDF exigido pela FIAP ("solução, arquitetura e evidências de cada área"). Cada item aponta de onde tirar o conteúdo. Marque os prints que ainda faltam.

## 1. Capa
- ELO · FIAP Global Solution 2026/2 · CitizenTech · nome do grupo e integrantes (RM).

## 2. Problema e cidadão (critérios 01 e 02)
- Persona e problema: [`README.md`](../README.md#-sobre) e PRD §2 e §6.
- Um dado real de fonte oficial (ex.: famílias no CadÚnico do município, MDS/VIS Data).

## 3. Solução e ecossistema (critérios 03 e 05)
- Como funciona e triagem: [`README.md`](../README.md#️-como-funciona).
- Ecossistema: cidadão, voluntário, técnico do CRAS, gestão municipal, pontos de coleta.

## 4. Arquitetura (área 3, item 04)
- Diagramas de [`docs/ARQUITETURA.md`](ARQUITETURA.md) (exportar o Mermaid como imagem em mermaid.live).

## 5. Área 1 — IA e automação
- [ ] Prompt v2 e regras: [`area1-ia/README.md`](../area1-ia/README.md).
- [ ] 3 exemplos de entrada e saída (verde, amarela, vermelha): print da fila e da ficha no painel.
- [ ] Métricas: tabela de avaliação + [`resultado-validacao-llm.md`](../area1-ia/triagem/avaliacao/resultado-validacao-llm.md) + print da aba "Qualidade da IA".
- [ ] Comparação antes × depois (léxico v1 × v2, prompt v1 × v2) e ganho de tempo (cronometrar a triagem manual).

## 6. Área 2 — Big Data
- [ ] Diagrama das camadas e tabela do modelo estrela: [`area2-dados/README.md`](../area2-dados/README.md).
- [ ] Log do pipeline: [`06-pipeline-execucao.txt`](../area4-devops/evidencias/06-pipeline-execucao.txt).
- [ ] Prints das 5 abas do dashboard, com pelo menos um filtro aplicado.
- [ ] SQL das funções analíticas: [`ouro_funcoes.sql`](../area2-dados/sql/ouro_funcoes.sql).

## 7. Área 3 — MVP, IoT e experiência digital
- [ ] Prints das telas do app (boas-vindas, início, mapa, lista, pedido, pedir ajuda, confirmação, meus pedidos) e do painel (login, fila, ficha, gestão).
- [ ] Print do circuito no Tinkercad + link público da simulação.
- [ ] Sequência do fluxo completo (pedido → triagem → mural → entrega no ponto → "Sua ajuda chegou").

## 8. Área 4 — DevOps, segurança e qualidade
- [ ] Print do GitHub Actions verde e do artefato do APK.
- [ ] Print do `docker compose ps` com os 4 serviços.
- [ ] Tabela de segurança e plano de testes: [`area4-devops/README.md`](../area4-devops/README.md).
- [ ] Evidências: arquivos de [`area4-devops/evidencias/`](../area4-devops/evidencias/).

## 9. Impacto, ODS e próximos passos (critério 06)
- ODS 2, 10 e 11 e métricas de impacto do PRD §14 (absorção pela rede, % fora do app, recall da vermelha).
- Roadmap: WhatsApp, URA 0800, credenciamento, faixa amarela com visita, botão SOS para idoso.

## 10. Uso de IA generativa
- Ferramentas usadas e para quê (exigência da FIAP), como declarado no README.
