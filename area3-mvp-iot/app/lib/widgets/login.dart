import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';

/// Logo do provedor. Google usa o arquivo oficial (assets/google-g.png);
/// Apple e Facebook usam os ícones de marca do Material Icons.
class LogoProvedor extends StatelessWidget {
  const LogoProvedor(this.provedor, {super.key, this.tamanho = 26});
  final Provedor provedor;
  final double tamanho;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: switch (provedor) {
          Provedor.google => Image.asset('assets/google-g.png', width: tamanho, height: tamanho),
          Provedor.apple => Icon(Icons.apple, size: tamanho + 4, color: Colors.black),
          Provedor.facebook => Icon(Icons.facebook, size: tamanho + 2, color: const Color(0xFF1877F2)),
        },
      );
}

/// Botão quadrado de login social ("Ou continue com").
class BotaoProvedor extends StatelessWidget {
  const BotaoProvedor({super.key, required this.provedor, required this.onPressed});
  final Provedor provedor;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Continuar com ${provedor.nome}',
        excludeSemantics: true,
        child: Material(
          color: EloCores.superficie,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(EloRaio.md),
            side: const BorderSide(color: EloCores.borda, width: 1.5),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(EloRaio.md),
            onTap: onPressed,
            child: SizedBox(width: 64, height: 56, child: Center(child: LogoProvedor(provedor))),
          ),
        ),
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
