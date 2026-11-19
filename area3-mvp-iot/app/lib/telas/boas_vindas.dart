import 'package:material_ui/material_ui.dart';

import '../tema.dart';
import '../widgets/login.dart';
import '../google.dart';
import 'criar_conta.dart';
import 'entrar.dart';

/// Tela 1 do mockup: entrar, criar conta ou continuar com Google.
class BoasVindas extends StatelessWidget {
  const BoasVindas({super.key});

  /// Raio dos cantos de cima do painel branco.
  static const _raioPainel = 32.0;

  void _abrir(BuildContext context, Widget tela) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => tela));

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: Column(children: [
        Expanded(
          child: Stack(fit: StackFit.expand, clipBehavior: Clip.none, children: [
            // Foto de fundo (céu + skyline); decorativa, o leitor de tela ignora. Ela continua por
            // baixo do painel branco, para os cantos arredondados do painel aparecerem sobre a foto.
            const Positioned(
              left: 0,
              right: 0,
              top: 0,
              bottom: -_raioPainel,
              child: ExcludeSemantics(
                child: Image(
                  image: AssetImage('assets/signin-bg.png'),
                  fit: BoxFit.cover,
                  alignment: Alignment.bottomCenter,
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 40, 28, 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Center(child: Semantics(label: 'ELO', image: true, child: Image.asset('assets/elo-logo-ajustada.png', height: 72))),
                  const SizedBox(height: 24),
                  Text('Cidadãos conectam.\nComunidades fortalecem.\nO município avança.',
                      style: t.titleLarge?.copyWith(color: EloCores.brand900, height: 1.3)),
                  const SizedBox(height: 12),
                  Container(width: 44, height: 4, decoration: BoxDecoration(color: EloCores.brand600, borderRadius: BorderRadius.circular(2))),
                ]),
              ),
            ),
          ]),
        ),
        Container(
          decoration: const BoxDecoration(
            color: EloCores.superficie,
            borderRadius: BorderRadius.vertical(top: Radius.circular(_raioPainel)),
            boxShadow: [BoxShadow(color: Color(0x1F003B2E), blurRadius: 24, offset: Offset(0, -4))],
          ),
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              FilledButton.icon(
                onPressed: () => _abrir(context, const Entrar()),
                icon: const Icon(Icons.person_outline),
                label: const Text('Entrar na minha conta'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => _abrir(context, const CriarConta()),
                icon: const Icon(Icons.person_add_alt_outlined),
                label: const Text('Criar uma conta'),
              ),
              const SizedBox(height: 20),
              const DivisorTexto('Ou continue com'),
              const SizedBox(height: 16),
              const BotaoGoogle(),
            ]),
          ),
        ),
      ]),
    );
  }
}
