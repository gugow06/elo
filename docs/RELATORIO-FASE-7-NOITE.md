# Relatório da noite: fase 7 (19/11/2026, ~03h55 às ~05h10)

Tudo está na branch **`feat/fase-7`**, só em commits locais: **sem push e sem PR**, como você pediu. A branch foi refeita sobre a `feat/login-google-email` (PR #9), porque a fase 7 depende do login novo. A `main` e o GitHub não foram tocados.

## Como está ao terminar

| Verificação | Resultado |
| --- | --- |
| API: typecheck + testes | ✅ 84 testes (eram 41 antes da noite) |
| App: `flutter analyze` + testes | ✅ sem avisos, 15 testes |
| Painel: typecheck + lint dos arquivos novos | ✅ |
| Pipeline de dados (área 2) | ✅ 9 testes |
| Triagem (área 1) | ✅ 11 testes. Só passam **sem** `LLM_URL` no ambiente, como no CI; o código da área 1 não mudou |
| Containers locais (API e painel) | ✅ reconstruídos com o código novo e saudáveis |
| Banco local | ✅ seed limpo de desenvolvimento + 5.571 municípios do IBGE |

## O que foi feito (18 commits)

1. **Perfil e verificação da conta.** Seção "Verificação da conta" no Perfil: e-mail confirmado, **verificação em duas etapas por e-mail** (ativar/desativar sempre com código) e selo **"Verificado"**. Foto, aplicativo autenticador e gov.br aparecem como "em breve". Com as duas etapas ativas, o login com Google pede também o código do e-mail. Saíram o texto "Pede e oferece ajuda no seu bairro" e o rodapé de protótipo.
2. **Base geográfica real.** Os 27 estados e 5.571 municípios do IBGE com coordenadas, importados ao subir a API (`pnpm db:ibge`). Busca de estado ou cidade sem acento e busca de endereço gratuita (Photon/OpenStreetMap) passando pela API, com cache e no máximo 1 consulta por segundo. Testei a busca real: "Avenida Paulista 1578" acha o MASP.
3. **Locais da rede no painel.** Página nova "Locais da rede": o gestor cadastra **ponto de coleta, assistência social (CRAS/CREAS/Centro POP), abrigo, ponto de distribuição e saúde**. Busca pelo nome do lugar ou endereço, confere o ponto num mapa do OpenStreetMap e edita ou desativa. Ponto de coleta novo gera a chave do sensor IoT, mostrada uma única vez. Técnico só consulta.
4. **Todos os pedidos.** "Ver todos" abre uma lista com **busca por estado ou cidade**, categoria e **"Ordenar por"**: meu bairro primeiro, mais recentes ou aguardando há mais tempo. Dá para ajudar pedido de outra cidade.
5. **Pedido com itens.** Cada pedido tem itens; quem ajuda **escolhe o que vai levar** ("Quero ajudar com 2 itens"); o pedido mostra **"N pessoas ajudando"**, sem nomes nem fotos. Em "Meus pedidos", quem pediu **marca o que já recebeu** (checklist com progresso). Com tudo marcado, o pedido conclui e **todas** as pessoas que ajudaram recebem "Sua ajuda chegou". Móvel continua com uma pessoa só.
6. **Mapa real.** `flutter_map` com OpenStreetMap no lugar do mapa desenhado. Abre **onde a pessoa está**; sem permissão, no bairro do cadastro; sem ele, no centro do Brasil. **Busca de cidade, estado ou endereço**, botão "minha localização", locais por tipo, pedidos só agregados por bairro, card com distância por extenso, lista ordenada por distância. A localização fica no celular e a API não guarda.
7. **Pronto para produção.**
   - O modo demonstração agora depende das variáveis `MODO_DEMO` e `SEED_DEMO`: local continua ligado para você testar; em produção é só desligar.
   - O **painel entra por e-mail** (o SMS simulado não funcionaria em produção).
   - **Criar conta em qualquer cidade do Brasil**: a pessoa escolhe a cidade do IBGE e o bairro da lista ou digitado.
   - Comando **`pnpm gestor:criar`** cria o primeiro gestor de um município real.
   - Página **"Equipe"**: o gestor convida técnicos por e-mail.
8. **Documentação.** READMEs com os endpoints novos, as telas e o passo a passo "Rodar com dados reais"; andamento no `PLANO-FASE-7.md`.

## Decisões que tomei por você (fáceis de trocar)

| Decisão | O que fiz | Onde mudar |
| --- | --- | --- |
| F7-D3 tipos de local | Os 5 tipos acima | `api/src/locais/locais.controller.ts` e `008_local_rede.sql` |
| F7-D4 quem marca "recebido" | Quem pediu marca; quem ajuda escolhe o que vai levar | `api/src/rede/rede.controller.ts` |
| F7-D11 "prioridade" | "Aguardando há mais tempo" (a faixa de risco nunca aparece no app) | `ORDENS` em `rede.controller.ts` |
| Bairro digitado no cadastro | Vira bairro do município (sem coordenadas até o gestor completar) | `resolverBairro` em `auth.controller.ts` |

## Pendente: precisa de você

1. **Foto de perfil (F7-D5 e F7-D8).** Quem vê a foto (recomendo: só a pessoa e a equipe do CRAS) e onde guardar (recomendo: storage compatível com S3, MinIO no local). Não implementei sem isso.
2. **Município sem equipe do CRAS (F7-D10).** O que fazer com pedido amarelo/vermelho de cidade onde ninguém usa o painel.
3. **Dados de desenvolvimento no mapa.** Os bairros do seed são fictícios e **não têm coordenadas**, então **o mapa abre vazio** com os dados de teste. Para ver marcadores, cadastre um local no painel (gestor) perto de você. Não inventei posição real para dado fictício.
4. **LGPD e Google.** Política de privacidade, termos, consentimento e exclusão de conta precisam de texto; publicar o app OAuth no Google precisa disso e de domínio.
5. **Domínio para o Resend.** Sem domínio verificado, o código só chega no e-mail dono da conta Resend.
6. **Revisar e aprovar** antes de push/PR. O PR #9 continua aberto e a fase 7 está empilhada sobre ele.

## Como testar

- **API e painel**: já estão no ar (`docker compose ps`). Painel em http://localhost:3000, conta de teste "Secretaria · Gestão" (aparece na tela de entrar; o código aparece na tela no modo demo).
  - Gestão → **Locais da rede** → "Novo local" → busque um lugar real perto de você → confira no mapa → Cadastrar.
  - Gestão → **Equipe** → convide alguém.
- **App no celular**: APK novo em `area3-mvp-iot/app/build/app/outputs/flutter-apk/app-release.apk` (assinado com a sua chave, Google configurado, API em `192.168.15.22:3333`). Desinstale o anterior antes.
  - **Mapa**: aceite a localização. Os locais cadastrados no painel aparecem; busque outra cidade.
  - **Início → Ver todos**: busque "SP" e mude a ordem.
  - **Pedido do mural**: escolha itens → "Quero ajudar com N itens".
  - **Perfil**: "Verificação da conta" → Ativar (código no e-mail; no modo demo aparece na tela) → selo "Verificado".
  - **Criar uma conta**: escolha uma cidade real e digite um bairro.
- **Web**: http://127.0.0.1:8090 (para o Google na web ainda falta a origem no cliente Web do Google Cloud).

## Observações técnicas

- **Quebra de linha.** Editar arquivo com Python no Windows grava CRLF. Num `.sh`, isso quebrou o build da API no Docker (corrigido). Os arquivos commitados estão todos com LF.
- **Bug achado na verificação.** O Postgres devolvia as categorias do local como texto e não como lista; o painel quebrava. Corrigido e coberto por teste.
- **Bug achado na verificação.** O mapa carregava a área antes de ter altura e mostrava "Nada nesta área". Corrigido: agora recarrega ao aparecer, ao buscar e ao mover.
- **Lint antigo.** O `shell.tsx` do painel já tinha 1 erro de lint (`setState` no efeito) antes da noite; o CI não roda lint no painel. Não mexi.
- **Prints da entrega.** Não gerei os prints do PDF: você pediu para esperar a sua ordem.
