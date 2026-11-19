import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'pedido_detalhe.dart';

/// Posições esquemáticas dos bairros fictícios (0..1). O mapa é ilustrativo e local:
/// não depende de serviço de mapas e nunca mostra endereço de cidadão.
const _posicaoBairro = {
  'vila-nova': Offset(0.28, 0.24),
  'jardim': Offset(0.72, 0.42),
  'centro': Offset(0.5, 0.56),
  'jardim-sao-pedro': Offset(0.24, 0.72),
  'vila-esperanca': Offset(0.74, 0.76),
};
const _kmPorUnidade = 6.0;

enum _Filtro { todos, pedidos, servicos, oportunidades }

class _Marcador {
  _Marcador({required this.tipo, required this.titulo, required this.subtitulo, required this.descricao, required this.pos, this.slugBairro, this.contagem});
  final String tipo; // pedidos | servico
  final String titulo;
  final String subtitulo;
  final String descricao;
  final Offset pos;
  final String? slugBairro;
  final int? contagem;
}

String direcao(Offset de, Offset para) {
  final d = para - de;
  if (d.distance < 0.02) return 'no seu bairro';
  final ang = (math.atan2(-d.dy, d.dx) * 180 / math.pi + 360) % 360;
  const nomes = ['a leste', 'a nordeste', 'ao norte', 'a noroeste', 'a oeste', 'a sudoeste', 'ao sul', 'a sudeste'];
  return nomes[((ang + 22.5) ~/ 45) % 8];
}

String distancia(Offset de, Offset para) {
  final km = (para - de).distance * _kmPorUnidade;
  return km < 0.2 ? 'perto de você' : '${km.toStringAsFixed(1).replaceAll('.', ',')} km ${direcao(de, para)}';
}

/// Tela 3 do mockup: Mapa da rede, com lista equivalente (RNF-A10 / RF-402).
class MapaRede extends StatefulWidget {
  const MapaRede({super.key});
  @override
  State<MapaRede> createState() => _MapaRedeState();
}

class _MapaRedeState extends State<MapaRede> {
  _Filtro _filtro = _Filtro.todos;
  bool? _comoLista;
  List<_Marcador> _marcadores = [];
  _Marcador? _selecionado;
  Offset _eu = const Offset(0.5, 0.5);
  String? _erro;
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final res = await Future.wait([Api.i.muralPorBairro(), Api.i.pontos()]);
      final bairros = res[0].cast<Map<String, dynamic>>();
      final pontos = res[1].cast<Map<String, dynamic>>();
      final nomeParaSlug = {for (final b in bairros) b['bairro'] as String: b['slug'] as String};
      final m = <_Marcador>[
        for (final b in bairros)
          if ((b['pedidos'] as num) > 0 && _posicaoBairro.containsKey(b['slug']))
            _Marcador(
              tipo: 'pedidos',
              titulo: '${b['pedidos']} pedido${b['pedidos'] == 1 ? '' : 's'} em ${b['bairro']}',
              subtitulo: 'Pedidos de ajuda do bairro',
              descricao: 'Para proteger as famílias, o mapa mostra só o bairro. Toque para ver os pedidos.',
              pos: _posicaoBairro[b['slug']]!,
              slugBairro: b['slug'],
              contagem: (b['pedidos'] as num).toInt(),
            ),
        for (final p in pontos)
          if (_posicaoBairro.containsKey(nomeParaSlug[p['bairro']]))
            _Marcador(
              tipo: 'servico',
              titulo: p['nome'],
              subtitulo: (p['nome'] as String).contains('CRAS') ? 'Serviço municipal · ponto de coleta' : 'Ponto de coleta',
              descricao: '${p['endereco']}. Estoque: ${(p['estoque_kg'] as num).toStringAsFixed(0)} kg de ${(p['capacidade_kg'] as num).toStringAsFixed(0)} kg.',
              pos: _posicaoBairro[nomeParaSlug[p['bairro']]]! + const Offset(0.06, -0.05),
            ),
      ];
      // posição do usuário: centro do bairro mais citado nos pedidos próximos (aproximação para o protótipo)
      final mural = await Api.i.mural();
      if (mural.isNotEmpty) {
        final slug = (mural.first as Map)['bairro_slug'];
        if (_posicaoBairro.containsKey(slug)) _eu = _posicaoBairro[slug]!;
      }
      setState(() {
        _marcadores = m;
        _selecionado = m.where((x) => x.tipo == 'servico').firstOrNull ?? m.firstOrNull;
        _carregando = false;
      });
    } on ErroApi catch (e) {
      setState(() { _erro = e.mensagem; _carregando = false; });
    }
  }

  List<_Marcador> get _visiveis => _marcadores.where((m) => switch (_filtro) {
        _Filtro.todos => true,
        _Filtro.pedidos => m.tipo == 'pedidos',
        _Filtro.servicos => m.tipo == 'servico',
        _Filtro.oportunidades => false,
      }).toList()
        ..sort((a, b) => (a.pos - _eu).distance.compareTo((b.pos - _eu).distance));

  Future<void> _abrir(_Marcador m) async {
    if (m.tipo != 'pedidos') {
      setState(() => _selecionado = m);
      return;
    }
    final pedidos = (await Api.i.mural(bairro: m.slugBairro)).cast<Map<String, dynamic>>();
    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), shrinkWrap: true, children: [
            Text(m.titulo, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            for (final p in pedidos)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: CartaoPedido(
                  pedido: p,
                  onTap: () {
                    Navigator.of(context).pop();
                    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PedidoDetalhe(pedido: p)));
                  },
                ),
              ),
          ]),
        ),
      ),
    );
    _carregar();
  }

  @override
  Widget build(BuildContext context) {
    // Com leitor de tela ativo, a lista é o padrão (RNF-A10)
    final lista = _comoLista ?? MediaQuery.of(context).accessibleNavigation;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mapa da rede', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: false, icon: Icon(Icons.map_outlined), label: Text('Mapa')),
                ButtonSegment(value: true, icon: Icon(Icons.list), label: Text('Lista')),
              ],
              selected: {lista},
              onSelectionChanged: (s) => setState(() => _comoLista = s.first),
            ),
          ),
        ],
      ),
      body: Column(children: [
        SizedBox(
          height: 56,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), children: [
            for (final (f, rotulo) in [(_Filtro.todos, 'Todos'), (_Filtro.pedidos, 'Pedidos'), (_Filtro.servicos, 'Serviços'), (_Filtro.oportunidades, 'Oportunidades')])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(rotulo),
                  selected: _filtro == f,
                  onSelected: (_) => setState(() => _filtro = f),
                  selectedColor: EloCores.brand900,
                  labelStyle: TextStyle(color: _filtro == f ? Colors.white : EloCores.texto, fontWeight: FontWeight.w700),
                  backgroundColor: EloCores.superficie,
                  showCheckmark: false,
                ),
              ),
          ]),
        ),
        Expanded(
          child: _carregando
              ? const Carregando(texto: 'Carregando a rede')
              : _erro != null
                  ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_erro!)))
                  : lista
                      ? _Lista(marcadores: _visiveis, eu: _eu, aoAbrir: _abrir, filtro: _filtro)
                      : Stack(children: [
                          Positioned.fill(
                            child: LayoutBuilder(builder: (context, c) {
                              final tam = Size(c.maxWidth, c.maxHeight);
                              return Stack(children: [
                                const Positioned.fill(child: ExcludeSemantics(child: CustomPaint(painter: _Ruas()))),
                                for (final m in _visiveis)
                                  Positioned(
                                    left: m.pos.dx * tam.width - 26,
                                    top: m.pos.dy * tam.height - 60,
                                    child: _Pino(marcador: m, selecionado: m == _selecionado, onTap: () => _abrir(m)),
                                  ),
                                Positioned(
                                  left: _eu.dx * tam.width - 10,
                                  top: _eu.dy * tam.height - 10,
                                  child: Semantics(
                                    label: 'Você está aqui',
                                    child: Container(width: 20, height: 20, decoration: BoxDecoration(color: EloCores.voluntario, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3))),
                                  ),
                                ),
                              ]);
                            }),
                          ),
                          if (_filtro == _Filtro.oportunidades)
                            const Center(child: Selo('Oportunidades de emprego e cursos chegam em breve')),
                          if (_selecionado != null && _filtro != _Filtro.oportunidades)
                            Positioned(left: 16, right: 16, bottom: 16, child: _CartaoSelecionado(m: _selecionado!, eu: _eu, aoAbrir: () => _abrir(_selecionado!))),
                        ]),
        ),
      ]),
    );
  }
}

class _Pino extends StatelessWidget {
  const _Pino({required this.marcador, required this.selecionado, required this.onTap});
  final _Marcador marcador;
  final bool selecionado;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final pedido = marcador.tipo == 'pedidos';
    final cor = pedido ? EloCores.pedido : EloCores.servico;
    return Semantics(
      button: true,
      label: marcador.titulo,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: 52,
          height: 64,
          child: Column(children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: selecionado ? 50 : 44,
              height: selecionado ? 50 : 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: cor,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2))],
              ),
              child: pedido
                  ? Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.favorite, color: Colors.white, size: 16),
                      const SizedBox(width: 2),
                      Text('${marcador.contagem}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
                    ])
                  : const Icon(Icons.account_balance, color: Colors.white, size: 22),
            ),
            CustomPaint(size: const Size(14, 10), painter: _Ponta(cor)),
          ]),
        ),
      ),
    );
  }
}

class _Ponta extends CustomPainter {
  const _Ponta(this.cor);
  final Color cor;
  @override
  void paint(Canvas canvas, Size s) {
    final path = Path()..moveTo(0, 0)..lineTo(s.width, 0)..lineTo(s.width / 2, s.height)..close();
    canvas.drawPath(path, Paint()..color = cor);
  }

  @override
  bool shouldRepaint(covariant _Ponta old) => old.cor != cor;
}

class _CartaoSelecionado extends StatelessWidget {
  const _CartaoSelecionado({required this.m, required this.eu, required this.aoAbrir});
  final _Marcador m;
  final Offset eu;
  final VoidCallback aoAbrir;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final pedido = m.tipo == 'pedidos';
    return Cartao(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: pedido ? EloCores.pedidoClaro : EloCores.voluntarioClaro,
            child: Icon(pedido ? Icons.favorite : Icons.groups, color: pedido ? EloCores.pedido : EloCores.voluntario),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(m.titulo, style: t.titleMedium),
              Text(m.subtitulo, style: t.bodyMedium),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Text(m.descricao, style: t.bodyLarge),
        const SizedBox(height: 4),
        Text(distancia(eu, m.pos), style: t.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: EloCores.brand600, minimumSize: const Size.fromHeight(48)),
          onPressed: aoAbrir,
          child: Text(pedido ? 'Ver pedidos' : 'Ver detalhes'),
        ),
      ]),
    );
  }
}

class _Lista extends StatelessWidget {
  const _Lista({required this.marcadores, required this.eu, required this.aoAbrir, required this.filtro});
  final List<_Marcador> marcadores;
  final Offset eu;
  final void Function(_Marcador) aoAbrir;
  final _Filtro filtro;
  @override
  Widget build(BuildContext context) {
    if (filtro == _Filtro.oportunidades) return const Center(child: Selo('Oportunidades de emprego e cursos chegam em breve'));
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
      itemCount: marcadores.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final m = marcadores[i];
        final pedido = m.tipo == 'pedidos';
        return Cartao(
          onTap: () => aoAbrir(m),
          rotulo: '${m.titulo}. ${m.subtitulo}. ${distancia(eu, m.pos)}.',
          child: Row(children: [
            Icon(pedido ? Icons.favorite : Icons.account_balance, color: pedido ? EloCores.pedido : EloCores.servico, size: 32),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.titulo, style: Theme.of(context).textTheme.titleMedium),
                Text('${m.subtitulo} · ${distancia(eu, m.pos)}', style: Theme.of(context).textTheme.bodyMedium),
              ]),
            ),
            const Icon(Icons.chevron_right, color: EloCores.texto2),
          ]),
        );
      },
    );
  }
}

/// Ruas, quarteirões e praças estilizados (decorativo).
class _Ruas extends CustomPainter {
  const _Ruas();
  @override
  void paint(Canvas canvas, Size s) {
    canvas.drawRect(Offset.zero & s, Paint()..color = const Color(0xFFEDEFEA));
    final parque = Paint()..color = const Color(0xFFD5EBD3);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(s.width * 0.05, s.height * 0.45, s.width * 0.18, s.height * 0.14), const Radius.circular(10)), parque);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(s.width * 0.6, s.height * 0.08, s.width * 0.25, s.height * 0.12), const Radius.circular(10)), parque);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(s.width * 0.42, s.height * 0.82, s.width * 0.2, s.height * 0.12), const Radius.circular(10)), parque);
    final rua = Paint()..color = Colors.white..strokeWidth = 10..strokeCap = StrokeCap.round;
    final ruaFina = Paint()..color = Colors.white..strokeWidth = 5;
    for (var i = 1; i < 8; i++) {
      canvas.drawLine(Offset(0, s.height * i / 8), Offset(s.width, s.height * i / 8 + s.height * 0.05), ruaFina);
      canvas.drawLine(Offset(s.width * i / 6, 0), Offset(s.width * i / 6 - s.width * 0.08, s.height), ruaFina);
    }
    canvas.drawLine(Offset(0, s.height * 0.1), Offset(s.width, s.height * 0.9), rua);
    canvas.drawLine(Offset(s.width * 0.1, s.height), Offset(s.width * 0.9, 0), rua);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
