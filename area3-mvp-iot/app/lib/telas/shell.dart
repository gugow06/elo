import 'package:material_ui/material_ui.dart';

import '../api.dart';
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

  Future<void> _publicar() async {
    final u = Api.i.usuario!;
    if (u.voluntario) {
      _irPara(1); // voluntário "publica" ajudando: abre o mapa/mural
      return;
    }
    final criado = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const PedirAjuda()));
    if (criado == true) _irPara(3);
  }

  @override
  Widget build(BuildContext context) {
    final telas = [
      Inicio(aoPedirAjuda: _publicar, aoAbrirMapa: () => _irPara(1)),
      const MapaRede(),
      const SizedBox.shrink(),
      const Acompanhar(),
      const Perfil(),
    ];
    return Scaffold(
      body: IndexedStack(index: _aba, children: telas),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: Semantics(
        button: true,
        label: Api.i.usuario!.voluntario ? 'Oferecer ajuda' : 'Pedir ajuda',
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
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Início'),
          const NavigationDestination(icon: Icon(Icons.place_outlined), selectedIcon: Icon(Icons.place), label: 'Mapa'),
          const NavigationDestination(icon: SizedBox(width: 24), label: 'Publicar'),
          NavigationDestination(
            icon: const Icon(Icons.assignment_outlined),
            selectedIcon: const Icon(Icons.assignment),
            label: Api.i.usuario!.voluntario ? 'Minhas ajudas' : 'Meus pedidos',
          ),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Perfil'),
        ],
      ),
    );
  }
}

/// Atalho para abrir as notificações a partir do sino do cabeçalho.
void abrirNotificacoes(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const Notificacoes()));
