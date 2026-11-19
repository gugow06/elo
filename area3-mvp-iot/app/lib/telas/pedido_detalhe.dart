import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';

/// Tela 4 do mockup: pedido de ajuda e "Quero ajudar".
/// Sem botão de compartilhar e sem fotos de voluntários (privacidade, PRD §8.2).
class PedidoDetalhe extends StatefulWidget {
  const PedidoDetalhe({super.key, required this.pedido});
  final Map<String, dynamic> pedido;
  @override
  State<PedidoDetalhe> createState() => _PedidoDetalheState();
}

class _PedidoDetalheState extends State<PedidoDetalhe> {
  bool _enviando = false;
  Map<String, dynamic>? _assumido;

  Future<void> _quero() async {
    setState(() => _enviando = true);
    try {
      final r = await Api.i.quero(widget.pedido['id']);
      setState(() => _assumido = r);
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final p = widget.pedido;
    final itens = itensPorCategoria[p['categoria']] ?? const <String>[];
    return Scaffold(
      appBar: AppBar(title: const Text('Pedido de ajuda', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 120), children: [
        Cartao(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            TagCategoria(p['categoria']),
            const SizedBox(height: 12),
            Text(p['titulo'], style: t.titleLarge),
            const SizedBox(height: 8),
            Text(
              'A doação é entregue no ${p['ponto_coleta'] ?? 'ponto de coleta do bairro'}, nunca na casa da família. '
              'Para proteger quem pediu, o ELO não mostra nome nem endereço.',
              style: t.bodyLarge,
            ),
            const SizedBox(height: 14),
            Wrap(spacing: 16, runSpacing: 8, children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.location_on_outlined, size: 20, color: EloCores.texto2),
                const SizedBox(width: 4),
                Text('Bairro ${p['bairro']}', style: t.bodyMedium),
              ]),
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.calendar_today_outlined, size: 18, color: EloCores.texto2),
                const SizedBox(width: 4),
                Text('Publicado ${tempoRelativo(p['criado_em'])}', style: t.bodyMedium),
              ]),
            ]),
          ]),
        ),
        const SizedBox(height: 12),
        Cartao(
          child: Row(children: [
            const CircleAvatar(backgroundColor: EloCores.brand100, child: Icon(Icons.verified_user_outlined, color: EloCores.brand700)),
            const SizedBox(width: 12),
            Expanded(child: Text('Pedido verificado pela triagem do ELO e acompanhado pelo CRAS do município.', style: t.bodyMedium)),
          ]),
        ),
        if (itens.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text('O que é necessário?', style: t.titleMedium),
          const SizedBox(height: 8),
          Cartao(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(children: [
              for (final item in itens)
                ListTile(
                  leading: const Icon(Icons.check_circle_outline, color: EloCores.brand600),
                  title: Text(item, style: const TextStyle(fontSize: 16)),
                  minTileHeight: 48,
                ),
            ]),
          ),
        ],
        if (p['ponto_coleta'] != null) ...[
          const SizedBox(height: 20),
          Text('Onde entregar', style: t.titleMedium),
          const SizedBox(height: 8),
          Cartao(
            child: Row(children: [
              const Icon(Icons.account_balance, color: EloCores.servico, size: 32),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p['ponto_coleta'], style: t.titleMedium),
                  if (p['ponto_coleta_endereco'] != null) Text(p['ponto_coleta_endereco'], style: t.bodyMedium),
                ]),
              ),
            ]),
          ),
        ],
        if (_assumido != null) ...[
          const SizedBox(height: 20),
          Semantics(
            liveRegion: true,
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: EloCores.sucessoClaro, borderRadius: BorderRadius.circular(EloRaio.lg)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Obrigado! O pedido é seu. 💚', style: t.titleMedium?.copyWith(color: EloCores.sucesso)),
                const SizedBox(height: 8),
                Text('Protocolo para digitar no ponto de coleta:', style: t.bodyLarge),
                Semantics(
                  label: 'Protocolo ${(_assumido!['protocolo'] as String).split('').join(' ')}',
                  excludeSemantics: true,
                  child: Text(_assumido!['protocolo'], style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, letterSpacing: 8, color: EloCores.brand900)),
                ),
                const SizedBox(height: 8),
                Text(_assumido!['instrucoes'], style: t.bodyLarge),
              ]),
            ),
          ),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: _assumido == null
              ? FilledButton.icon(
                  onPressed: _enviando ? null : _quero,
                  icon: const Icon(Icons.volunteer_activism),
                  label: Text(_enviando ? 'Enviando…' : 'Quero ajudar'),
                )
              : OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Voltar')),
        ),
      ),
    );
  }
}
