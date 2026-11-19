import 'package:google_sign_in/google_sign_in.dart';
import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'telas/criar_conta.dart';
import 'telas/shell.dart';
import 'widgets/comum.dart';

/// Web Client ID do Google Cloud, definido no build:
/// flutter build apk --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
/// No Google Cloud também precisa existir um cliente OAuth Android com o pacote br.elo.elo_app
/// e o SHA-1 da chave que assina o APK.
const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

bool _iniciado = false;

/// Abre o "Fazer login com o Google" do Android e devolve a conta com o ID token.
/// Devolve null se a pessoa cancelar. Erros de configuração viram [ErroApi] com texto simples.
Future<IdentidadeGoogle?> contaGoogle() async {
  if (googleServerClientId.isEmpty) {
    throw ErroApi(0, 'O login com Google não foi configurado neste aplicativo.');
  }
  final g = GoogleSignIn.instance;
  if (!_iniciado) {
    await g.initialize(serverClientId: googleServerClientId);
    _iniciado = true;
  }
  if (!g.supportsAuthenticate()) {
    throw ErroApi(0, 'O login com Google não está disponível neste aparelho.');
  }
  try {
    final conta = await g.authenticate();
    final token = conta.authentication.idToken;
    if (token == null) throw ErroApi(0, 'O Google não devolveu a confirmação da conta. Tente de novo.');
    return IdentidadeGoogle(idToken: token, nome: conta.displayName, email: conta.email);
  } on GoogleSignInException catch (e) {
    if (e.code == GoogleSignInExceptionCode.canceled) return null;
    throw ErroApi(0, 'Não foi possível entrar com o Google (${e.code.name}). Tente de novo.');
  }
}

/// Botão "Continuar com Google": se a conta já existe no ELO, entra; se não, abre a criação de conta.
Future<void> continuarComGoogle(BuildContext context) async {
  final nav = Navigator.of(context);
  try {
    final id = await contaGoogle();
    if (id == null || !context.mounted) return;
    final r = await Api.i.entrarGoogle(id);
    if (r.usuario != null) {
      nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
    } else {
      nav.push(MaterialPageRoute(builder: (_) => CriarConta(google: IdentidadeGoogle(idToken: id.idToken, nome: r.nome ?? id.nome, email: r.email ?? id.email))));
    }
  } on ErroApi catch (e) {
    if (context.mounted) avisar(context, e.mensagem, erro: true);
  }
}
