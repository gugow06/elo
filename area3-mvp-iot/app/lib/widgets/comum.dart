import 'package:material_ui/material_ui.dart';

import '../tema.dart';
import 'animacoes.dart';
import 'itens.dart';

const categorias = {
  'alimento': 'Alimentação',
  'roupa': 'Roupas',
  'movel': 'Móveis',
  'material_escolar': 'Material escolar',
  'apoio_idoso': 'Apoio a idoso',
  'transporte': 'Transporte',
  'outro': 'Outro',
};

/// O que costuma ser necessário em cada tipo de pedido (lista exibida no detalhe).
const itensPorCategoria = {
  'alimento': ['Arroz', 'Feijão', 'Óleo', 'Leite', 'Itens de higiene básica'],
  'roupa': ['Agasalhos', 'Calças', 'Cobertores', 'Calçados'],
  'movel': ['Móvel em bom estado', 'Transporte até o ponto de coleta'],
  'material_escolar': ['Cadernos', 'Lápis e canetas', 'Mochila', 'Estojo'],
};

String tempoRelativo(String iso) {
  final d = DateTime.now().difference(DateTime.parse(iso).toLocal());
  if (d.inMinutes < 60) return 'há ${d.inMinutes.clamp(1, 59)} min';
  if (d.inHours < 24) return 'há ${d.inHours} h';
  return d.inDays == 1 ? 'há 1 dia' : 'há ${d.inDays} dias';
}

/// Tag de categoria em âmbar com texto escuro (contraste), como no mockup.
class TagCategoria extends StatelessWidget {
  const TagCategoria(this.categoria, {super.key});
  final String categoria;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: EloCores.accent500, borderRadius: BorderRadius.circular(EloRaio.sm)),
        child: Text(categorias[categoria] ?? categoria, style: const TextStyle(color: EloCores.brand900, fontWeight: FontWeight.w800, fontSize: 13)),
      );
}

class Selo extends StatelessWidget {
  const Selo(this.texto, {super.key, this.fundo = EloCores.brand100, this.cor = EloCores.brand900});
  final String texto;
  final Color fundo;
  final Color cor;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: fundo, borderRadius: BorderRadius.circular(99)),
        child: Text(texto, style: TextStyle(color: cor, fontWeight: FontWeight.w700, fontSize: 13)),
      );
}

class Cartao extends StatelessWidget {
  const Cartao({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(16), this.rotulo});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  /// Texto lido pelo leitor de tela para o cartão inteiro.
  final String? rotulo;
  @override
  Widget build(BuildContext context) {
    final conteudo = Material(
      color: EloCores.superficie,
      borderRadius: BorderRadius.circular(EloRaio.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(EloRaio.lg),
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
    final caixa = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(EloRaio.lg),
        boxShadow: const [BoxShadow(color: Color(0x14003B2E), blurRadius: 10, offset: Offset(0, 2))],
      ),
      child: conteudo,
    );
    // Tocável: encolhe de leve enquanto está pressionado
    final comToque = Pressionavel(ativo: onTap != null, child: caixa);
    if (rotulo == null) return comToque;
    return Semantics(label: rotulo, button: onTap != null, excludeSemantics: true, child: comToque);
  }
}

/// Cartão de pedido do mural: categoria, bairro, título e situação. Nunca mostra endereço ou nome.
class CartaoPedido extends StatelessWidget {
  const CartaoPedido({super.key, required this.pedido, this.onTap, this.mostrarCidade = false});
  final Map<String, dynamic> pedido;
  final bool mostrarCidade;
  final VoidCallback? onTap;

  /// "Precisa de arroz, feijão e óleo." (itens que ainda ninguém leva), ou onde a doação é entregue.
  static String resumo(Map<String, dynamic> pedido) {
    final itens = ItemPedido.daLista(pedido['itens']);
    final abertos = itens.where((i) => i.aberto).map((i) => i.descricao.toLowerCase()).toList();
    if (abertos.isNotEmpty) {
      final lista = abertos.length == 1 ? abertos.first : '${abertos.sublist(0, abertos.length - 1).join(', ')} e ${abertos.last}';
      return 'Precisa de $lista.';
    }
    if (itens.any((i) => i.status == 'comprometido')) return 'Todos os itens já têm alguém levando.';
    if (itens.isNotEmpty) return 'As doações já chegaram ao ponto de coleta.';
    return pedido['ponto_coleta'] != null ? 'Doação entregue no ${pedido['ponto_coleta']}.' : 'Doação entregue em ponto de coleta.';
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cat = pedido['categoria'] as String;
    final bairro = pedido['bairro'] as String;
    // Na lista de todos os pedidos, que pode misturar cidades, mostra também cidade e UF
    final onde = mostrarCidade && pedido['municipio'] != null ? 'Bairro $bairro · ${pedido['municipio']} - ${pedido['uf']}' : 'Bairro $bairro';
    // Distância até o bairro do pedido, quando a lista veio pela localização do aparelho
    final km = pedido['distancia_km'] as num?;
    final ondeTexto = km == null ? onde : '$onde • ${distanciaTexto(km).replaceFirst('a ', '')}';
    final ajudando = (pedido['pessoas_ajudando'] as num?)?.toInt() ?? 0;
    final situacao = ajudando > 0 ? 'Em andamento' : 'Aguardando ajuda';
    final descricao = resumo(pedido);
    return Cartao(
      onTap: onTap,
      rotulo: '${categorias[cat]}. ${pedido['titulo']}. $onde.${km == null ? '' : ' ${distanciaTexto(km)} de você.'} $descricao '
          '${ajudando == 0 ? 'Ninguém ajudando ainda' : ajudando == 1 ? '1 pessoa ajudando' : '$ajudando pessoas ajudando'}. '
          '$situacao. Publicado ${tempoRelativo(pedido['criado_em'])}.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          TagCategoria(cat),
          const SizedBox(width: 8),
          const Spacer(),
          const Icon(Icons.location_on_outlined, size: 18, color: EloCores.texto2),
          const SizedBox(width: 4),
          Flexible(flex: 6, child: Text(ondeTexto, style: t.bodyMedium?.copyWith(fontSize: 13.5), overflow: TextOverflow.ellipsis)),
        ]),
        const SizedBox(height: 10),
        Text(pedido['titulo'], style: t.titleMedium?.copyWith(fontSize: 18, fontWeight: FontWeight.w800, color: EloCores.brand900)),
        const SizedBox(height: 4),
        Text(descricao, style: t.bodyMedium, maxLines: 2, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 12),
        Row(children: [
          // Uma linha só, ao lado do selo: diminui um pouco se não couber
          Expanded(child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: PessoasAjudando.doPedido(pedido, tamanho: 14))),
          const SizedBox(width: 8),
          Selo(situacao, fundo: ajudando > 0 ? EloCores.sucessoClaro : EloCores.brand100, cor: ajudando > 0 ? EloCores.sucesso : EloCores.brand900),
        ]),
      ]),
    );
  }
}

/// "a 800 m", "a 2,4 km", "a 35 km" (distância aproximada até o bairro do pedido).
String distanciaTexto(num km) {
  if (km < 1) return 'a ${((km * 1000) / 100).round().clamp(1, 9) * 100} m';
  if (km < 10) return 'a ${km.toStringAsFixed(1).replaceAll('.', ',')} km';
  return 'a ${km.round()} km';
}

void avisar(BuildContext context, String mensagem, {bool erro = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(mensagem, style: const TextStyle(fontSize: 15)),
    backgroundColor: erro ? EloCores.erro : EloCores.brand900,
    behavior: SnackBarBehavior.floating,
  ));
}

class Carregando extends StatelessWidget {
  const Carregando({super.key, this.texto = 'Carregando…'});
  final String texto;
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        label: texto,
        child: const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator(color: EloCores.brand700))),
      );
}
