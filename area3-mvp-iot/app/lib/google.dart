import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'google_botao_stub.dart' if (dart.library.js_interop) 'google_botao_web.dart';
import 'tema.dart';
import 'telas/codigo_email.dart';
import 'telas/criar_conta.dart';
import 'telas/shell.dart';
import 'widgets/comum.dart';
import 'widgets/login.dart';

/// Web Client ID do Google Cloud, definido no build:
/// --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
/// Android: também precisa existir um cliente OAuth Android com o pacote br.elo.elo_app
/// e o SHA-1 da chave que assina o APK.
/// Web: a origem (ex.: http://localhost:8090) precisa estar em "Origens JavaScript autorizadas"
/// do cliente Web.
const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

Future<void>? _inicio;

/// Inicia o Google Sign-In uma vez. Na web o Web Client ID vai como clientId;
/// no Android, como serverClientId (é a audiência do ID token que a API confere).
Future<void> _iniciarGoogle() {
  if (googleServerClientId.isEmpty) {
    return Future.error(ErroApi(0, 'O login com Google não foi configurado neste aplicativo.'));
  }
  return _inicio ??= kIsWeb
      ? GoogleSignIn.instance.initialize(clientId: googleServerClientId)
      : GoogleSignIn.instance.initialize(serverClientId: googleServerClientId);
}

/// Android: abre a escolha de conta do aparelho e devolve a conta com o ID token.
/// Devolve null se a pessoa cancelar. Erros viram [ErroApi] com texto simples.
Future<IdentidadeGoogle?> contaGoogle() async {
  await _iniciarGoogle();
  final g = GoogleSignIn.instance;
  if (!g.supportsAuthenticate()) {
    throw ErroApi(0, 'O login com Google não está disponível neste aparelho.');
  }
  try {
    return _identidade(await g.authenticate());
  } on GoogleSignInException catch (e) {
    if (e.code == GoogleSignInExceptionCode.canceled) return null;
    throw ErroApi(0, 'Não foi possível entrar com o Google (${e.code.name}). Tente de novo.');
  }
}

IdentidadeGoogle _identidade(GoogleSignInAccount conta) {
  final token = conta.authentication.idToken;
  if (token == null) throw ErroApi(0, 'O Google não devolveu a confirmação da conta. Tente de novo.');
  return IdentidadeGoogle(idToken: token, nome: conta.displayName, email: conta.email);
}

/// Com a conta Google confirmada: se já existe no ELO, entra; se não, abre a criação de conta.
Future<void> _concluir(NavigatorState nav, IdentidadeGoogle id) async {
  final r = await Api.i.entrarGoogle(id);
  if (r.usuario != null) {
    nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
  } else if (r.desafio != null) {
    // Verificação em duas etapas: falta o código enviado ao e-mail
    nav.push(MaterialPageRoute(
      builder: (_) => CodigoEmail(
        titulo: 'Verificação em duas etapas',
        email: r.email ?? 'o seu e-mail',
        codigoDemo: r.codigoDemo,
        aoConfirmar: (codigo) async {
          await Api.i.confirmarDoisFatores(r.desafio!, codigo);
          nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
        },
      ),
    ));
  } else {
    nav.push(MaterialPageRoute(
      builder: (_) => CriarConta(google: IdentidadeGoogle(idToken: id.idToken, nome: r.nome ?? id.nome, email: r.email ?? id.email)),
    ));
  }
}

/// Android: toque no botão "Continuar com Google".
Future<void> continuarComGoogle(BuildContext context) async {
  final nav = Navigator.of(context);
  try {
    final id = await contaGoogle();
    if (id == null || !context.mounted) return;
    await _concluir(nav, id);
  } on ErroApi catch (e) {
    if (context.mounted) avisar(context, e.mensagem, erro: true);
  }
}

/// "Continuar com Google". No Android é o botão do ELO; na web é o botão oficial do Google,
/// e o login chega pelo evento authenticationEvents.
class BotaoGoogle extends StatefulWidget {
  const BotaoGoogle({super.key});
  @override
  State<BotaoGoogle> createState() => _BotaoGoogleState();
}

class _BotaoGoogleState extends State<BotaoGoogle> {
  static const _web = kIsWeb && googleServerClientId != '';
  StreamSubscription<GoogleSignInAuthenticationEvent>? _eventos;
  bool _pronto = false;

  @override
  void initState() {
    super.initState();
    if (_web) _iniciarWeb();
  }

  Future<void> _iniciarWeb() async {
    await _iniciarGoogle();
    _eventos = GoogleSignIn.instance.authenticationEvents.listen(_aoEntrar, onError: (Object e) {
      if (e is GoogleSignInException && e.code == GoogleSignInExceptionCode.canceled) return;
      if (mounted) avisar(context, 'Não foi possível entrar com o Google. Tente de novo.', erro: true);
    });
    if (mounted) setState(() => _pronto = true);
  }

  Future<void> _aoEntrar(GoogleSignInAuthenticationEvent evento) async {
    if (evento is! GoogleSignInAuthenticationEventSignIn || !mounted) return;
    try {
      await _concluir(Navigator.of(context), _identidade(evento.user));
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    }
  }

  @override
  void dispose() {
    _eventos?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_web) {
      return SizedBox(
        height: 52,
        child: Center(child: _pronto ? botaoGoogleOficial() : const CircularProgressIndicator(color: EloCores.brand700)),
      );
    }
    return OutlinedButton.icon(
      onPressed: () => continuarComGoogle(context),
      icon: const LogoGoogle(),
      label: const Text('Continuar com Google'),
    );
  }
}
