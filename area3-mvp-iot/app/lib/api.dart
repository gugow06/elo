import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// URL da API definida no build: flutter run --dart-define=API_URL=https://...
/// Padrão: emulador Android acessando o computador (10.0.2.2).
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3333');

class ErroApi implements Exception {
  ErroApi(this.status, this.mensagem);
  final int status;
  final String mensagem;
  @override
  String toString() => mensagem;
}

class Usuario {
  Usuario({required this.id, required this.nome, required this.perfil});
  final String id;
  final String nome;
  final String perfil; // cidadao | voluntario
  bool get voluntario => perfil == 'voluntario';
  String get primeiroNome => nome.split(' ').first;

  Map<String, dynamic> toJson() => {'id': id, 'nome': nome, 'perfil': perfil};
  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(id: j['id'], nome: j['nome'], perfil: j['perfil']);
}

enum Provedor {
  google('Google'),
  apple('Apple'),
  facebook('Facebook');

  const Provedor(this.nome);
  final String nome;
}

/// Conta do provedor social.
/// Google: real, leva o [idToken] que a API confere. Apple e Facebook: simulados no protótipo,
/// levam o [sujeito] fictício (ver telas/conta_social.dart).
class IdentidadeSocial {
  const IdentidadeSocial({required this.provedor, this.sujeito, this.idToken, this.nome, this.email});
  final Provedor provedor;
  final String? sujeito;
  final String? idToken;
  final String? nome;
  final String? email;

  Map<String, dynamic> toJson() => provedor == Provedor.google
      ? {'provedor': 'google', 'id_token': idToken}
      : {'provedor': provedor.name, 'sujeito': sujeito, 'email': ?email};
}

/// Resposta do login social: a sessão, ou os dados para criar a conta.
typedef ResultadoSocial = ({Usuario? usuario, String? nome, String? email});

/// Cliente da API do ELO. Guarda a sessão localmente (token de 8 h).
class Api {
  Api._();
  static final Api i = Api._();

  String? _token;
  Usuario? usuario;

  Future<void> carregarSessao() async {
    final p = await SharedPreferences.getInstance();
    _token = p.getString('elo.token');
    final u = p.getString('elo.usuario');
    usuario = u == null ? null : Usuario.fromJson(jsonDecode(u));
  }

  Future<void> sair() async {
    final p = await SharedPreferences.getInstance();
    await p.remove('elo.token');
    await p.remove('elo.usuario');
    _token = null;
    usuario = null;
  }

  Future<dynamic> _req(String metodo, String caminho, [Map<String, dynamic>? corpo]) async {
    final uri = Uri.parse('$apiUrl$caminho');
    final cab = {'content-type': 'application/json', if (_token != null) 'authorization': 'Bearer $_token'};
    late http.Response r;
    try {
      r = switch (metodo) {
        'POST' => await http.post(uri, headers: cab, body: jsonEncode(corpo ?? {})).timeout(const Duration(seconds: 20)),
        _ => await http.get(uri, headers: cab).timeout(const Duration(seconds: 20)),
      };
    } catch (_) {
      throw ErroApi(0, 'Sem conexão com o ELO. Verifique a internet e tente de novo.');
    }
    final texto = utf8.decode(r.bodyBytes);
    final dado = texto.isEmpty ? null : jsonDecode(texto);
    if (r.statusCode >= 400) {
      if (r.statusCode == 401 && _token != null) await sair();
      final msg = dado is Map ? (dado['detalhes']?[0]?['mensagem'] ?? dado['message'] ?? dado['erro']) : null;
      throw ErroApi(r.statusCode, msg is String ? msg : 'Algo deu errado (${r.statusCode}).');
    }
    return dado;
  }

  // ---------- autenticação
  /// Conta ELO: pede o código de 6 dígitos, enviado por e-mail.
  Future<String?> pedirCodigo(String email) async {
    final r = await _req('POST', '/auth/codigo', {'email': email});
    return r['codigo_demo'] as String?;
  }

  /// Conta ELO: e-mail + código.
  Future<Usuario> entrar(String email, String codigo) async =>
      _guardarSessao(await _req('POST', '/auth/entrar', {'email': email, 'codigo': codigo}));

  /// Login social. Sem conta no ELO, devolve nome e e-mail para a criação de conta.
  Future<ResultadoSocial> entrarSocial(IdentidadeSocial id) async {
    final r = await _req('POST', '/auth/social', id.toJson());
    if (r['cadastro_necessario'] == true) return (usuario: null, nome: r['nome'] as String?, email: r['email'] as String?);
    return (usuario: await _guardarSessao(r), nome: null, email: null);
  }

  /// Cria a conta. Com [social], já entra e devolve o usuário; sem ele, o e-mail
  /// precisa ser confirmado: devolve null e [aoPedirCodigo] recebe o código de demonstração.
  Future<Usuario?> cadastrar({
    required String nome,
    required String email,
    required String telefone,
    required String bairroId,
    required String perfil,
    IdentidadeSocial? social,
    void Function(String? codigoDemo)? aoPedirCodigo,
  }) async {
    final r = await _req('POST', '/auth/cadastro', {
      'nome': nome,
      'email': email,
      'telefone': telefone,
      'bairro_id': bairroId,
      'perfil': perfil,
      'social': ?social?.toJson(),
    });
    if (r['token'] == null) {
      aoPedirCodigo?.call(r['codigo_demo'] as String?);
      return null;
    }
    return _guardarSessao(r);
  }

  /// Bairros atendidos (público), para a tela de criar conta.
  Future<List<dynamic>> bairrosCadastro() async => await _req('GET', '/auth/bairros') as List;

  Future<Usuario> _guardarSessao(dynamic r) async {
    final u = Usuario.fromJson(r['usuario']);
    if (u.perfil != 'cidadao' && u.perfil != 'voluntario') {
      throw ErroApi(403, 'Este app é para cidadãos e voluntários. A equipe do CRAS usa o painel web.');
    }
    _token = r['token'];
    usuario = u;
    final p = await SharedPreferences.getInstance();
    await p.setString('elo.token', _token!);
    await p.setString('elo.usuario', jsonEncode(u.toJson()));
    return u;
  }

  // ---------- cidadão
  Future<Map<String, dynamic>> pedirAjuda(String relato, {String? bairroId}) async =>
      Map<String, dynamic>.from(await _req('POST', '/solicitacoes', {'relato': relato, 'canal': 'app', 'bairro_id': ?bairroId}));
  Future<List<dynamic>> meusPedidos() async => await _req('GET', '/solicitacoes/minhas') as List;
  Future<void> confirmarRecebimento(String id) async => _req('POST', '/solicitacoes/$id/confirmar-recebimento');

  // ---------- rede cidadã
  Future<List<dynamic>> mural({String? bairro}) async => await _req('GET', bairro == null ? '/mural' : '/mural?bairro=$bairro') as List;
  Future<List<dynamic>> muralPorBairro() async => await _req('GET', '/mural/bairros') as List;
  Future<Map<String, dynamic>> quero(String id) async => Map<String, dynamic>.from(await _req('POST', '/mural/$id/ofertas'));
  Future<List<dynamic>> minhasOfertas() async => await _req('GET', '/voluntario/ofertas') as List;

  // ---------- comum
  Future<List<dynamic>> notificacoes() async => await _req('GET', '/notificacoes') as List;
  Future<void> marcarLidas() async => _req('POST', '/notificacoes/lidas');
  Future<List<dynamic>> pontos() async => await _req('GET', '/pontos') as List;
  Future<List<dynamic>> bairros() async => await _req('GET', '/bairros') as List;
}
