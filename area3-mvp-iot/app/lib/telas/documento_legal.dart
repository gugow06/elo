import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../textos_legais.dart';
import '../widgets/login.dart';
import 'boas_vindas.dart';

/// Política de privacidade ou Termos de uso, por seções.
class DocumentoLegal extends StatelessWidget {
  const DocumentoLegal({super.key, required this.titulo, required this.secoes});
  final String titulo;
  final List<SecaoLegal> secoes;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w800))),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
          Text('Versão de $termosVigencia', style: t.bodyMedium),
          for (final (i, s) in secoes.indexed) ...[
            const SizedBox(height: 20),
            Semantics(header: true, child: Text('${i + 1}. ${s.titulo}', style: t.titleMedium)),
            for (final p in s.paragrafos) ...[
              const SizedBox(height: 8),
              Text(p, style: t.bodyLarge?.copyWith(height: 1.45)),
            ],
          ],
        ]),
      ),
    );
  }
}

void abrirPolitica(BuildContext context) => Navigator.of(context)
    .push(MaterialPageRoute(builder: (_) => const DocumentoLegal(titulo: 'Política de privacidade', secoes: politicaPrivacidade)));

void abrirTermos(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DocumentoLegal(titulo: 'Termos de uso', secoes: termosUso)));

/// "Li e aceito os Termos de uso e a Política de privacidade", com os dois nomes tocáveis.
class CaixaAceite extends StatelessWidget {
  const CaixaAceite({super.key, required this.aceito, required this.aoMudar});
  final bool aceito;
  final ValueChanged<bool> aoMudar;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    const link = TextStyle(color: EloCores.brand700, fontWeight: FontWeight.w800, decoration: TextDecoration.underline);
    return MergeSemantics(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Checkbox(value: aceito, onChanged: (v) => aoMudar(v ?? false)),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text.rich(
              TextSpan(style: t.bodyLarge, children: [
                const TextSpan(text: 'Li e aceito os '),
                TextSpan(text: 'Termos de uso', style: link, recognizer: TapGestureRecognizer()..onTap = () => abrirTermos(context)),
                const TextSpan(text: ' e a '),
                TextSpan(text: 'Política de privacidade', style: link, recognizer: TapGestureRecognizer()..onTap = () => abrirPolitica(context)),
                const TextSpan(text: ' do ELO.'),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Termos novos (ou conta criada antes dos termos): aceitar para continuar usando o app.
class AceiteTermos extends StatefulWidget {
  const AceiteTermos({super.key});
  @override
  State<AceiteTermos> createState() => _AceiteTermosState();
}

class _AceiteTermosState extends State<AceiteTermos> {
  bool _aceito = false;
  bool _enviando = false;
  String? _erro;

  Future<void> _continuar() async {
    setState(() { _enviando = true; _erro = null; });
    try {
      await Api.i.aceitarTermos();
      if (mounted) Navigator.of(context).pop(true);
    } on ErroApi catch (e) {
      if (mounted) setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: [
            const Icon(Icons.privacy_tip_outlined, size: 56, color: EloCores.brand700),
            const SizedBox(height: 16),
            Text('Termos de uso e Política de privacidade', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(
              'Para continuar usando o ELO, leia e aceite os Termos de uso e a Política de privacidade. '
              'Eles explicam como a rede funciona, o que as outras pessoas veem e como você controla os seus dados.',
              style: t.bodyLarge,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(onPressed: () => abrirTermos(context), icon: const Icon(Icons.description_outlined), label: const Text('Ler os Termos de uso')),
            const SizedBox(height: 8),
            OutlinedButton.icon(onPressed: () => abrirPolitica(context), icon: const Icon(Icons.shield_outlined), label: const Text('Ler a Política de privacidade')),
            const SizedBox(height: 16),
            CaixaAceite(aceito: _aceito, aoMudar: (v) => setState(() => _aceito = v)),
            if (_erro != null) AvisoErro(_erro!),
            const SizedBox(height: 16),
            FilledButton(onPressed: !_aceito || _enviando ? null : _continuar, child: Text(_enviando ? 'Salvando…' : 'Aceitar e continuar')),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () async {
                await Api.i.sair();
                if (!context.mounted) return;
                Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const BoasVindas()), (_) => false);
              },
              child: const Text('Agora não, sair da conta'),
            ),
          ]),
        ),
      ),
    );
  }
}
