import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import '../widgets/login.dart';
import 'criar_conta.dart';
import 'shell.dart';

const _contasDemo = [
  ('Ana · cidadã · Jardim São Pedro', 'ana.ribeiro@example.com'),
  ('Maria · cidadã · Vila Nova', 'maria.lima@example.com'),
  ('Cláudia · voluntária · Vila Nova', 'claudia.martins@example.com'),
  ('Roberto · voluntário · Jardim', 'roberto.alves@example.com'),
];

/// Entrar na conta ELO sem senha: e-mail → código de 6 dígitos enviado por e-mail (RF-102).
/// Vindo da criação de conta, já abre na etapa do código ([email] e [codigoDemo]).
class Entrar extends StatefulWidget {
  const Entrar({super.key, this.email, this.codigoDemo});
  final String? email;
  final String? codigoDemo;
  @override
  State<Entrar> createState() => _EntrarState();
}

class _EntrarState extends State<Entrar> {
  late final _email = TextEditingController(text: widget.email);
  final _codigo = TextEditingController();
  late bool _etapaCodigo = widget.email != null;
  bool _enviando = false;
  late String? _codigoDemo = widget.codigoDemo;
  String? _erro;

  Future<void> _pedirCodigo() async {
    setState(() { _enviando = true; _erro = null; });
    try {
      if (!emailValido(_email.text)) throw ErroApi(400, 'Informe um e-mail válido.');
      _codigoDemo = await Api.i.pedirCodigo(_email.text.trim());
      setState(() => _etapaCodigo = true);
    } on ErroApi catch (e) {
      setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Future<void> _entrar() async {
    setState(() { _enviando = true; _erro = null; });
    try {
      await Api.i.entrar(_email.text.trim(), _codigo.text);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
    } on ErroApi catch (e) {
      setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Entrar na minha conta')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          if (_erro != null) AvisoErro(_erro!),
          if (!_etapaCodigo) ...[
            Text('Qual é o seu e-mail?', style: t.titleLarge),
            const SizedBox(height: 8),
            Text('Vamos enviar um código de 6 dígitos. Não precisa de senha.', style: t.bodyMedium),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              autocorrect: false,
              style: const TextStyle(fontSize: 18),
              decoration: const InputDecoration(labelText: 'E-mail', hintText: 'voce@exemplo.com'),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _enviando ? null : _pedirCodigo, child: Text(_enviando ? 'Enviando…' : 'Receber código')),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const CriarConta())),
              child: const Text('Ainda não tem conta? Criar uma conta'),
            ),
            const SizedBox(height: 28),
            Text('Contas de demonstração (fictícias)', style: t.titleMedium),
            const SizedBox(height: 8),
            for (final (rotulo, email) in _contasDemo)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Cartao(
                  onTap: () => setState(() => _email.text = email),
                  rotulo: 'Usar a conta $rotulo',
                  child: Row(children: [
                    const Icon(Icons.person_outline, color: EloCores.brand700),
                    const SizedBox(width: 12),
                    Expanded(child: Text(rotulo, style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ),
              ),
          ] else ...[
            Text('Digite o código de 6 dígitos', style: t.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Se ${_email.text.trim()} tiver conta no ELO, o código chega em instantes. Confira também a caixa de spam.',
              style: t.bodyMedium,
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const CriarConta())),
              child: const Text('Ainda não tem conta? Criar uma conta'),
            ),
            if (_codigoDemo != null) ...[
              const SizedBox(height: 12),
              Selo('Modo demonstração: o código é $_codigoDemo'),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _codigo,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 30, letterSpacing: 10, fontWeight: FontWeight.w800),
              decoration: const InputDecoration(labelText: 'Código'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _enviando || _codigo.text.length != 6 ? null : _entrar, child: Text(_enviando ? 'Entrando…' : 'Entrar')),
            TextButton(onPressed: _enviando ? null : _pedirCodigo, child: const Text('Reenviar código')),
            TextButton(onPressed: () => setState(() => _etapaCodigo = false), child: const Text('Usar outro e-mail')),
          ],
        ]),
      ),
    );
  }
}
