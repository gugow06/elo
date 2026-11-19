# Roteiro do vídeo pitch (até 3 minutos)

Regras: até 3 min, link público (YouTube não listado serve), **mostrar o protótipo funcionando**, sem slides lidos. O link vai no `.txt` e no README.

**Preparação (antes de gravar):**

```bash
docker compose up -d --build                     # API, painel, pipeline
cd area3-mvp-iot/app && flutter run -d chrome --dart-define=API_URL=http://localhost:3333
```

Janelas abertas: app (Chrome, em formato de celular, ou o celular espelhado), painel em `http://localhost:3000` (técnica e gestão), terminal com o simulador do ponto de coleta e o circuito no Tinkercad.

| Tempo | Bloco | Fala (sugestão) | Na tela |
| --- | --- | --- | --- |
| **0:00–0:30** | O problema | "A Fernanda é assistente social e acompanha milhares de famílias. Boa parte dos pedidos que chegam ao CRAS é cesta básica, roupa, colchão: coisas que um vizinho poderia resolver. Ao mesmo tempo, quem quer ajudar não sabe quem precisa, e quem precisa não quer se expor." *Usar um número real de fonte oficial (ex.: famílias no CadÚnico do município, MDS/VIS Data).* | Rosto ou tela inicial do app |
| **0:30–0:50** | A solução | "O ELO conecta a solidariedade do bairro à rede pública. A prefeitura é a fiadora: uma IA classifica cada pedido por risco. O que a comunidade resolve vai para os voluntários do bairro; o que é risco vai direto para o CRAS, sem nunca ser exposto." | Tela Início do app |
| **0:50–1:20** | Demo 1: pedido e triagem | Ana pede "perdi o emprego e preciso de cesta básica" → recebe o protocolo. Em seguida, um relato de violência → mesma mensagem neutra para a cidadã, mas **alerta vermelho** no painel da técnica. "O cidadão nunca vê a faixa de risco, e o caso de violência nunca aparece no mural." | App → painel (fila com alerta) |
| **1:20–1:50** | Demo 2: rede e IoT | Cláudia vê o mural (só bairro, sem nome ou endereço) → "Quero ajudar" → protocolo. No ponto de coleta: digita o protocolo e coloca a doação na balança (`simulador.py entrega`) → **"Sua ajuda chegou"** no app da Cláudia. | App → Tinkercad → terminal → app |
| **1:50–2:10** | Demo 3: dados e IA medida | Dashboard: o estoque do ponto mudou ao vivo; aba Território: "o Jardim São Pedro tem 47% dos pedidos escalados ao CRAS e só 0,06 voluntário por 200 habitantes: a gestão sabe onde recrutar". Aba Qualidade da IA: **recall de 100% nos casos de risco**. | Painel de gestão |
| **2:10–2:40** | Impacto | "O CRAS ganha tempo para os casos que só ele pode atender, quem ajuda sabe que a ajuda chegou, e a prefeitura enxerga a demanda por bairro. ODS 2, 10 e 11." | Aba Visão geral |
| **2:40–3:00** | Fechamento | "O sistema SUAS registra o atendimento; o ELO faz a demanda chegar e mobiliza quem pode atender. Cidadãos conectam, comunidades fortalecem, o município avança." | Logo do ELO |

**Dicas:**
- Grave as demos em partes e edite; ensaie com cronômetro.
- Dados da demo: as contas fictícias estão no README. O código de acesso aparece na tela.
- Antes de gravar a demo 2, deixe um pedido verde da Ana recém-criado para a Cláudia assumir.
- Teste o link do vídeo numa aba anônima.
