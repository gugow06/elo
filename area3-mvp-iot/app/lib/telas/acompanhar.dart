import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import '../widgets/itens.dart';

/// "Meus pedidos": status em linguagem simples e confirmação de retirada.
/// "Minhas ajudas" ([ajudas]): pedidos que a pessoa assumiu, com o desfecho ("Sua ajuda chegou", P6).
/// Os dois ficam no Perfil e valem para qualquer usuário.
class Acompanhar extends StatefulWidget {
  const Acompanhar({super.key, required this.ajudas});
  final bool ajudas;
  @override
  State<Acompanhar> createState() => _AcompanharState();
}

class _AcompanharState extends State<Acompanhar> {
  late Future<List<dynamic>> _itens;
  bool get _voluntario => widget.ajudas;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  void _carregar() => setState(() => _itens = _voluntario ? Api.i.minhasOfertas() : Api.i.meusPedidos());

  Future<void> _marcar(String pedidoId, String itemId, bool obtido) async {
    try {
      final r = await Api.i.marcarItem(pedidoId, itemId, obtido);
      if (!mounted) return;
      if (r['concluido'] == true) avisar(context, 'Tudo recebido! Avisamos quem ajudou. Obrigado por usar o ELO.');
      _carregar();
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    }
  }

  Future<void> _confirmar(String id) async {
    try {
      await Api.i.confirmarRecebimento(id);
      if (mounted) avisar(context, 'Obrigado! Avisamos quem ajudou que a doação chegou até você.');
      _carregar();
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(_voluntario ? 'Minhas ajudas' : 'Meus pedidos', style: const TextStyle(fontWeight: FontWeight.w800))),
      body: RefreshIndicator(
        onRefresh: () async => _carregar(),
        child: FutureBuilder<List<dynamic>>(
          future: _itens,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Carregando();
            if (snap.hasError) return ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('${snap.error}'))]);
            final itens = snap.data!.cast<Map<String, dynamic>>();
            if (itens.isEmpty) {
              return ListView(padding: const EdgeInsets.all(24), children: [
                Text(_voluntario ? 'Você ainda não assumiu nenhum pedido. Veja o mapa da rede para começar. 💚' : 'Você ainda não fez nenhum pedido.', style: t.bodyLarge),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              itemCount: itens.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _voluntario ? _CartaoAjuda(o: itens[i]) : _CartaoMeuPedido(p: itens[i], aoConfirmar: _confirmar, aoMarcar: _marcar),
            );
          },
        ),
      ),
    );
  }
}

class _CartaoMeuPedido extends StatelessWidget {
  const _CartaoMeuPedido({required this.p, required this.aoConfirmar, required this.aoMarcar});
  final Map<String, dynamic> p;
  final void Function(String) aoConfirmar;
  final void Function(String pedidoId, String itemId, bool obtido) aoMarcar;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final status = p['status'] as String;
    final itens = ItemPedido.daLista(p['itens']);
    const etapas = ['recebida', 'no_mural', 'em_atendimento', 'entregue', 'concluida'];
    final etapa = status == 'na_fila_tecnica' ? 1 : etapas.indexOf(status).clamp(0, 4);
    return Cartao(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(p['titulo'], style: t.titleMedium)),
          Semantics(
            label: 'Protocolo ${(p['protocolo'] as String).split('').join(' ')}',
            excludeSemantics: true,
            child: Text(p['protocolo'], style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 3, color: EloCores.brand900)),
          ),
        ]),
        const SizedBox(height: 8),
        Selo(p['status_texto']),
        const SizedBox(height: 12),
        Semantics(
          label: 'Etapa ${etapa + 1} de 5',
          child: Row(children: [
            for (var i = 0; i < 5; i++) ...[
              Expanded(child: Container(height: 6, decoration: BoxDecoration(color: i <= etapa ? EloCores.brand600 : EloCores.borda, borderRadius: BorderRadius.circular(3)))),
              if (i < 4) const SizedBox(width: 4),
            ],
          ]),
        ),
        const SizedBox(height: 8),
        Text('Feito ${tempoRelativo(p['criado_em'])}${p['ponto_coleta'] != null ? ' · retirada no ${p['ponto_coleta']}' : ''}', style: t.bodyMedium),
        if (itens.isNotEmpty && status != 'na_fila_tecnica' && status != 'recebida') ...[
          const SizedBox(height: 10),
          PessoasAjudando.doPedido(p),
          const SizedBox(height: 10),
          Text('Marque o que você já recebeu', style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          ChecklistRecebido(
            itens: itens,
            habilitado: status == 'no_mural' || status == 'em_atendimento' || status == 'entregue',
            aoMarcar: (item, obtido) => aoMarcar(p['id'], item.id, obtido),
          ),
        ],
        if (status == 'entregue') ...[
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: () => aoConfirmar(p['id']), icon: const Icon(Icons.inventory_2_outlined), label: const Text('Já retirei a doação')),
        ],
      ]),
    );
  }
}

class _CartaoAjuda extends StatelessWidget {
  const _CartaoAjuda({required this.o});
  final Map<String, dynamic> o;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final chegou = o['status'] == 'entregue' || o['status'] == 'concluida';
    final meus = ItemPedido.daLista(o['itens']).where((i) => i.meu).map((i) => i.descricao).toList();
    return Cartao(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(o['titulo'], style: t.titleMedium)),
          Text(o['protocolo'], style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 3, color: EloCores.brand900)),
        ]),
        const SizedBox(height: 6),
        Text('Bairro ${o['bairro']} · ${o['ponto_coleta'] ?? 'ponto de coleta'}', style: t.bodyMedium),
        if (meus.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text('Você vai levar: ${meus.join(', ')}', style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: EloCores.texto)),
        ],
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: chegou ? EloCores.sucessoClaro : EloCores.fundo, borderRadius: BorderRadius.circular(EloRaio.md)),
          child: Row(children: [
            Icon(chegou ? Icons.favorite : Icons.schedule, color: chegou ? EloCores.sucesso : EloCores.texto2),
            const SizedBox(width: 10),
            Expanded(child: Text(o['desfecho_texto'], style: TextStyle(fontWeight: FontWeight.w700, color: chegou ? EloCores.sucesso : EloCores.texto))),
          ]),
        ),
      ]),
    );
  }
}
