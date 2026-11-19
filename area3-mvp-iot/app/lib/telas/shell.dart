import 'package:material_ui/material_ui.dart';

import '../tema.dart';
import 'acompanhar.dart';
import 'inicio.dart';
import 'mapa.dart';
import 'notificacoes.dart';
import 'perfil.dart';
import 'pedir_ajuda.dart';

/// Navegação inferior do mockup: Início, Mapa, Publicar (+), Mensagens, Perfil.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _aba = 0;

  void _irPara(int aba) => setState(() => _aba = aba);

  /// Qualquer usuário publica um pedido de ajuda; depois acompanha em Perfil > Meus pedidos.
  Future<void> _publicar() async {
    final nav = Navigator.of(context);
    final criado = await nav.push<bool>(MaterialPageRoute(builder: (_) => const PedirAjuda()));
    if (criado == true && mounted) nav.push(MaterialPageRoute(builder: (_) => const Acompanhar(ajudas: false)));
  }

  @override
  Widget build(BuildContext context) {
    final telas = [
      Inicio(aoPedirAjuda: _publicar, aoAbrirMapa: () => _irPara(1)),
      const MapaRede(),
      const SizedBox.shrink(),
      const Notificacoes(),
      const Perfil(),
    ];
    return Scaffold(
      body: IndexedStack(index: _aba, children: telas),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: Semantics(
        button: true,
        label: 'Publicar pedido de ajuda',
        excludeSemantics: true,
        child: FloatingActionButton(
          onPressed: _publicar,
          backgroundColor: EloCores.brand600,
          foregroundColor: Colors.white,
          shape: const CircleBorder(),
          child: const Icon(Icons.add, size: 32),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) => i == 2 ? _publicar() : _irPara(i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Início'),
          NavigationDestination(icon: Icon(Icons.place_outlined), selectedIcon: Icon(Icons.place), label: 'Mapa'),
          NavigationDestination(icon: SizedBox(width: 24), label: 'Publicar'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Mensagens'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Perfil'),
        ],
      ),
    );
  }
}

/// Atalho para abrir as notificações a partir do sino do cabeçalho.
void abrirNotificacoes(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const Notificacoes()));
