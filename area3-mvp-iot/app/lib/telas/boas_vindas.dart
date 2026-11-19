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
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFBFE0F5), Color(0xFFF3E9D2), Color(0xFFDDEFD9)],
                ),
              ),
            ),
            const Positioned(left: 0, right: 0, bottom: 0, height: 220, child: ExcludeSemantics(child: CustomPaint(painter: _Cidade()))),
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

/// Silhueta de prédios e árvores, decorativa (o leitor de tela ignora).
class _Cidade extends CustomPainter {
  const _Cidade();
  @override
  void paint(Canvas canvas, Size s) {
    final predio = Paint()..color = const Color(0xFF9FB8B0);
    final predio2 = Paint()..color = const Color(0xFF7C9A91);
    final arvore = Paint()..color = const Color(0xFF2E7D5B);
    final arvore2 = Paint()..color = const Color(0xFF1F6649);
    final larguras = [0.08, 0.06, 0.1, 0.07, 0.09, 0.05, 0.08, 0.1, 0.06];
    final alturas = [0.55, 0.75, 0.45, 0.9, 0.6, 0.7, 0.5, 0.8, 0.65];
    var x = s.width * 0.05;
    for (var i = 0; i < larguras.length; i++) {
      final w = s.width * larguras[i];
      final h = s.height * alturas[i];
      canvas.drawRect(Rect.fromLTWH(x, s.height - h, w, h), i.isEven ? predio : predio2);
      x += w + s.width * 0.015;
    }
    for (var i = 0; i < 14; i++) {
      final cx = s.width * (i / 13);
      final r = s.height * (0.16 + (i % 3) * 0.04);
      canvas.drawCircle(Offset(cx, s.height - r * 0.6), r, i.isEven ? arvore : arvore2);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
