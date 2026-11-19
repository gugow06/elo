# App ELO (Flutter): cidadão e voluntário

O app segue o mockup oficial ([`images/representacao das telas elo.png`](../../images/representacao%20das%20telas%20elo.png)) com o ELO Design System, e aplica as regras de privacidade do PRD.

| # | Tela | Mockup | Ajuste do PRD |
| --- | --- | --- | --- |
| 1 | Boas-vindas e login | Tela 1 | "Entrar na minha conta" (telefone + código, sem senha), "Criar uma conta" e Google, Apple e Facebook (simulados no protótipo, com contas fictícias) |
| 2 | Início: saudação, busca, 4 atalhos, pedidos próximos | Tela 2 | Atalho "Oportunidades" marcado como "em breve" (fase 3) |
| 3 | Mapa da rede com alternativa em lista | Tela 3 | Pedidos **agregados por bairro**, nunca pino na casa. Lista com distância e direção por extenso; lista é o padrão com leitor de tela |
| 4 | Pedido de ajuda + "Quero ajudar" | Tela 4 | Sem compartilhar e sem foto de voluntários. Mostra o protocolo para digitar no ponto de coleta |
| 5 | Pedir ajuda + confirmação com protocolo | — | O cidadão nunca vê a faixa de risco |
| 6 | Meus pedidos / Minhas ajudas | — | Etapas do pedido, "Já retirei a doação" e a devolutiva "Sua ajuda chegou" |
| 7 | Mensagens (notificações) | — | — |
| 8 | Perfil | — | Explica o uso dos dados (LGPD) |

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
flutter build apk --release --dart-define=API_URL=http://192.168.x.x:3333
# gera build/app/outputs/flutter-apk/app-release.apk
```

Copie o APK para o celular e instale (é preciso permitir "instalar apps de fontes desconhecidas"). O CI também gera o APK como artefato a cada push.

### iPhone (precisa de Mac)

```bash
flutter run --dart-define=API_URL=http://192.168.x.x:3333   # iPhone conectado, Modo de Desenvolvedor ativo
```

Com Apple ID gratuito, o app expira em 7 dias: reinstale na véspera da apresentação.

> **Protótipo:** o app aceita HTTP na rede local (`usesCleartextTraffic` no Android, `NSAllowsLocalNetworking` no iOS) porque a API roda no computador da demonstração. Em produção, só HTTPS.

## Contas de demonstração (fictícias)

| Pessoa | Perfil | Telefone |
| --- | --- | --- |
| Ana | Cidadã | `+5511990000001` |
| Maria | Cidadã | `+5511990000002` |
| Cláudia | Voluntária | `+5511990000004` |
| Roberto | Voluntário | `+5511990000005` |

O código de acesso aparece na própria tela (modo demonstração).
