import 'package:material_ui/material_ui.dart';

import '../tema.dart';
import 'entrar.dart';

/// Tela 1 do mockup. Em vez de login social, o PRD pede gov.br + código por SMS (RF-101/102).
class BoasVindas extends StatelessWidget {
  const BoasVindas({super.key});

  void _entrar(BuildContext context, {required bool govbr}) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => Entrar(viaGovBr: govbr)));

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: Column(children: [
        Expanded(
          child: Stack(fit: StackFit.expand, children: [
            // Foto de fundo (céu + skyline); decorativa, o leitor de tela ignora.
            const ExcludeSemantics(
              child: Image(
                image: AssetImage('assets/signin-bg.png'),
                fit: BoxFit.cover,
                alignment: Alignment.bottomCenter,
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 48, 28, 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Semantics(label: 'ELO', image: true, child: Image.asset('assets/elo-logo.png', height: 96)),
                  const SizedBox(height: 28),
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
            borderRadius: BorderRadius.vertical(top: Radius.circular(EloRaio.xl)),
            boxShadow: [BoxShadow(color: Color(0x22003B2E), blurRadius: 16)],
          ),
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: EloCores.borda, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: () => _entrar(context, govbr: true),
                icon: const Icon(Icons.account_circle_outlined),
                label: const Text('Entrar com gov.br'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => _entrar(context, govbr: false),
                icon: const Icon(Icons.sms_outlined),
                label: const Text('Receber código por SMS'),
              ),
              const SizedBox(height: 14),
              Text('Não precisa de senha. No primeiro acesso, o seu cadastro é criado.', textAlign: TextAlign.center, style: t.bodyMedium),
            ]),
          ),
        ),
      ]),
    );
  }
}
