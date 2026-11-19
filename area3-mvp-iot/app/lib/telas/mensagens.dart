import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/avatares.dart';
import '../widgets/comum.dart';
import 'conversa.dart';
import 'notificacoes.dart';

/// Aba Mensagens: conversas com quem pediu ou com quem ajuda, e as notificações do sistema.
class Mensagens extends StatefulWidget {
  const Mensagens({super.key, this.aoMudarNaoLidas});
  /// A barra inferior atualiza o número da aba.
  final VoidCallback? aoMudarNaoLidas;
  @override
  State<Mensagens> createState() => MensagensState();
}

class MensagensState extends State<Mensagens> {
  final _conversas = GlobalKey<_ListaConversasState>();
  ({int mensagens, int notificacoes}) _naoLidas = (mensagens: 0, notificacoes: 0);

  /// Chamado quando a aba aparece: recarrega conversas e contadores.
  void atualizar() {
    _conversas.currentState?.carregar();
    _contar();
  }

  Future<void> _contar() async {
    try {
      final n = await Api.i.naoLidas();
      if (mounted) setState(() => _naoLidas = n);
    } on ErroApi {
      // sem conexão: mantém o que tinha
    }
    widget.aoMudarNaoLidas?.call();
  }

  @override
  void initState() {
    super.initState();
    _contar();
  }

  Tab _aba(String texto, int n) => Tab(
        child: Semantics(
          label: n > 0 ? '$texto, $n não lidas' : texto,
          excludeSemantics: true,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Flexible(child: Text(texto, overflow: TextOverflow.ellipsis)),
            if (n > 0) ...[const SizedBox(width: 6), Badge(label: Text('$n'))],
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Mensagens', style: TextStyle(fontWeight: FontWeight.w800)),
            bottom: TabBar(
              // Abas no tamanho do texto: "Notificações do sistema" não corta
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              tabs: [_aba('Conversas', _naoLidas.mensagens), _aba('Notificações do sistema', _naoLidas.notificacoes)],
            ),
          ),
          body: TabBarView(children: [
            _ListaConversas(key: _conversas, aoMudar: _contar),
            ListaNotificacoes(aoLer: _contar),
          ]),
        ),
      );
}

class _ListaConversas extends StatefulWidget {
  const _ListaConversas({super.key, required this.aoMudar});
  final VoidCallback aoMudar;
  @override
  State<_ListaConversas> createState() => _ListaConversasState();
}

class _ListaConversasState extends State<_ListaConversas> {
  late Future<List<dynamic>> _itens = Api.i.conversas();
  Timer? _relogio;

  @override
  void initState() {
    super.initState();
    // Mensagem nova aparece sem precisar puxar a lista
    _relogio = Timer.periodic(const Duration(seconds: 20), (_) => carregar(silencioso: true));
  }

  @override
  void dispose() {
    _relogio?.cancel();
    super.dispose();
  }

  Future<void> carregar({bool silencioso = false}) async {
    final f = Api.i.conversas();
    if (silencioso) {
      try {
        final r = await f;
        if (mounted) setState(() => _itens = Future.value(r));
      } on ErroApi {
        // tenta de novo no próximo ciclo
      }
    } else {
      setState(() => _itens = f);
      await f.catchError((_) => <dynamic>[]);
    }
    widget.aoMudar();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: carregar,
      child: FutureBuilder<List<dynamic>>(
        future: _itens,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done && !snap.hasData) return const Carregando(texto: 'Carregando conversas');
          if (snap.hasError) return ListView(padding: const EdgeInsets.all(24), children: [Text('${snap.error}', style: const TextStyle(color: EloCores.erro))]);
          final itens = (snap.data ?? []).cast<Map<String, dynamic>>();
          if (itens.isEmpty) {
            return ListView(padding: const EdgeInsets.all(24), children: [
              const Icon(Icons.forum_outlined, size: 48, color: EloCores.brand700),
              const SizedBox(height: 12),
              Text('Nenhuma conversa ainda.', style: t.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                'Quando você se oferece para ajudar num pedido, ou alguém se oferece para ajudar no seu, a conversa aparece aqui.',
                style: t.bodyLarge,
                textAlign: TextAlign.center,
              ),
            ]);
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: itens.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _ItemConversa(
              conversa: itens[i],
              aoAbrir: () async {
                await abrirConversa(context, itens[i]);
                carregar(silencioso: true);
              },
            ),
          );
        },
      ),
    );
  }
}

class _ItemConversa extends StatelessWidget {
  const _ItemConversa({required this.conversa, required this.aoAbrir});
  final Map<String, dynamic> conversa;
  final VoidCallback aoAbrir;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final nome = conversa['outra_pessoa'] as String;
    final naoLidas = (conversa['nao_lidas'] as num?)?.toInt() ?? 0;
    final papel = conversa['meu_papel'] == 'pediu' ? 'Ajuda no seu pedido' : 'Você ajuda neste pedido';
    final ultima = conversa['ultima_mensagem'] as String?;
    final previa = ultima == null ? 'Diga oi e combine a entrega.' : (conversa['ultima_minha'] == true ? 'Você: $ultima' : ultima);
    return Cartao(
      onTap: aoAbrir,
      rotulo: 'Conversa com $nome. $papel: ${conversa['pedido_titulo']}. ${naoLidas > 0 ? '$naoLidas mensagens não lidas. ' : ''}$previa',
      child: Row(children: [
        AvatarPessoa(nome: nome, foto: conversa['outra_foto'] as String?, raio: 24),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(nome, style: t.titleMedium, overflow: TextOverflow.ellipsis)),
              if (conversa['ultima_em'] != null) Text(tempoRelativo(conversa['ultima_em']), style: t.bodyMedium?.copyWith(fontSize: 13)),
            ]),
            Text('$papel · ${conversa['pedido_titulo']}', style: t.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(
              previa,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.bodyLarge?.copyWith(fontWeight: naoLidas > 0 ? FontWeight.w800 : FontWeight.w400, color: ultima == null ? EloCores.texto2 : null),
            ),
          ]),
        ),
        if (naoLidas > 0) ...[const SizedBox(width: 8), Badge(label: Text('$naoLidas'), backgroundColor: EloCores.brand600)],
      ]),
    );
  }
}
