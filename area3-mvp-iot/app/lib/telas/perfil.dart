import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'boas_vindas.dart';
import 'acompanhar.dart';

class Perfil extends StatelessWidget {
  const Perfil({super.key});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final u = Api.i.usuario!;
    return Scaffold(
      appBar: AppBar(title: const Text('Perfil', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Cartao(
          child: Row(children: [
            const CircleAvatar(radius: 30, backgroundColor: EloCores.brand100, child: Icon(Icons.person, color: EloCores.brand700, size: 32)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(u.nome, style: t.titleMedium),
                Text(u.voluntario ? 'Voluntário(a) verificado(a)' : 'Cidadã(o)', style: t.bodyMedium),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        _Atalho(icone: Icons.assignment_outlined, rotulo: 'Meus pedidos', tela: const Acompanhar(ajudas: false)),
        const SizedBox(height: 12),
        _Atalho(icone: Icons.handshake_outlined, rotulo: 'Minhas ajudas', tela: const Acompanhar(ajudas: true)),
        const SizedBox(height: 12),
        Cartao(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Seus dados', style: t.titleMedium),
            const SizedBox(height: 6),
            Text(
              'O ELO usa os seus dados só para organizar a ajuda (LGPD). Seu endereço nunca é mostrado no bairro, '
              'e o relato do pedido só é lido pela equipe técnica do CRAS.',
              style: t.bodyMedium,
            ),
          ]),
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: () async {
            await Api.i.sair();
            if (!context.mounted) return;
            Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const BoasVindas()), (_) => false);
          },
          icon: const Icon(Icons.logout),
          label: const Text('Sair'),
        ),
        const SizedBox(height: 16),
        Text('ELO · protótipo com dados fictícios', style: t.bodyMedium, textAlign: TextAlign.center),
      ]),
    );
  }
}

class _Atalho extends StatelessWidget {
  const _Atalho({required this.icone, required this.rotulo, required this.tela});
  final IconData icone;
  final String rotulo;
  final Widget tela;
  @override
  Widget build(BuildContext context) => Cartao(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => tela)),
        rotulo: rotulo,
        child: Row(children: [
          Icon(icone, color: EloCores.brand700),
          const SizedBox(width: 12),
          Expanded(child: Text(rotulo, style: const TextStyle(fontWeight: FontWeight.w700))),
          const Icon(Icons.chevron_right),
        ]),
      );
}
