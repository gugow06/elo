import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';

/// Avisos do ELO: voluntário assumiu, doação disponível, "Sua ajuda chegou", pedido escalado.
class Notificacoes extends StatefulWidget {
  const Notificacoes({super.key});
  @override
  State<Notificacoes> createState() => _NotificacoesState();
}

class _NotificacoesState extends State<Notificacoes> {
  late final Future<List<dynamic>> _itens = Api.i.notificacoes().whenComplete(() => Api.i.marcarLidas().catchError((_) {}));

  static IconData _icone(String tipo) => switch (tipo) {
        'sua_ajuda_chegou' => Icons.favorite,
        'doacao_disponivel' => Icons.inventory_2,
        'voluntario_assumiu' => Icons.handshake,
        'escalado' => Icons.account_balance,
        _ => Icons.notifications,
      };

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Mensagens', style: TextStyle(fontWeight: FontWeight.w800))),
      body: FutureBuilder<List<dynamic>>(
        future: _itens,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Carregando();
          final itens = (snap.data ?? []).cast<Map<String, dynamic>>();
          if (itens.isEmpty) return Padding(padding: const EdgeInsets.all(24), child: Text('Nenhuma mensagem por enquanto.', style: t.bodyLarge));
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
