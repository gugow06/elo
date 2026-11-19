import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../widgets/comum.dart';
import '../widgets/login.dart';

/// Pede o código de 6 dígitos enviado por e-mail. Usada no segundo passo do login com Google
/// e para ativar ou desativar a verificação em duas etapas.
class CodigoEmail extends StatefulWidget {
  const CodigoEmail({super.key, required this.titulo, required this.email, required this.aoConfirmar, this.codigoDemo, this.botao = 'Confirmar'});
  final String titulo;
  final String email;
  final String? codigoDemo;
  final String botao;
  /// Lança [ErroApi] se o código não servir; a tela mostra a mensagem.
  final Future<void> Function(String codigo) aoConfirmar;
  @override
  State<CodigoEmail> createState() => _CodigoEmailState();
}

class _CodigoEmailState extends State<CodigoEmail> {
  final _codigo = TextEditingController();
  bool _enviando = false;
  String? _erro;

  Future<void> _confirmar() async {
    setState(() { _enviando = true; _erro = null; });
    try {
      await widget.aoConfirmar(_codigo.text);
    } on ErroApi catch (e) {
      if (mounted) setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.titulo)),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          if (_erro != null) AvisoErro(_erro!),
          Text('Digite o código de 6 dígitos', style: t.titleLarge),
          const SizedBox(height: 8),
          Text('Enviamos para ${widget.email}. Confira também a caixa de spam.', style: t.bodyMedium),
          if (widget.codigoDemo != null) ...[
            const SizedBox(height: 12),
            Selo('Modo demonstração: o código é ${widget.codigoDemo}'),
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
          FilledButton(
            onPressed: _enviando || _codigo.text.length != 6 ? null : _confirmar,
            child: Text(_enviando ? 'Confirmando…' : widget.botao),
          ),
        ]),
      ),
    );
  }
}
