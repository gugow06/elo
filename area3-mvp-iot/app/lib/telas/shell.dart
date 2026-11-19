import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import 'acompanhar.dart';
import 'documento_legal.dart';
import 'inicio.dart';
import 'mapa.dart';
import 'mensagens.dart';
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
  final _mensagens = GlobalKey<MensagensState>();
  int _naoLidas = 0;
  Timer? _relogio;

  @override
  void initState() {
    super.initState();
    _contar();
    _relogio = Timer.periodic(const Duration(seconds: 30), (_) => _contar());
    WidgetsBinding.instance.addPostFrameCallback((_) => _conferirTermos());
  }

  @override
  void dispose() {
    _relogio?.cancel();
    super.dispose();
  }

  /// Número na aba Mensagens: mensagens não lidas + notificações do sistema não lidas.
  Future<void> _contar() async {
    try {
      final n = await Api.i.naoLidas();
      if (mounted) setState(() => _naoLidas = n.mensagens + n.notificacoes);
    } on ErroApi {
      // sem conexão: tenta no próximo ciclo
    }
  }

  /// Conta criada antes dos termos, ou termos novos: pede o aceite antes de continuar.
  Future<void> _conferirTermos() async {
    try {
      final termos = (await Api.i.perfil())['termos'] as Map?;
      if (termos == null || termos['versao_aceita'] == termos['versao_atual'] || !mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const AceiteTermos()));
    } on ErroApi {
      // sem conexão: confere na próxima abertura
    }
  }

  void _irPara(int aba) {
    setState(() => _aba = aba);
    if (aba == 3) _mensagens.currentState?.atualizar();
  }

  /// Qualquer usuário publica um pedido de ajuda; depois acompanha em Perfil > Meus pedidos.
  Future<void> _publicar() async {
    final nav = Navigator.of(context);
    final criado = await nav.push<bool>(MaterialPageRoute(builder: (_) => const PedirAjuda()));
    if (criado == true && mounted) nav.push(MaterialPageRoute(builder: (_) => const Acompanhar(ajudas: false)));
  }

  @override
  Widget build(BuildContext context) {
    final telas = [
      Inicio(aoPedirAjuda: _publicar, aoAbrirMapa: () => _irPara(1), aoAbrirPerfil: () => _irPara(4)),
      const MapaRede(),
      const SizedBox.shrink(),
      Mensagens(key: _mensagens, aoMudarNaoLidas: _contar),
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
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Início'),
          const NavigationDestination(icon: Icon(Icons.place_outlined), selectedIcon: Icon(Icons.place), label: 'Mapa'),
          const NavigationDestination(icon: SizedBox(width: 24), label: 'Publicar'),
          NavigationDestination(
            icon: Badge(isLabelVisible: _naoLidas > 0, label: Text('$_naoLidas'), child: const Icon(Icons.chat_bubble_outline)),
            selectedIcon: Badge(isLabelVisible: _naoLidas > 0, label: Text('$_naoLidas'), child: const Icon(Icons.chat_bubble)),
            label: 'Mensagens',
            tooltip: _naoLidas > 0 ? 'Mensagens, $_naoLidas não lidas' : 'Mensagens',
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
