# App ELO (Flutter): cidadão e voluntário

O app segue o mockup oficial ([`images/representacao das telas elo.png`](../../images/representacao%20das%20telas%20elo.png)) com o ELO Design System, e aplica as regras de privacidade do PRD.

| # | Tela | Mockup | Ajuste do PRD |
| --- | --- | --- | --- |
| 1 | Boas-vindas e login | Tela 1 | "Entrar na minha conta" (e-mail + código enviado pelo Resend, sem senha), "Criar uma conta" e "Ou continue com" Google |
| 1b | Criar uma conta | — | "Usar minha localização" (GPS ou rede, com a permissão do aparelho) preenche a cidade e o bairro; ou digite a cidade. Não guardamos onde a pessoa mora: o bairro novo recebe só uma posição arredondada a ~1 km |
| 2 | Início: saudação, busca, 4 atalhos, pedidos próximos | Tela 2 | Atalho "Oportunidades" marcado como "em breve" (fase 3) |
| 3 | Mapa da rede com alternativa em lista | Tela 3 | Mapa real (OpenStreetMap, `flutter_map`), aberto onde a pessoa está ou no bairro do cadastro; busca de cidade, estado ou endereço para ajudar em qualquer lugar. Locais da rede no endereço; pedidos **agregados por bairro**, nunca pino na casa. Lista com distância e direção por extenso; lista é o padrão com leitor de tela |
| 4 | Pedido de ajuda + "Quero ajudar" | Tela 4 | Itens do pedido: cada pessoa escolhe o que vai levar; quem está ajudando em fotos sobrepostas com "+N" (primeiro nome e foto; sem foto, as iniciais). Mostra o protocolo para digitar no ponto de coleta |
| 4b | Todos os pedidos | — | Busca por estado ou cidade, categoria e ordem (meu bairro primeiro, mais recentes, aguardando há mais tempo) |
| 5 | Pedir ajuda + confirmação com protocolo | — | O cidadão nunca vê a faixa de risco |
| 6 | Meus pedidos / Minhas ajudas (no Perfil) | — | Etapas do pedido, checklist "Marque o que você já recebeu" e a devolutiva "Sua ajuda chegou" para cada pessoa que ajudou. Qualquer usuário pede e oferece ajuda (não assume o próprio pedido) |
| 7 | Mensagens (aba da barra inferior) | — | — |
| 8 | Perfil | — | Verificação da conta: duas etapas por e-mail = selo "Verificado"; foto de perfil (galeria ou câmera, todos veem); aplicativo autenticador e gov.br "em breve". Explica o uso dos dados (LGPD) |

## Acessibilidade

- Todo controle tem rótulo para o TalkBack/VoiceOver. Cartões são lidos como um bloco ("Alimentação. Família precisa de alimentos. Bairro Vila Nova…").
- Alvos de toque de pelo menos 48 dp. Texto escala com a fonte do sistema.
- Cor nunca é a única informação: categoria, status e tipo no mapa sempre têm texto ou ícone.
- Protocolo lido dígito por dígito pelo leitor de tela.
- Testes automáticos com as guidelines do Flutter: contraste de texto, alvo de toque (Android e iOS) e rótulos.

## Como rodar

Pré-requisitos: Flutter (stable) e a API rodando (`docker compose up -d` na raiz).

```bash
cd area3-mvp-iot/app
flutter pub get
flutter test                                                   # testes de interface e acessibilidade

# Navegador (bom para gravar o pitch)
flutter run -d chrome --dart-define=API_URL=http://localhost:3333

# Emulador Android (10.0.2.2 é o computador visto pelo emulador)
flutter run --dart-define=API_URL=http://10.0.2.2:3333

# Celular Android na mesma rede Wi-Fi: use o IP do computador
flutter run --dart-define=API_URL=http://192.168.x.x:3333
```

### APK para instalar

```bash
flutter build apk --release   --dart-define=API_URL=http://192.168.x.x:3333   --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
# gera build/app/outputs/flutter-apk/app-release.apk
```

Copie o APK para o celular e instale (é preciso permitir "instalar apps de fontes desconhecidas"). O CI também gera o APK como artefato a cada push.

## Login: Google e código por e-mail

### Google

O app usa o "Fazer login com o Google" do Android (`google_sign_in`) e a API confere o ID token com as chaves públicas do Google. Configuração no [Google Cloud Console](https://console.cloud.google.com/), uma vez:

1. Crie um projeto. Em **Google Auth Platform**, preencha a marca (nome "ELO" e e-mail de suporte) e o público **Externo**. Enquanto o app estiver em modo **Teste**, só entram as contas Google listadas em **Usuários de teste**: adicione as de quem vai usar.
2. Em **Clientes**, crie um cliente **Aplicativo da Web**. O ID dele é o *Web Client ID*: vai no app (`--dart-define=GOOGLE_SERVER_CLIENT_ID=...`) e na API (`GOOGLE_CLIENT_IDS=...` no `.env`).
3. Crie também um cliente **Android** com o pacote `br.elo.elo_app` e o **SHA-1 da chave que assina o APK**. O APK de release usa a chave de debug da máquina que compila (`~/.android/debug.keystore`). Para ver o SHA-1:

   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```

   APK compilado em outra máquina (ou no CI) tem outro SHA-1: cadastre cada um, ou o Google cancela o login.

4. Para a versão **web**, adicione a origem do app (ex.: `http://localhost:8090`) em **Origens JavaScript autorizadas** do cliente Web. Na web aparece o botão oficial do Google (exigência do Google Identity Services) no lugar do botão do ELO.

```bash
flutter run -d chrome --web-port 8090   --dart-define=API_URL=http://localhost:3333   --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
```

Sem `GOOGLE_SERVER_CLIENT_ID`, o botão do Google avisa que o login não foi configurado.

### Código por e-mail (Resend)

"Entrar na minha conta" e "Criar uma conta" mandam um código de 6 dígitos para o e-mail, pelo [Resend](https://resend.com). No `.env` da raiz:

```bash
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=ELO <onboarding@resend.dev>
```

Sem domínio verificado no Resend, o remetente de teste `onboarding@resend.dev` **só entrega no e-mail dono da conta Resend**. Para os outros e-mails o envio é recusado (fica no log da API) e, com `MODO_DEMO`, o código aparece na tela do app. Com um domínio verificado, troque o `RESEND_FROM` e o código chega para qualquer pessoa. Sem `RESEND_API_KEY`, o código só vai para o log.

Depois de mudar o `.env`: `docker compose up -d --build api`.

### iPhone (precisa de Mac)

```bash
flutter run --dart-define=API_URL=http://192.168.x.x:3333   # iPhone conectado, Modo de Desenvolvedor ativo
```

Com Apple ID gratuito, o app expira em 7 dias: reinstale na véspera da apresentação.

> **Protótipo:** o app aceita HTTP na rede local (`usesCleartextTraffic` no Android, `NSAllowsLocalNetworking` no iOS) porque a API roda no computador da demonstração. Em produção, só HTTPS.

## Contas de demonstração (fictícias)

| Pessoa | Uso na demonstração | E-mail |
| --- | --- | --- |
| Ana | Pede ajuda | `ana.ribeiro@example.com` |
| Maria | Pede ajuda | `maria.lima@example.com` |
| Cláudia | Ajuda | `claudia.martins@example.com` |
| Roberto | Ajuda | `roberto.alves@example.com` |

Toda conta pede e oferece ajuda. Em "Entrar na minha conta", informe o e-mail: o código de acesso aparece na própria tela (modo demonstração).
