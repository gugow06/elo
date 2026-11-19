import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../widgets/comum.dart';
import '../widgets/login.dart';
import 'entrar.dart';
import 'shell.dart';

/// Criação de conta de cidadão ou voluntário. Vinda do login social, já traz o nome
/// e vincula a conta do provedor; sem ele, o telefone é confirmado por código.
class CriarConta extends StatefulWidget {
  const CriarConta({super.key, this.social});
  final IdentidadeSocial? social;
  @override
  State<CriarConta> createState() => _CriarContaState();
}

class _CriarContaState extends State<CriarConta> {
  late final _nome = TextEditingController(text: widget.social?.nome);
  final _telefone = TextEditingController();
  List<dynamic>? _bairros;
  String? _bairroId;
  String _perfil = 'cidadao';
  bool _enviando = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregarBairros();
  }

  Future<void> _carregarBairros() async {
    try {
      final b = await Api.i.bairrosCadastro();
      if (mounted) setState(() => _bairros = b);
    } on ErroApi catch (e) {
      if (mounted) setState(() { _bairros = []; _erro = e.mensagem; });
    }
  }

  Future<void> _criar() async {
    if (_bairroId == null) {
      setState(() => _erro = 'Escolha o seu bairro.');
      return;
    }
    setState(() { _enviando = true; _erro = null; });
    try {
      String? codigoDemo;
      final usuario = await Api.i.cadastrar(
        nome: _nome.text.trim(),
        telefone: _telefone.text,
        bairroId: _bairroId!,
        perfil: _perfil,
        social: widget.social,
        aoPedirCodigo: (c) => codigoDemo = c,
      );
      if (!mounted) return;
      final nav = Navigator.of(context);
      if (usuario != null) {
        nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
      } else {
        nav.pushReplacement(MaterialPageRoute(builder: (_) => Entrar(telefone: _telefone.text, codigoDemo: codigoDemo)));
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
    final social = widget.social;
    return Scaffold(
      appBar: AppBar(title: const Text('Criar uma conta')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          if (social != null) ...[
            Row(children: [
              LogoProvedor(social.provedor, tamanho: 22),
              const SizedBox(width: 10),
              Expanded(child: Text('Conta ${social.provedor.nome}: ${social.email ?? social.nome}', style: t.bodyMedium)),
            ]),
            const SizedBox(height: 8),
            Text('Falta pouco: complete o seu cadastro no ELO.', style: t.titleMedium),
            const SizedBox(height: 20),
          ],
          if (_erro != null) AvisoErro(_erro!),
          Text('Como você quer usar o ELO?', style: t.titleMedium),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'cidadao', icon: Icon(Icons.volunteer_activism_outlined), label: Text('Preciso de ajuda')),
              ButtonSegment(value: 'voluntario', icon: Icon(Icons.handshake_outlined), label: Text('Quero ajudar')),
            ],
            selected: {_perfil},
            onSelectionChanged: (s) => setState(() => _perfil = s.first),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _nome,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(labelText: 'Nome'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _telefone,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(labelText: 'Telefone com DDD', hintText: '+55 11 99000-0000'),
          ),
          const SizedBox(height: 16),
          if (_bairros == null)
            const Carregando(texto: 'Carregando bairros…')
          else
            DropdownButtonFormField<String>(
              initialValue: _bairroId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Bairro'),
              items: [
                for (final b in _bairros!)
                  DropdownMenuItem(value: b['id'] as String, child: Text('${b['nome']} · ${b['municipio']}', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() => _bairroId = v),
            ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _enviando ? null : _criar, child: Text(_enviando ? 'Criando…' : 'Criar conta')),
          if (social == null) ...[
            const SizedBox(height: 12),
            Text('Vamos enviar um código para confirmar o seu telefone. Não precisa de senha.', textAlign: TextAlign.center, style: t.bodyMedium),
          ],
        ]),
      ),
    );
  }
}
