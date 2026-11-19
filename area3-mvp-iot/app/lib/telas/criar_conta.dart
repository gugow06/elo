import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../localizacao.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import '../widgets/login.dart';
import 'documento_legal.dart';
import 'entrar.dart';
import 'shell.dart';

/// Criação de conta. Toda conta pode pedir e oferecer ajuda. Vinda do Google, já traz nome e e-mail
/// e vincula a conta Google; sem ela, o e-mail é confirmado por código.
class CriarConta extends StatefulWidget {
  const CriarConta({super.key, this.google});
  final IdentidadeGoogle? google;
  @override
  State<CriarConta> createState() => _CriarContaState();
}

class _CriarContaState extends State<CriarConta> {
  late final _nome = TextEditingController(text: widget.google?.nome);
  late final _email = TextEditingController(text: widget.google?.email);
  final _telefone = TextEditingController();
  final _buscaCidade = TextEditingController();
  Timer? _espera;
  List<Map<String, dynamic>> _sugestoes = [];
  Map<String, dynamic>? _cidade;
  /// Bairro que a localização do aparelho encontrou (vai junto, sem campo na tela).
  String? _bairroDaLocalizacao;
  bool _enviando = false;
  /// Aceite dos Termos de uso e da Política de privacidade (obrigatório).
  bool _aceite = false;
  bool _localizando = false;
  String? _erro;
  /// Posição do aparelho, se a pessoa aceitou compartilhar (só para a posição aproximada do bairro).
  ({double latitude, double longitude})? _posicao;

  @override
  void dispose() {
    _espera?.cancel();
    super.dispose();
  }

  /// Cidades do IBGE enquanto a pessoa digita.
  void _digitouCidade(String texto) {
    _espera?.cancel();
    if (texto.trim().length < 2) {
      setState(() => _sugestoes = []);
      return;
    }
    _espera = Timer(const Duration(milliseconds: 300), () async {
      try {
        final r = await Api.i.localidades(texto.trim());
        if (!mounted) return;
        setState(() => _sugestoes = r.map((e) => Map<String, dynamic>.from(e)).where((l) => l['tipo'] == 'municipio').toList());
      } on ErroApi {
        // busca é só uma ajuda
      }
    });
  }

  /// GPS ou rede, com a permissão da pessoa: preenche a cidade e o bairro.
  Future<void> _usarLocalizacao() async {
    setState(() { _localizando = true; _erro = null; });
    try {
      final p = await Localizacao.i.obter(pedir: true);
      if (!mounted) return;
      if (p == null) {
        setState(() => _erro = 'Não foi possível usar a sua localização. Confira se a localização do aparelho está ligada e permitida para o ELO, ou digite a cidade.');
        return;
      }
      final r = await Api.i.ondeEstou(p.latitude, p.longitude);
      if (!mounted) return;
      final cidade = r['municipio'] == null ? null : Map<String, dynamic>.from(r['municipio']);
      if (cidade == null) {
        setState(() => _erro = 'Não achamos a sua cidade pela localização. Digite e escolha na lista.');
        return;
      }
      _posicao = p;
      _escolherCidade(cidade);
      final b = r['bairro'] == null ? null : Map<String, dynamic>.from(r['bairro']);
      if (mounted) setState(() => _bairroDaLocalizacao = b?['nome'] as String?);
    } on ErroApi catch (e) {
      if (mounted) setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _localizando = false);
    }
  }

  void _escolherCidade(Map<String, dynamic> c) {
    _buscaCidade.text = '${c['nome']}, ${c['uf']}';
    FocusScope.of(context).unfocus();
    setState(() { _cidade = c; _sugestoes = []; _bairroDaLocalizacao = null; });
  }

  Future<void> _criar() async {
    if (!emailValido(_email.text)) {
      setState(() => _erro = 'Informe um e-mail válido.');
      return;
    }
    if (_cidade == null) {
      setState(() => _erro = 'Escolha a sua cidade na lista.');
      return;
    }
    if (!_aceite) {
      setState(() => _erro = 'Para criar a conta, aceite os Termos de uso e a Política de privacidade.');
      return;
    }
    setState(() { _enviando = true; _erro = null; });
    try {
      String? codigoDemo;
      final usuario = await Api.i.cadastrar(
        nome: _nome.text.trim(),
        email: _email.text.trim(),
        telefone: _telefone.text,
        // Sem campo de bairro: vai a cidade e, se a localização achou, o bairro
        municipioId: _cidade!['id'] as String,
        bairroNome: _bairroDaLocalizacao,
        posicao: _posicao,
        google: widget.google,
        aoPedirCodigo: (c) => codigoDemo = c,
      );
      if (!mounted) return;
      final nav = Navigator.of(context);
      if (usuario != null) {
        nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
      } else {
        nav.pushReplacement(MaterialPageRoute(builder: (_) => Entrar(email: _email.text.trim(), codigoDemo: codigoDemo)));
      }
    } on ErroApi catch (e) {
      setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final google = widget.google;
    return Scaffold(
      appBar: AppBar(title: const Text('Criar uma conta')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          if (google != null) ...[
            Row(children: [
              const LogoGoogle(),
              const SizedBox(width: 10),
              Expanded(child: Text('Conta Google: ${google.email ?? google.nome ?? ''}', style: t.bodyMedium)),
            ]),
            const SizedBox(height: 8),
            Text('Falta pouco: complete o seu cadastro no ELO.', style: t.titleMedium),
            const SizedBox(height: 20),
          ],
          if (_erro != null) AvisoErro(_erro!),
          TextField(
            controller: _nome,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(labelText: 'Nome'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _email,
            // Com Google, vale o e-mail confirmado pelo Google
            readOnly: google != null,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'E-mail'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _telefone,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(labelText: 'Telefone com DDD', hintText: '+55 11 99000-0000'),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _localizando ? null : _usarLocalizacao,
            icon: _localizando
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.my_location),
            label: Text(_localizando ? 'Procurando onde você está…' : 'Usar minha localização'),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 6, bottom: 12),
            child: Text(
              'O aparelho pergunta se você aceita compartilhar a localização (GPS ou rede). Usamos só para achar a sua cidade e mostrar o que '
              'está perto de você; não guardamos onde você mora.',
              style: TextStyle(fontSize: 13, color: EloCores.texto2),
            ),
          ),
          TextField(
            controller: _buscaCidade,
            onChanged: (t) {
              _posicao = null; // cidade digitada: a localização deixa de valer
              if (_cidade != null) setState(() { _cidade = null; _bairroDaLocalizacao = null; });
              _digitouCidade(t);
            },
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              labelText: 'Cidade',
              hintText: 'Digite e escolha na lista',
              prefixIcon: const Icon(Icons.location_city_outlined),
              suffixIcon: _cidade != null ? const Icon(Icons.check_circle, color: EloCores.sucesso) : null,
            ),
          ),
          if (_sugestoes.isNotEmpty)
            Cartao(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(children: [
                for (final c in _sugestoes)
                  ListTile(title: Text('${c['nome']}, ${c['uf']}'), onTap: () => _escolherCidade(c)),
              ]),
            ),
          const SizedBox(height: 16),
          CaixaAceite(aceito: _aceite, aoMudar: (v) => setState(() => _aceite = v)),
          const SizedBox(height: 16),
          FilledButton(onPressed: _enviando || !_aceite ? null : _criar, child: Text(_enviando ? 'Criando…' : 'Criar conta')),
          if (google == null) ...[
            const SizedBox(height: 12),
            Text('Vamos enviar um código para confirmar o seu e-mail. Não precisa de senha.', textAlign: TextAlign.center, style: t.bodyMedium),
          ],
        ]),
      ),
    );
  }
}
