import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/avatares.dart';
import '../widgets/comum.dart';

/// Abre a conversa (item da lista de conversas, como a API devolve).
Future<void> abrirConversa(BuildContext context, Map<String, dynamic> c) => Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Conversa(
        id: c['id'] as String,
        nome: c['outra_pessoa'] as String,
        foto: c['outra_foto'] as String?,
        pedido: c['pedido_titulo'] as String,
      ),
    ));

/// Botão "Conversar" de um pedido. Quem ajuda abre a conversa com quem pediu; quem pediu
/// escolhe com qual pessoa que está ajudando quer falar (se houver mais de uma).
Future<void> conversarSobrePedido(BuildContext context, String pedidoId, {required bool souQuemAjuda}) async {
  try {
    if (souQuemAjuda) await Api.i.abrirConversa(pedidoId);
    final lista = (await Api.i.conversas(pedido: pedidoId)).cast<Map<String, dynamic>>();
    if (!context.mounted) return;
    if (lista.isEmpty) {
      avisar(context, 'Ainda ninguém se ofereceu para ajudar neste pedido. Quando alguém se oferecer, vocês poderão conversar.');
      return;
    }
    if (lista.length == 1) {
      await abrirConversa(context, lista.first);
      return;
    }
    final escolhida = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Com quem você quer conversar?', style: Theme.of(ctx).textTheme.titleMedium),
          ),
          for (final c in lista)
            ListTile(
              leading: AvatarPessoa(nome: c['outra_pessoa'] as String, foto: c['outra_foto'] as String?),
              title: Text(c['outra_pessoa'] as String),
              trailing: (c['nao_lidas'] as num? ?? 0) > 0 ? Badge(label: Text('${c['nao_lidas']}')) : const Icon(Icons.chevron_right),
              onTap: () => Navigator.pop(ctx, c),
            ),
        ]),
      ),
    );
    if (escolhida != null && context.mounted) await abrirConversa(context, escolhida);
  } on ErroApi catch (e) {
    if (context.mounted) avisar(context, e.mensagem, erro: true);
  }
}

/// Conversa entre quem pediu e quem ajuda: mensagens de texto, atualizadas a cada poucos segundos.
class Conversa extends StatefulWidget {
  const Conversa({super.key, required this.id, required this.nome, required this.pedido, this.foto});
  final String id;
  final String nome;
  final String? foto;
  final String pedido;
  @override
  State<Conversa> createState() => _ConversaState();
}

class _ConversaState extends State<Conversa> {
  final _texto = TextEditingController();
  final _rolagem = ScrollController();
  final List<Map<String, dynamic>> _mensagens = [];
  Timer? _relogio;
  bool _carregando = true;
  bool _enviando = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _buscar();
    _relogio = Timer.periodic(const Duration(seconds: 5), (_) => _buscar());
  }

  @override
  void dispose() {
    _relogio?.cancel();
    _texto.dispose();
    _rolagem.dispose();
    super.dispose();
  }

  /// Busca a conversa inteira (até 500 mensagens): assim o "lida" das minhas também atualiza.
  Future<void> _buscar() async {
    try {
      final todas = (await Api.i.mensagens(widget.id)).cast<Map<String, dynamic>>();
      if (!mounted) return;
      final chegou = todas.length > _mensagens.length;
      setState(() {
        _carregando = false;
        _erro = null;
        _mensagens
          ..clear()
          ..addAll(todas);
      });
      if (chegou) _irParaOFim();
    } on ErroApi catch (e) {
      if (mounted) setState(() { _carregando = false; _erro = e.mensagem; });
    }
  }

  void _irParaOFim() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_rolagem.hasClients) _rolagem.animateTo(_rolagem.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  Future<void> _enviar() async {
    final texto = _texto.text.trim();
    if (texto.isEmpty || _enviando) return;
    setState(() => _enviando = true);
    try {
      final m = await Api.i.enviarMensagem(widget.id, texto);
      if (!mounted) return;
      _texto.clear();
      setState(() { if (!_mensagens.any((x) => x['id'] == m['id'])) _mensagens.add(m); });
      _irParaOFim();
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  static String _hora(String iso) {
    final d = DateTime.parse(iso).toLocal();
    final hoje = DateTime.now();
    final hh = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    if (d.year == hoje.year && d.month == hoje.month && d.day == hoje.day) return hh;
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} $hh';
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          AvatarPessoa(nome: widget.nome, foto: widget.foto, raio: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.nome, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              Text(widget.pedido, style: t.bodyMedium?.copyWith(fontSize: 13), overflow: TextOverflow.ellipsis),
            ]),
          ),
        ]),
      ),
      body: SafeArea(
        child: Column(children: [
          Container(
            width: double.infinity,
            color: EloCores.brand100,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(children: [
              const Icon(Icons.shield_outlined, size: 20, color: EloCores.brand700),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Para sua segurança, não compartilhe endereço, documentos ou dados bancários. A entrega é sempre no ponto de coleta.',
                  style: t.bodyMedium?.copyWith(color: EloCores.brand900),
                ),
              ),
            ]),
          ),
          Expanded(
            child: _carregando
                ? const Carregando(texto: 'Carregando mensagens')
                : _mensagens.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            _erro ?? 'Nenhuma mensagem ainda. Diga oi para ${widget.nome} e combine a entrega.',
                            textAlign: TextAlign.center,
                            style: t.bodyLarge?.copyWith(color: _erro == null ? null : EloCores.erro),
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: _rolagem,
                        padding: const EdgeInsets.all(16),
                        itemCount: _mensagens.length,
                        itemBuilder: (_, i) => _Balao(mensagem: _mensagens[i], hora: _hora(_mensagens[i]['criada_em'] as String), nome: widget.nome),
                      ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _texto,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: 1000,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _enviar(),
                  decoration: const InputDecoration(hintText: 'Escreva uma mensagem', labelText: 'Mensagem', counterText: ''),
                ),
              ),
              const SizedBox(width: 4),
              IconButton.filled(
                tooltip: 'Enviar',
                onPressed: _enviando ? null : _enviar,
                style: IconButton.styleFrom(backgroundColor: EloCores.brand600, foregroundColor: Colors.white, minimumSize: const Size(52, 52)),
                icon: const Icon(Icons.send),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Balao extends StatelessWidget {
  const _Balao({required this.mensagem, required this.hora, required this.nome});
  final Map<String, dynamic> mensagem;
  final String hora;
  final String nome;

  @override
  Widget build(BuildContext context) {
    final minha = mensagem['minha'] == true;
    final t = Theme.of(context).textTheme;
    final lida = mensagem['lida'] == true;
    return Semantics(
      label: '${minha ? 'Você' : nome}, $hora: ${mensagem['texto']}${minha && lida ? '. Lida' : ''}',
      excludeSemantics: true,
      child: Align(
        alignment: minha ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
          decoration: BoxDecoration(
            color: minha ? EloCores.brand600 : Colors.white,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(minha ? 16 : 4),
              bottomRight: Radius.circular(minha ? 4 : 16),
            ),
            border: minha ? null : Border.all(color: const Color(0x1F000000)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
            Align(
              alignment: Alignment.centerLeft,
              widthFactor: 1,
              child: Text(mensagem['texto'] as String, style: t.bodyLarge?.copyWith(color: minha ? Colors.white : EloCores.brand900)),
            ),
            const SizedBox(height: 2),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Text(hora, style: TextStyle(fontSize: 12, color: minha ? Colors.white70 : EloCores.texto2)),
              if (minha) ...[const SizedBox(width: 4), Icon(lida ? Icons.done_all : Icons.done, size: 14, color: Colors.white70)],
            ]),
          ]),
        ),
      ),
    );
  }
}
