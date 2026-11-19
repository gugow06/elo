import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'textos_legais.dart';

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
  String get primeiroNome => nome.split(' ').first;

  Map<String, dynamic> toJson() => {'id': id, 'nome': nome, 'perfil': perfil};
  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(id: j['id'], nome: j['nome'], perfil: j['perfil']);
}

/// Conta Google confirmada pelo "Fazer login com o Google". A API confere o [idToken].
class IdentidadeGoogle {
  const IdentidadeGoogle({required this.idToken, this.nome, this.email});
  final String idToken;
  final String? nome;
  final String? email;

  Map<String, dynamic> toJson() => {'provedor': 'google', 'id_token': idToken};
}

/// Resposta do login com Google: a sessão, ou os dados para criar a conta.
/// [desafio] vem quando a conta tem verificação em duas etapas: falta o código do e-mail ([email] mascarado).
typedef ResultadoGoogle = ({Usuario? usuario, String? nome, String? email, String? desafio, String? codigoDemo});

/// Cliente da API do ELO. Guarda a sessão localmente (token de 8 h).
class Api {
  Api._();
  static final Api i = Api._();

  String? _token;
  Usuario? usuario;

  /// Modo demonstração da API (contas de teste, código na tela). Em produção, false.
  bool modoDemo = false;

  /// Lê /config. Sem conexão, segue como produção (sem atalhos de demonstração).
  Future<void> carregarConfig() async {
    try {
      final r = await _req('GET', '/config');
      modoDemo = r['modo_demo'] == true;
    } on ErroApi {
      modoDemo = false;
    }
  }

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
    // Sem corpo (GET/DELETE), sem content-type: o Fastify recusa JSON vazio
    final temCorpo = metodo == 'POST' || metodo == 'PATCH' || metodo == 'PUT';
    final cab = {if (temCorpo) 'content-type': 'application/json', if (_token != null) 'authorization': 'Bearer $_token'};
    late http.Response r;
    try {
      r = switch (metodo) {
        'POST' => await http.post(uri, headers: cab, body: jsonEncode(corpo ?? {})).timeout(const Duration(seconds: 20)),
        'PATCH' => await http.patch(uri, headers: cab, body: jsonEncode(corpo ?? {})).timeout(const Duration(seconds: 20)),
        'PUT' => await http.put(uri, headers: cab, body: jsonEncode(corpo ?? {})).timeout(const Duration(seconds: 40)),
        'DELETE' => await http.delete(uri, headers: cab).timeout(const Duration(seconds: 20)),
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

  /// Login com Google. Sem conta no ELO, devolve nome e e-mail para a criação de conta.
  Future<ResultadoGoogle> entrarGoogle(IdentidadeGoogle id) async {
    final r = await _req('POST', '/auth/social', id.toJson());
    if (r['cadastro_necessario'] == true) {
      return (usuario: null, nome: r['nome'] as String?, email: r['email'] as String?, desafio: null, codigoDemo: null);
    }
    if (r['dois_fatores'] == true) {
      return (usuario: null, nome: null, email: r['email'] as String?, desafio: r['desafio'] as String?, codigoDemo: r['codigo_demo'] as String?);
    }
    return (usuario: await _guardarSessao(r), nome: null, email: null, desafio: null, codigoDemo: null);
  }

  /// Segundo passo do login com Google (verificação em duas etapas).
  Future<Usuario> confirmarDoisFatores(String desafio, String codigo) async =>
      _guardarSessao(await _req('POST', '/auth/social/confirmar', {'desafio': desafio, 'codigo': codigo}));

  // ---------- perfil e verificação da conta
  Future<Map<String, dynamic>> perfil() async => Map<String, dynamic>.from(await _req('GET', '/perfil'));

  /// Envia a foto de perfil (já reduzida no aparelho). Todos veem a foto (F7-D5).
  Future<Map<String, dynamic>> enviarFoto(List<int> bytes) async =>
      Map<String, dynamic>.from(await _req('PUT', '/perfil/foto', {'imagem': base64Encode(bytes)}));

  Future<Map<String, dynamic>> removerFoto() async => Map<String, dynamic>.from(await _req('DELETE', '/perfil/foto'));
  /// Envia o código ao e-mail; devolve o e-mail mascarado e, em modo demonstração, o código.
  Future<({String email, String? codigoDemo})> codigoDoisFatores() async {
    final r = await _req('POST', '/perfil/2fa/codigo');
    return (email: r['email'] as String, codigoDemo: r['codigo_demo'] as String?);
  }
  Future<Map<String, dynamic>> ativarDoisFatores(String codigo) async =>
      Map<String, dynamic>.from(await _req('POST', '/perfil/2fa/ativar', {'codigo': codigo}));
  Future<Map<String, dynamic>> desativarDoisFatores(String codigo) async =>
      Map<String, dynamic>.from(await _req('POST', '/perfil/2fa/desativar', {'codigo': codigo}));

  /// Cria a conta. Com [google], já entra e devolve o usuário; sem ele, o e-mail
  /// precisa ser confirmado: devolve null e [aoPedirCodigo] recebe o código de demonstração.
  Future<Usuario?> cadastrar({
    required String nome,
    required String email,
    required String telefone,
    String? bairroId,
    String? municipioId,
    String? bairroNome,
    ({double latitude, double longitude})? posicao,
    IdentidadeGoogle? google,
    void Function(String? codigoDemo)? aoPedirCodigo,
  }) async {
    final r = await _req('POST', '/auth/cadastro', {
      if (posicao != null) 'posicao': {'latitude': posicao.latitude, 'longitude': posicao.longitude},
      'nome': nome,
      'email': email,
      'telefone': telefone,
      'bairro_id': ?bairroId,
      'municipio_id': ?municipioId,
      'bairro_nome': ?bairroNome,
      'social': ?google?.toJson(),
      // A tela só deixa criar a conta com o aceite marcado
      'aceite_termos': true,
      'termos_versao': termosVersao,
    });
    if (r['token'] == null) {
      aoPedirCodigo?.call(r['codigo_demo'] as String?);
      return null;
    }
    return _guardarSessao(r);
  }

  /// Bairros atendidos (público), para a tela de criar conta.
  /// Bairros já cadastrados numa cidade (público, para criar conta).
  Future<List<dynamic>> bairrosCadastro({String? municipio}) async =>
      await _req('GET', municipio == null ? '/auth/bairros' : '/auth/bairros?municipio=$municipio') as List;

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

  /// Quem pediu encerra o pedido: sai do mural e do mapa; quem ajudava é avisado.
  Future<Map<String, dynamic>> encerrarPedido(String id) async =>
      Map<String, dynamic>.from(await _req('POST', '/solicitacoes/$id/encerrar'));

  // ---------- rede cidadã
  Future<List<dynamic>> mural({String? bairro, String? uf, String? municipio, String? categoria, String? ordem, int? pagina, bool brasil = false,
          ({double latitude, double longitude})? perto, int? raioKm}) async =>
      await _req('GET', caminhoMural(bairro: bairro, uf: uf, municipio: municipio, categoria: categoria, ordem: ordem, pagina: pagina, brasil: brasil, perto: perto, raioKm: raioKm)) as List;

  /// Posição do aparelho → cidade do IBGE e bairro (criação de conta). A API não guarda a posição.
  Future<Map<String, dynamic>> ondeEstou(double latitude, double longitude) async => Map<String, dynamic>.from(
      await _req('GET', Uri(path: '/geo/onde-estou', queryParameters: {'lat': '$latitude', 'lon': '$longitude'}).toString()));

  /// Monta /mural com os filtros (sem filtro: o município de quem consulta; [brasil]: todo o Brasil).
  /// [perto]: localização aproximada do aparelho, só para ordenar "mais perto de mim".
  /// [raioKm]: com [perto], só pedidos até essa distância.
  static String caminhoMural({String? bairro, String? uf, String? municipio, String? categoria, String? ordem, int? pagina, bool brasil = false,
      ({double latitude, double longitude})? perto, int? raioKm}) {
    final q = {
      if (brasil && uf == null && municipio == null) 'abrangencia': 'brasil',
      'bairro': ?bairro,
      'uf': ?uf,
      'municipio': ?municipio,
      'categoria': ?categoria,
      'ordem': ?ordem,
      if (pagina != null && pagina > 0) 'pagina': '$pagina',
      if (perto != null) 'lat': '${perto.latitude}',
      if (perto != null) 'lon': '${perto.longitude}',
      if (perto != null && raioKm != null) 'raio_km': '$raioKm',
    };
    return q.isEmpty ? '/mural' : Uri(path: '/mural', queryParameters: q).toString();
  }

  /// Estados e cidades do IBGE, para a busca da lista de pedidos.
  Future<List<dynamic>> localidades(String q) async =>
      await _req('GET', Uri(path: '/localidades', queryParameters: {'q': q}).toString()) as List;
  Future<List<dynamic>> muralPorBairro() async => await _req('GET', '/mural/bairros') as List;

  // ---------- mapa (qualquer lugar do Brasil; pedidos só agregados por bairro)
  Future<List<dynamic>> mapaLocais(String caixa) async => await _req('GET', '/mapa/locais?bbox=$caixa') as List;
  Future<List<dynamic>> mapaPedidos(String caixa) async => await _req('GET', '/mapa/pedidos?bbox=$caixa') as List;
  /// Endereço ou nome de lugar → candidatos com coordenadas (busca gratuita pela API).
  Future<List<dynamic>> buscarLugar(String q) async =>
      await _req('GET', Uri(path: '/geo/buscar', queryParameters: {'q': q}).toString()) as List;
  /// Ajudar com um pedido. [itens] = ids escolhidos; sem lista, leva todos os itens abertos.
  Future<Map<String, dynamic>> quero(String id, {List<String>? itens}) async =>
      Map<String, dynamic>.from(await _req('POST', '/mural/$id/ofertas', {'itens': ?itens}));

  /// Quem pediu marca (ou desmarca) um item como recebido. Devolve itens e status atualizados.
  Future<Map<String, dynamic>> marcarItem(String pedidoId, String itemId, bool obtido) async =>
      Map<String, dynamic>.from(await _req('PATCH', '/solicitacoes/$pedidoId/itens/$itemId', {'obtido': obtido}));
  Future<List<dynamic>> minhasOfertas() async => await _req('GET', '/voluntario/ofertas') as List;

  // ---------- comum
  Future<List<dynamic>> notificacoes() async => await _req('GET', '/notificacoes') as List;

  // ---------- conversas entre quem pediu e quem ajuda
  /// Minhas conversas; com [pedido], só as daquele pedido.
  Future<List<dynamic>> conversas({String? pedido}) async =>
      await _req('GET', pedido == null ? '/conversas' : '/conversas?solicitacao_id=$pedido') as List;
  /// Quem ajuda abre (ou reabre) a conversa com quem pediu. Devolve o id da conversa.
  Future<String> abrirConversa(String pedidoId) async =>
      (await _req('POST', '/conversas', {'solicitacao_id': pedidoId}))['id'] as String;
  Future<List<dynamic>> mensagens(String conversaId, {String? depois}) async => await _req(
      'GET', depois == null ? '/conversas/$conversaId/mensagens' : Uri(path: '/conversas/$conversaId/mensagens', queryParameters: {'depois': depois}).toString()) as List;
  Future<Map<String, dynamic>> enviarMensagem(String conversaId, String texto) async =>
      Map<String, dynamic>.from(await _req('POST', '/conversas/$conversaId/mensagens', {'texto': texto}));
  /// Não lidas: mensagens das conversas e notificações do sistema (o número na aba Mensagens).
  Future<({int mensagens, int notificacoes})> naoLidas() async {
    final r = await _req('GET', '/conversas/nao-lidas');
    return (mensagens: (r['mensagens'] as num).toInt(), notificacoes: (r['notificacoes'] as num).toInt());
  }

  // ---------- termos e exclusão de conta
  Future<Map<String, dynamic>> aceitarTermos() async =>
      Map<String, dynamic>.from(await _req('POST', '/perfil/termos', {'versao': termosVersao}));
  Future<({String email, String? codigoDemo})> codigoExclusao() async {
    final r = await _req('POST', '/perfil/excluir/codigo');
    return (email: r['email'] as String, codigoDemo: r['codigo_demo'] as String?);
  }
  /// Exclui a conta (com o código do e-mail) e apaga a sessão do aparelho.
  Future<void> excluirConta(String codigo) async {
    await _req('POST', '/perfil/excluir', {'codigo': codigo});
    await sair();
  }
  Future<void> marcarLidas() async => _req('POST', '/notificacoes/lidas');
  Future<List<dynamic>> pontos() async => await _req('GET', '/pontos') as List;
  Future<List<dynamic>> bairros() async => await _req('GET', '/bairros') as List;
}
