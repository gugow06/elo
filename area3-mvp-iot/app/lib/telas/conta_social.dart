import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import '../widgets/login.dart';
import 'criar_conta.dart';
import 'shell.dart';

/// Contas fictícias de cada provedor, vinculadas no seed da API (CONTAS_SOCIAIS_DEMO).
const _contasDemo = <Provedor, List<IdentidadeSocial>>{
  Provedor.google: [
    IdentidadeSocial(provedor: Provedor.google, sujeito: 'demo-google-ana', nome: 'Ana Paula Ribeiro', email: 'ana.ribeiro@example.com'),
    IdentidadeSocial(provedor: Provedor.google, sujeito: 'demo-google-roberto', nome: 'Roberto Alves', email: 'roberto.alves@example.com'),
  ],
  Provedor.apple: [
    IdentidadeSocial(provedor: Provedor.apple, sujeito: 'demo-apple-claudia', nome: 'Cláudia Martins', email: 'claudia.martins@example.com'),
  ],
  Provedor.facebook: [
    IdentidadeSocial(provedor: Provedor.facebook, sujeito: 'demo-facebook-maria', nome: 'Maria das Dores Lima', email: 'maria.lima@example.com'),
  ],
};

/// Escolha da conta no provedor social. No protótipo o provedor é simulado:
/// numa versão real, aqui abriria o fluxo OAuth do Google, da Apple ou do Facebook.
class ContaSocial extends StatefulWidget {
  const ContaSocial({super.key, required this.provedor});
  final Provedor provedor;
  @override
  State<ContaSocial> createState() => _ContaSocialState();
}

class _ContaSocialState extends State<ContaSocial> {
  final _nome = TextEditingController();
  final _email = TextEditingController();
  bool _outraConta = false;
  bool _enviando = false;
  String? _erro;

  Future<void> _continuar(IdentidadeSocial id) async {
    setState(() { _enviando = true; _erro = null; });
    try {
      final usuario = await Api.i.entrarSocial(id);
      if (!mounted) return;
      final nav = Navigator.of(context);
      if (usuario != null) {
        nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
      } else {
        nav.pushReplacement(MaterialPageRoute(builder: (_) => CriarConta(social: id)));
      }
    } on ErroApi catch (e) {
      setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _usarOutraConta() {
    final email = _email.text.trim().toLowerCase();
    final nome = _nome.text.trim();
    if (nome.length < 2 || !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      setState(() => _erro = 'Informe o seu nome e um e-mail válido.');
      return;
    }
    _continuar(IdentidadeSocial(provedor: widget.provedor, sujeito: 'demo-${widget.provedor.name}-$email', nome: nome, email: email));
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final p = widget.provedor;
    return Scaffold(
      appBar: AppBar(title: Text('Continuar com ${p.nome}')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          Row(children: [
            LogoProvedor(p, tamanho: 32),
            const SizedBox(width: 12),
            Expanded(child: Text('Escolha uma conta ${p.nome}', style: t.titleLarge)),
          ]),
          const SizedBox(height: 12),
          Selo('Protótipo: o login com ${p.nome} é simulado, com contas fictícias.'),
          const SizedBox(height: 20),
          if (_erro != null) AvisoErro(_erro!),
          for (final id in _contasDemo[p]!)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Cartao(
                onTap: _enviando ? null : () => _continuar(id),
                rotulo: 'Continuar como ${id.nome}, ${id.email}',
                child: Row(children: [
                  CircleAvatar(
                    backgroundColor: EloCores.brand100,
                    foregroundColor: EloCores.brand900,
                    child: Text(id.nome[0], style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(id.nome, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(id.email!, style: t.bodyMedium?.copyWith(fontSize: 14)),
                    ]),
                  ),
                ]),
              ),
            ),
          const SizedBox(height: 8),
          if (!_outraConta)
            OutlinedButton.icon(
              onPressed: _enviando ? null : () => setState(() => _outraConta = true),
              icon: const Icon(Icons.person_add_alt_outlined),
              label: const Text('Usar outra conta'),
            )
          else ...[
            Text('Outra conta ${p.nome}', style: t.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _nome,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              decoration: const InputDecoration(labelText: 'Nome'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'E-mail'),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _enviando ? null : _usarOutraConta, child: Text(_enviando ? 'Entrando…' : 'Continuar')),
          ],
        ]),
      ),
    );
  }
}
