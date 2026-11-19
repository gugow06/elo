import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';

/// Notificações do sistema numa tela própria (sino do Início).
class Notificacoes extends StatelessWidget {
  const Notificacoes({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notificações do sistema', style: TextStyle(fontWeight: FontWeight.w800))),
        body: const ListaNotificacoes(),
      );
}

/// Avisos do ELO: voluntário assumiu, doação disponível, "Sua ajuda chegou", pedido escalado.
/// Abrir a lista marca os avisos como lidos.
class ListaNotificacoes extends StatefulWidget {
  const ListaNotificacoes({super.key, this.aoLer});
  /// Chamado depois de marcar como lidas (a aba Mensagens atualiza o número).
  final VoidCallback? aoLer;
  @override
  State<ListaNotificacoes> createState() => _ListaNotificacoesState();
}

class _ListaNotificacoesState extends State<ListaNotificacoes> {
  late Future<List<dynamic>> _itens = _buscar();

  Future<List<dynamic>> _buscar() => Api.i.notificacoes().whenComplete(() => Api.i.marcarLidas().then((_) => widget.aoLer?.call()).catchError((_) {}));

  Future<void> _atualizar() async {
    final f = _buscar();
    setState(() => _itens = f);
    await f;
  }

  static IconData _icone(String tipo) => switch (tipo) {
        'sua_ajuda_chegou' => Icons.favorite,
        'doacao_disponivel' => Icons.inventory_2,
        'voluntario_assumiu' => Icons.handshake,
        'escalado' => Icons.account_balance,
        'pedido_encerrado' || 'ajuda_cancelada' => Icons.info_outline,
        _ => Icons.notifications,
      };

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return RefreshIndicator(
        onRefresh: _atualizar,
        child: FutureBuilder<List<dynamic>>(
        future: _itens,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Carregando();
          final itens = (snap.data ?? []).cast<Map<String, dynamic>>();
          if (itens.isEmpty) return ListView(padding: const EdgeInsets.all(24), children: [Text('Nenhum aviso do sistema por enquanto.', style: t.bodyLarge)]);
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: itens.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final n = itens[i];
              final destaque = n['tipo'] == 'sua_ajuda_chegou';
              return Cartao(
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(
                    backgroundColor: destaque ? EloCores.sucessoClaro : EloCores.brand100,
                    child: Icon(_icone(n['tipo']), color: destaque ? EloCores.sucesso : EloCores.brand700),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n['texto'], style: t.bodyLarge?.copyWith(fontWeight: n['lida'] == true ? FontWeight.w500 : FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(tempoRelativo(n['criado_em']), style: t.bodyMedium),
                    ]),
                  ),
                ]),
              );
            },
          );
        },
      ),
    );
  }
}
