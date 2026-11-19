import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'pedido_detalhe.dart';
import 'todos_pedidos.dart';
import 'shell.dart';

/// Tela 2 do mockup: saudação, busca, 4 atalhos e pedidos próximos.
class Inicio extends StatefulWidget {
  const Inicio({super.key, required this.aoPedirAjuda, required this.aoAbrirMapa});
  final VoidCallback aoPedirAjuda;
  final VoidCallback aoAbrirMapa;
  @override
  State<Inicio> createState() => _InicioState();
}

class _InicioState extends State<Inicio> {
  late Future<List<dynamic>> _pedidos;
  int _naoLidas = 0;
  String _busca = '';

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  void _carregar() {
    _pedidos = Api.i.mural();
    Api.i.notificacoes().then((n) {
      if (mounted) setState(() => _naoLidas = n.where((x) => x['lida'] != true).length);
    }).catchError((_) {});
    setState(() {});
  }

  String get _saudacao {
    final h = DateTime.now().hour;
    return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final u = Api.i.usuario!;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async => _carregar(),
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 100), children: [
          Row(children: [
            Semantics(label: 'ELO', image: true, child: Image.asset('assets/elo-logo-ajustada.png', height: 30)),
            const Spacer(),
            Semantics(
              button: true,
              label: _naoLidas > 0 ? 'Notificações, $_naoLidas não lidas' : 'Notificações',
              excludeSemantics: true,
              child: IconButton(
                iconSize: 28,
                onPressed: () async {
                  abrirNotificacoes(context);
                  setState(() => _naoLidas = 0);
                },
                icon: Badge(isLabelVisible: _naoLidas > 0, label: Text('$_naoLidas'), child: const Icon(Icons.notifications_none, color: EloCores.brand900)),
              ),
            ),
            const SizedBox(width: 4),
            CircleAvatar(
              radius: 22,
              backgroundColor: EloCores.brand100,
              child: Semantics(label: 'Perfil de ${u.nome}', child: const Icon(Icons.person, color: EloCores.brand700)),
            ),
          ]),
          const SizedBox(height: 16),
          Text('$_saudacao, ${u.primeiroNome}! 👋', style: t.headlineMedium),
          Text('Como podemos te ajudar hoje?', style: t.bodyLarge),
          const SizedBox(height: 16),
          TextField(
            onChanged: (v) => setState(() => _busca = v.toLowerCase()),
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Buscar ajuda, serviços ou oportunidades…',
              labelText: 'Buscar',
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.35,
            children: [
              _Atalho(rotulo: 'Pedir ajuda', icone: Icons.favorite, cor: EloCores.pedido, fundo: EloCores.pedidoClaro,
                  onTap: widget.aoPedirAjuda),
              _Atalho(rotulo: 'Oferecer ajuda', icone: Icons.handshake, cor: EloCores.voluntario, fundo: EloCores.voluntarioClaro, onTap: widget.aoAbrirMapa),
              _Atalho(rotulo: 'Serviços públicos', icone: Icons.account_balance, cor: EloCores.servico, fundo: EloCores.servicoClaro, onTap: widget.aoAbrirMapa),
              _Atalho(rotulo: 'Oportunidades de emprego e cursos', icone: Icons.work, cor: EloCores.oportunidade, fundo: EloCores.oportunidadeClaro,
                  onTap: () => avisar(context, 'Oportunidades de emprego e cursos chegam em breve.')),
            ],
          ),
          const SizedBox(height: 24),
          Row(children: [
            Expanded(child: Text('Pedidos próximos de você', style: t.titleMedium, semanticsLabel: 'Pedidos próximos de você')),
            TextButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TodosPedidos())), child: const Text('Ver todos  ›', style: TextStyle(color: EloCores.brand700, fontWeight: FontWeight.w800))),
          ]),
          const SizedBox(height: 8),
          FutureBuilder<List<dynamic>>(
            future: _pedidos,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const Carregando(texto: 'Carregando pedidos próximos');
              if (snap.hasError) return Text('${snap.error}', style: const TextStyle(color: EloCores.erro));
              final lista = snap.data!
                  .cast<Map<String, dynamic>>()
                  .where((p) => _busca.isEmpty || '${p['titulo']} ${p['bairro']} ${categorias[p['categoria']]}'.toLowerCase().contains(_busca))
                  .take(5)
                  .toList();
              if (lista.isEmpty) return Text('Nenhum pedido aberto no seu bairro agora. 💚', style: t.bodyLarge);
              return Column(children: [
                for (final p in lista)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: CartaoPedido(
                      pedido: p,
                      onTap: () async {
                        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PedidoDetalhe(pedido: p)));
                        _carregar();
                      },
                    ),
                  ),
              ]);
            },
          ),
        ]),
      ),
    );
  }
}

class _Atalho extends StatelessWidget {
  const _Atalho({required this.rotulo, required this.icone, required this.cor, required this.fundo, required this.onTap});
  final String rotulo;
  final IconData icone;
  final Color cor;
  final Color fundo;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: rotulo,
        excludeSemantics: true,
        child: Material(
          color: fundo,
          borderRadius: BorderRadius.circular(EloRaio.lg),
          child: InkWell(
            borderRadius: BorderRadius.circular(EloRaio.lg),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icone, color: cor, size: 40),
                const SizedBox(height: 8),
                Text(rotulo,
                    textAlign: TextAlign.center,
                    maxLines: 3,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: cor == EloCores.voluntario ? EloCores.voluntario : EloCores.brand900)),
              ]),
            ),
          ),
        ),
      );
}
