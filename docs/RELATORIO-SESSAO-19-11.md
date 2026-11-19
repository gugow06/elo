# Relatório da sessão: login, fase 7 e ajustes do dia (18 e 19/11/2026)

Tudo o que foi feito nesta conversa, do login novo até a simulação do Arduino no Wokwi. O trabalho da madrugada tem os detalhes em [RELATORIO-FASE-7-NOITE.md](RELATORIO-FASE-7-NOITE.md); aqui ele aparece resumido.

## Onde está

| PR | Branch | Commits | Situação |
| --- | --- | --- | --- |
| [#9](https://github.com/gugow06/elo/pull/9) Login com Google e e-mail, conta universal | `feat/login-google-email` → `main` | 9 | Aberto |
| [#10](https://github.com/gugow06/elo/pull/10) Fase 7 | `feat/fase-7` → `feat/login-google-email` | 31 | Aberto, empilhado sobre o #9 |

Ordem para mesclar: **#9 primeiro, depois #10** (o GitHub muda a base do #10 para `main` sozinho). Todos os commits estão só no seu nome (gugow06), sem coautoria.

| Verificação | Resultado |
| --- | --- |
| API (testes) | 132 passando |
| App Flutter (`analyze` + testes) | sem avisos, 21 passando |
| Painel (typecheck + lint dos arquivos novos) | limpo |
| Arduino (Wokwi CLI) | os dois sketches compilam; cenário de entrega e retirada passa |
| Versão web do app | http://127.0.0.1:8090, atualizada |
| APK | `area3-mvp-iot/app/build/app/outputs/flutter-apk/app-release.apk`, atualizado |

## 1. Login e conta (PR #9)

- Tela de boas-vindas do mockup: **"Entrar na minha conta"**, **"Criar uma conta"** e **"Ou continue com" Google**. Apple e Facebook saíram, como você pediu.
- Código de 6 dígitos por e-mail, pelo **Resend**. Google real, no celular e na web.
- **Conta universal:** não há mais escolha entre pedir e ajudar; todo mundo pede e oferece ajuda.
- Barra inferior com **Mensagens**; "Meus pedidos" e "Minhas ajudas" foram para o Perfil.
- Logo ajustada (`images/elo-logo-ajustada.svg`).

## 2. Fase 7, madrugada (PR #10)

Planejada em [PLANO-FASE-7.md](PLANO-FASE-7.md) e feita entre 3h e 5h:

- **Perfil:** verificação em duas etapas por e-mail, que dá o selo "Verificado". Saiu o texto "Pede e oferece ajuda no seu bairro".
- **Base real:** 27 estados e 5.571 municípios do IBGE.
- **Mapa real:** `flutter_map` com OpenStreetMap, abre onde a pessoa está, tem busca e lista por distância.
- **Locais da rede no painel:** cinco tipos de local.
- **Todos os pedidos:** filtro por estado e cidade, categoria e ordenação.
- **Pedido com itens:** várias pessoas ajudam, e quem pediu marca o que recebeu.
- **Pronto para produção:** modo demonstração por variável, painel por e-mail, cadastro em qualquer cidade, comando `pnpm gestor:criar` e convite da equipe.

## 3. Fase 7, manhã: o que você pediu e o que foi corrigido

| Pedido seu ou problema encontrado | O que foi feito |
| --- | --- |
| Foto de perfil visível a todos e "quem ajudou" no pedido, como na imagem | Foto no Perfil (galeria ou câmera, reduzida a 512 px). O pedido mostra fotos sobrepostas com "+N" e o primeiro nome. |
| "Resend não está enviando" | **Causa: os testes da API apagavam as contas do banco de desenvolvimento.** Agora os testes rodam num banco separado (`elo_teste`). O Resend funcionava; o erro 422 que você viu era de uma conta de teste `@example.com`. |
| Como acessar o painel | http://localhost:3000, com conta de teste ou com o seu e-mail convidado pela Equipe. |
| "Localização do pedido não bate com o mapa" | Bairro digitado ficava sem posição e caía no centro da cidade. Agora a API procura o bairro no OpenStreetMap com conferência rígida (recusa homônimos de outras cidades) e, se não achar, o mapa avisa "posição aproximada". |
| Painel com boa busca de endereço, sem latitude e longitude | Campos de latitude e longitude removidos. O mapa tem marcador arrastável. A busca usa CEP + Nominatim + Photon (gratuitos), e o TomTom fica pronto, mas desligado ("mantenha como está"). |
| Pedido visível até quem pediu encerrar, inclusive em "perto de você" | Feito, com o botão "Já consegui o que precisava: encerrar pedido", que avisa quem ia levar. |
| Detalhe de "Minhas ajudas" (endereço, o que levar, código) | Tela nova: protocolo em destaque, só os itens da pessoa, endereço, horário, telefone e mapa do ponto. |
| "Sem internet" no app web e "Failed to fetch" no painel | **Causa: CORS liberava só GET/POST.** A API agora libera PUT, PATCH e DELETE, com teste. |
| Agente no painel registra o que chegou pelo protocolo | Perfil novo, **agente do ponto de coleta**, com a tela "Receber doação": vê quem combinou levar o quê, marca o que chegou com quantidade (o mesmo item pode chegar de novo), e quem pediu e quem trouxe são avisados. |
| "Ver todos" deve mostrar realmente todos | Todo o Brasil, os mais perto primeiro. |
| Confirmação de retirada | **Código de retirada** de 4 números, só de quem pediu. O agente registra a retirada no painel com o código (5 erros = 1 hora de bloqueio), o sensor também exige o código, e doação parada há 7 dias gera lembrete e aviso ao CRAS. |
| Localização do aparelho no cadastro e no app | **"Usar minha localização"** (GPS ou rede, com a permissão do sistema) preenche a cidade e o bairro. O bairro novo recebe só uma posição arredondada a cerca de 1 km. "Mais perto de mim" usa a localização quando a pessoa aceita. |
| Simulação do Arduino (Wokwi ou Tinkercad) | Projeto do Wokwi montado (`iot/wokwi`), **compilado e testado com o seu token**: entrega e retirada com código. As telas do LCD estão em `iot/wokwi/telas`, e o sketch do Tinkercad agora é gerado a partir do sketch do Wokwi. |

Defeitos encontrados pelo caminho e já corrigidos, com teste:
- Remover a foto falhava no app, porque o cabeçalho JSON ia sem corpo.
- O SLA mandava ao CRAS pedido que já tinha ajuda parcial.
- O sensor IoT quebrava quando o pedido tinha mais de uma pessoa ajudando.
- A retirada podia ser registrada num ponto diferente do combinado; agora ela passa a valer onde a doação chegou, com aviso para o agente.

## 4. Decisões tomadas por mim (fáceis de trocar)

- A foto fica no próprio Postgres, porque a hospedagem é local.
- A busca de endereço gratuita para na rua; o número exato depende do ajuste no mapa (ou do TomTom, se um dia quiser).
- A doação registrada num ponto diferente do combinado faz a retirada passar a ser nesse ponto.
- O lembrete de retirada sai depois de 7 dias (`RETIRADA_LEMBRETE_DIAS`).
- No Wokwi, a balança é um potenciômetro e a temperatura, um sensor NTC, porque o Wokwi não tem FSR nem TMP36.

## 5. Pendente: precisa de você

1. **Revisar e mesclar** o PR #9 e depois o #10.
2. **Pedido amarelo ou vermelho em município sem equipe do CRAS** (F7-D10).
3. **LGPD:** política de privacidade, termos e exclusão de conta.
4. **Google na web:** cadastrar a origem `http://localhost:8090` no cliente Web do Google Cloud, se for testar no navegador.
5. **PDF da entrega:** abrir o projeto em wokwi.com para gerar o link público e usar as telas de `iot/wokwi/telas`, ou montar no Tinkercad. Os prints do app ficam para quando você mandar.
6. **Trocar as chaves que passaram pelo chat** (depois da entrega): Resend, o segredo do cliente Google (`GOCSPX-…`, que não foi usado nem guardado) e o token do Wokwi (está só no `.env`, que o Git ignora).

## 6. Como testar rápido

- **Painel:** http://localhost:3000 → "Joana · Agente do ponto de coleta" → protocolo **204815** → registrar o que chegou e a retirada (o código está em "Meus pedidos" de quem pediu, a conta Maria).
- **App:** APK novo ou http://127.0.0.1:8090.
  - **Criar uma conta** → "Usar minha localização".
  - **Perfil** → foto.
  - **Início** → "Ver todos" (Brasil inteiro).
  - **Meus pedidos** → código de retirada e "encerrar pedido".
  - **Minhas ajudas** → detalhe.
- **Arduino:** `wokwi-cli . --scenario cenario-entrega.yaml` na pasta `area3-mvp-iot/iot/wokwi`, ou abra os arquivos em wokwi.com (passo a passo no README dessa pasta).
