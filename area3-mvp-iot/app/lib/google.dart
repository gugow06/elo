import 'package:google_sign_in/google_sign_in.dart';

import 'api.dart';

/// Web Client ID do Google Cloud, definido no build:
/// flutter build apk --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
/// No Google Cloud também precisa existir um cliente OAuth Android com o pacote br.elo.elo_app
/// e o SHA-1 da chave que assina o APK.
const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

bool _iniciado = false;

/// Abre o "Fazer login com o Google" do Android e devolve a conta com o ID token.
/// Devolve null se a pessoa cancelar. Erros de configuração viram [ErroApi] com texto simples.
Future<IdentidadeSocial?> contaGoogle() async {
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
    return IdentidadeSocial(provedor: Provedor.google, idToken: token, nome: conta.displayName, email: conta.email);
  } on GoogleSignInException catch (e) {
    if (e.code == GoogleSignInExceptionCode.canceled) return null;
    throw ErroApi(0, 'Não foi possível entrar com o Google (${e.code.name}). Tente de novo.');
  }
}
