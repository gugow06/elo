import 'package:material_ui/material_ui.dart';

import '../tema.dart';
import 'avatares.dart';

/// Item de um pedido, como a API devolve: aberto (ninguém leva), comprometido (alguém vai levar),
/// entregue (chegou ao ponto de coleta; [quantidade] = quanto chegou), obtido (quem pediu já recebeu).
/// [meu] = quem está vendo vai levar o item.
class ItemPedido {
  const ItemPedido({required this.id, required this.descricao, required this.status, this.meu = false, this.quantidade = 0});
  final String id;
  final String descricao;
  final String status;
  final bool meu;
  final int quantidade;

  bool get aberto => status == 'aberto';
  bool get entregue => status == 'entregue';
  bool get obtido => status == 'obtido';

  /// "Chegou ao ponto de coleta (3)"
  String get textoChegou => 'Chegou ao ponto de coleta${quantidade > 1 ? ' ($quantidade)' : ''}';

  factory ItemPedido.fromJson(Map<String, dynamic> j) => ItemPedido(
        id: j['id'],
        descricao: j['descricao'],
        status: j['status'],
        meu: j['meu'] == true,
        quantidade: (j['quantidade'] as num?)?.toInt() ?? 0,
      );

  static List<ItemPedido> daLista(dynamic itens) =>
      (itens as List? ?? const []).map((e) => ItemPedido.fromJson(Map<String, dynamic>.from(e))).toList();
}

/// Quem está ajudando no pedido: fotos sobrepostas com "+N" e o texto "N pessoas ajudando".
/// Decisão F7-D5: a foto de perfil é pública; a API manda só o primeiro nome e a foto.
class PessoasAjudando extends StatelessWidget {
  const PessoasAjudando(this.quantidade, {super.key, this.ajudantes = const [], this.tamanho});
  final int quantidade;
  final List<Ajudante> ajudantes;
  /// Tamanho do texto (o card do mural usa um menor).
  final double? tamanho;

  /// A partir do pedido como a API devolve (`pessoas_ajudando` e `ajudantes`).
  factory PessoasAjudando.doPedido(Map<String, dynamic> p, {double? tamanho}) =>
      PessoasAjudando((p['pessoas_ajudando'] as num?)?.toInt() ?? 0, ajudantes: ajudantesDe(p['ajudantes']), tamanho: tamanho);

  @override
  Widget build(BuildContext context) {
    final texto = switch (quantidade) {
      0 => 'Ninguém ajudando ainda',
      1 => '1 pessoa ajudando',
      _ => '$quantidade pessoas ajudando',
    };
    final nomes = ajudantes.map((a) => a.nome).where((n) => n.isNotEmpty).toList();
    final leitura = nomes.isEmpty ? texto : '$texto: ${nomes.join(', ')}${quantidade > nomes.length ? ' e outras' : ''}';
    final cor = quantidade > 0 ? EloCores.voluntario : EloCores.texto2;
    return Semantics(
      label: leitura,
      excludeSemantics: true,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (quantidade > 0 && ajudantes.isNotEmpty)
          GrupoAvatares(pessoas: ajudantes, total: quantidade)
        else
          Icon(Icons.groups_outlined, size: 20, color: cor),
        const SizedBox(width: 8),
        Flexible(child: Text(texto, style: TextStyle(fontWeight: FontWeight.w700, color: cor, fontSize: tamanho))),
      ]),
    );
  }
}

/// Para quem quer ajudar: escolher os itens que vai levar. Itens que outra pessoa já leva
/// ou que já foram recebidos aparecem travados.
class EscolhaItens extends StatelessWidget {
  const EscolhaItens({super.key, required this.itens, required this.escolhidos, required this.aoMudar, this.travado = false});
  final List<ItemPedido> itens;
  final Set<String> escolhidos;
  final void Function(String id, bool marcado) aoMudar;
  /// Pedido de móvel: uma pessoa leva tudo, sem escolher item por item.
  final bool travado;

  @override
  Widget build(BuildContext context) => Column(children: [
        for (final i in itens)
          CheckboxListTile(
            value: i.aberto ? escolhidos.contains(i.id) : (i.meu || i.obtido),
            onChanged: i.aberto && !travado ? (v) => aoMudar(i.id, v ?? false) : null,
            title: Text(i.descricao, style: const TextStyle(fontSize: 16)),
            subtitle: i.aberto
                ? null
                : Text(i.obtido ? 'Já recebido' : i.entregue ? 'Já chegou ao ponto de coleta' : i.meu ? 'Você vai levar' : 'Alguém já vai levar'),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: EloCores.brand600,
          ),
      ]);
}

/// Para quem pediu: marcar o que já recebeu. Com tudo marcado, o pedido conclui.
class ChecklistRecebido extends StatelessWidget {
  const ChecklistRecebido({super.key, required this.itens, required this.aoMarcar, this.habilitado = true});
  final List<ItemPedido> itens;
  final void Function(ItemPedido item, bool obtido) aoMarcar;
  final bool habilitado;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final feitos = itens.where((i) => i.obtido).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Semantics(
        label: '$feitos de ${itens.length} itens recebidos',
        excludeSemantics: true,
        child: Row(children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: itens.isEmpty ? 0 : feitos / itens.length,
                minHeight: 6,
                backgroundColor: EloCores.borda,
                color: EloCores.sucesso,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text('$feitos de ${itens.length} recebidos', style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
        ]),
      ),
      for (final i in itens)
        CheckboxListTile(
          value: i.obtido,
          onChanged: habilitado ? (v) => aoMarcar(i, v ?? false) : null,
          title: Text(i.descricao, style: const TextStyle(fontSize: 16)),
          subtitle: Text(
            i.obtido ? 'Recebido' : i.entregue ? '${i.textoChegou}: pode retirar' : i.aberto ? 'Aguardando alguém para levar' : 'Alguém vai levar',
            style: i.entregue ? const TextStyle(color: EloCores.sucesso, fontWeight: FontWeight.w700) : null,
          ),
          controlAffinity: ListTileControlAffinity.leading,
          activeColor: EloCores.sucesso,
          contentPadding: EdgeInsets.zero,
        ),
    ]);
  }
}
