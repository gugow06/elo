import 'package:material_ui/material_ui.dart';

import '../tema.dart';

/// Validação simples de e-mail (a API confere de novo).
bool emailValido(String e) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(e.trim());

/// Logo oficial do Google (arquivo estático assets/google-g.png).
class LogoGoogle extends StatelessWidget {
  const LogoGoogle({super.key, this.tamanho = 22});
  final double tamanho;
  @override
  Widget build(BuildContext context) =>
      ExcludeSemantics(child: Image.asset('assets/google-g.png', width: tamanho, height: tamanho));
}

/// Botão "Continuar com Google" (abaixo de "Ou continue com").
class BotaoGoogle extends StatelessWidget {
  const BotaoGoogle({super.key, required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: onPressed,
        icon: const LogoGoogle(),
        label: const Text('Continuar com Google'),
      );
}

/// Linha divisória com texto no meio.
class DivisorTexto extends StatelessWidget {
  const DivisorTexto(this.texto, {super.key});
  final String texto;

  @override
  Widget build(BuildContext context) => Row(children: [
        const Expanded(child: Divider(color: EloCores.borda, thickness: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(texto, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 14)),
        ),
        const Expanded(child: Divider(color: EloCores.borda, thickness: 1)),
      ]);
}

/// Caixa de erro lida pelo leitor de tela assim que aparece.
class AvisoErro extends StatelessWidget {
  const AvisoErro(this.mensagem, {super.key});
  final String mensagem;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFFFDE4E4), borderRadius: BorderRadius.circular(EloRaio.md)),
          child: Text(mensagem, style: const TextStyle(color: EloCores.erro, fontWeight: FontWeight.w700)),
        ),
      );
}
