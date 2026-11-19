import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import '../widgets/login.dart';
import 'criar_conta.dart';
import 'shell.dart';

const _contasDemo = [
  ('Ana · cidadã · Jardim São Pedro', '+5511990000001'),
  ('Maria · cidadã · Vila Nova', '+5511990000002'),
  ('Cláudia · voluntária · Vila Nova', '+5511990000004'),
  ('Roberto · voluntário · Jardim', '+5511990000005'),
];

/// Entrar na conta ELO sem senha: telefone → código de 6 dígitos (RF-102).
/// Vindo da criação de conta, já abre na etapa do código ([telefone] e [codigoDemo]).
class Entrar extends StatefulWidget {
  const Entrar({super.key, this.telefone, this.codigoDemo});
  final String? telefone;
  final String? codigoDemo;
  @override
  State<Entrar> createState() => _EntrarState();
}

class _EntrarState extends State<Entrar> {
  late final _telefone = TextEditingController(text: widget.telefone);
  final _codigo = TextEditingController();
  late bool _etapaCodigo = widget.telefone != null;
  bool _enviando = false;
  late String? _codigoDemo = widget.codigoDemo;
  String? _erro;

  Future<void> _pedirCodigo() async {
    setState(() { _enviando = true; _erro = null; });
    try {
      _codigoDemo = await Api.i.pedirCodigo(_telefone.text);
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
      await Api.i.entrar(_telefone.text, _codigo.text);
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
            Text('Qual é o seu telefone?', style: t.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: _telefone,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              style: const TextStyle(fontSize: 20),
              decoration: const InputDecoration(labelText: 'Telefone com DDD', hintText: '+55 11 99000-0001'),
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
            for (final (rotulo, tel) in _contasDemo)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Cartao(
                  onTap: () => setState(() => _telefone.text = tel),
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
            Text('Enviamos por SMS para ${_telefone.text}.', style: t.bodyMedium),
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
            TextButton(onPressed: () => setState(() => _etapaCodigo = false), child: const Text('Usar outro telefone')),
          ],
        ]),
      ),
    );
  }
}
