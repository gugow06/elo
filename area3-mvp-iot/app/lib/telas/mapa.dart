import 'dart:async';

import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../geo.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'todos_pedidos.dart';

/// Tipo de local da rede: rótulo, ícone e cor (cor nunca é a única informação: sempre ícone + texto).
class TipoLocal {
  const TipoLocal(this.rotulo, this.icone, this.cor, this.fundo);
  final String rotulo;
  final IconData icone;
  final Color cor;
  final Color fundo;
}

const tiposLocal = {
  'ponto_coleta': TipoLocal('Ponto de coleta', Icons.inventory_2, EloCores.pedido, EloCores.pedidoClaro),
  'assistencia': TipoLocal('Assistência social', Icons.account_balance, EloCores.servico, EloCores.servicoClaro),
  'abrigo': TipoLocal('Abrigo', Icons.night_shelter, EloCores.voluntario, EloCores.voluntarioClaro),
  'distribuicao': TipoLocal('Ponto de distribuição', Icons.restaurant, EloCores.oportunidade, EloCores.oportunidadeClaro),
  'saude': TipoLocal('Saúde', Icons.local_hospital, EloCores.servico, EloCores.servicoClaro),
};

/// Um marcador do mapa: um local da rede ou os pedidos de um bairro (sempre agregados).
class _Marca {
  _Marca.local(this.dados)
      : pedidos = false,
        ponto = LatLng((dados['latitude'] as num).toDouble(), (dados['longitude'] as num).toDouble());
  _Marca.bairro(this.dados)
      : pedidos = true,
        ponto = LatLng((dados['latitude'] as num).toDouble(), (dados['longitude'] as num).toDouble());
  final Map<String, dynamic> dados;
  final bool pedidos;
  final LatLng ponto;

  TipoLocal get tipo => tiposLocal[dados['tipo']] ?? tiposLocal['assistencia']!;
  int get quantidade => (dados['pedidos'] as num?)?.toInt() ?? 0;
  String get titulo => pedidos ? '$quantidade ${quantidade == 1 ? 'pedido' : 'pedidos'} em ${dados['bairro']}' : dados['nome'] as String;
  String get subtitulo => pedidos ? 'Pedidos de ajuda do bairro · ${dados['municipio']} - ${dados['uf']}' : tipo.rotulo;
}

/// Tela 3 do mockup: mapa da rede com lista equivalente (RF-402).
/// Pedidos aparecem só agregados por bairro (P3/RS-01); locais da rede no endereço (são públicos).
/// A localização do aparelho fica no aparelho: centraliza o mapa e calcula distâncias.
class MapaRede extends StatefulWidget {
  const MapaRede({super.key});
  @override
  State<MapaRede> createState() => _MapaRedeState();
}

class _MapaRedeState extends State<MapaRede> {
  final _mapa = MapController();
  final _busca = TextEditingController();
  Timer? _esperaMapa;
  Timer? _esperaBusca;
  bool _pronto = false;
  bool? _lista; // null = decide pelo leitor de tela
  String _filtro = 'todos';
  LatLng? _eu;
  LatLng _inicio = centroBrasil;
  double _zoomInicio = 4;
  List<_Marca> _locais = [];
  List<_Marca> _bairros = [];
  _Marca? _selecionado;
  List<Map<String, dynamic>> _sugestoes = [];
  bool _carregando = false;
  String? _aviso;

  @override
  void initState() {
    super.initState();
    _posicionar();
  }

  @override
  void dispose() {
    _esperaMapa?.cancel();
    _esperaBusca?.cancel();
    _busca.dispose();
    super.dispose();
  }

  /// Onde abrir: localização do aparelho; sem ela, bairro/município do cadastro; sem ele, o Brasil.
  Future<void> _posicionar() async {
    try {
      final p = await Api.i.perfil();
      if (p['latitude'] != null && p['longitude'] != null) {
        _inicio = LatLng((p['latitude'] as num).toDouble(), (p['longitude'] as num).toDouble());
        _zoomInicio = 13;
      }
    } on ErroApi {
      // sem perfil, fica no centro do Brasil
    }
    final eu = await _localizacao(pedir: true);
    if (eu != null) {
      _eu = eu;
      _inicio = eu;
      _zoomInicio = 14;
    }
    if (!mounted) return;
    setState(() {});
    if (_pronto) {
      _mapa.move(_inicio, _zoomInicio);
      _mapaMudou();
    }
  }

  Future<LatLng?> _localizacao({required bool pedir}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied && pedir) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 10)),
      );
      return LatLng(pos.latitude, pos.longitude);
    } catch (_) {
      return null; // sem localização o app continua funcionando
    }
  }

  Future<void> _minhaLocalizacao() async {
    final eu = await _localizacao(pedir: true);
    if (!mounted) return;
    if (eu == null) {
      avisar(context, 'Não foi possível usar a sua localização. Busque uma cidade ou endereço.', erro: true);
      return;
    }
    setState(() => _eu = eu);
    _mapa.move(eu, 15);
  }

  void _mapaMudou() {
    _esperaMapa?.cancel();
    _esperaMapa = Timer(const Duration(milliseconds: 450), _carregarArea);
  }

  /// Busca locais e pedidos agregados dentro da área visível.
  Future<void> _carregarArea() async {
    if (!_pronto) return;
    final b = _mapa.camera.visibleBounds;
    final c = _mapa.camera.center;
    // Sem altura ainda (aba escondida): usa uma área de ~30 km ao redor do centro
    final semArea = (b.north - b.south).abs() < 1e-6 || (b.east - b.west).abs() < 1e-6;
    final caixa = semArea
        ? caixaApi(oeste: c.longitude - 0.15, sul: c.latitude - 0.15, leste: c.longitude + 0.15, norte: c.latitude + 0.15)
        : caixaApi(oeste: b.west, sul: b.south, leste: b.east, norte: b.north);
    setState(() { _carregando = true; _aviso = null; });
    try {
      final r = await Future.wait([Api.i.mapaLocais(caixa), Api.i.mapaPedidos(caixa)]);
      if (!mounted) return;
      setState(() {
        _locais = r[0].map((e) => _Marca.local(Map<String, dynamic>.from(e))).toList();
        _bairros = r[1].map((e) => _Marca.bairro(Map<String, dynamic>.from(e))).toList();
        if (_selecionado != null && ![..._locais, ..._bairros].any((m) => m.ponto == _selecionado!.ponto)) _selecionado = null;
      });
    } on ErroApi catch (e) {
      if (mounted) setState(() => _aviso = e.mensagem);
    } catch (e) {
      debugPrint('mapa: falha ao carregar a área: $e');
      if (mounted) setState(() => _aviso = 'Não foi possível carregar o mapa agora.');
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  void _digitou(String texto) {
    _esperaBusca?.cancel();
    if (texto.trim().length < 2) {
      setState(() => _sugestoes = []);
      return;
    }
    _esperaBusca = Timer(const Duration(milliseconds: 300), () async {
      try {
        final r = await Api.i.localidades(texto.trim());
        if (mounted) setState(() => _sugestoes = r.map((e) => Map<String, dynamic>.from(e)).toList());
      } on ErroApi {
        // a busca é uma ajuda; erro aqui não trava o mapa
      }
    });
  }

  /// Endereço ou nome de lugar: vai pela API (serviço gratuito com limite de uso).
  Future<void> _buscarEndereco() async {
    final q = _busca.text.trim();
    if (q.length < 3) return;
    try {
      final r = await Api.i.buscarLugar(q);
      if (!mounted) return;
      if (r.isEmpty) {
        avisar(context, 'Nada encontrado para "$q". Tente com o nome da cidade junto.');
        return;
      }
      setState(() => _sugestoes = r.map((e) => {...Map<String, dynamic>.from(e), 'tipo': 'lugar'}).toList());
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    }
  }

  void _ir(Map<String, dynamic> s) {
    final destino = LatLng((s['latitude'] as num).toDouble(), (s['longitude'] as num).toDouble());
    final zoom = switch (s['tipo']) { 'uf' => 6.5, 'municipio' => 12.5, _ => 16.0 };
    _busca.clear();
    FocusScope.of(context).unfocus();
    setState(() { _sugestoes = []; _selecionado = null; });
    _mapa.move(destino, zoom);
    _mapaMudou();
  }

  List<_Marca> get _visiveis => [
        if (_filtro != 'servicos') ..._bairros,
        if (_filtro != 'pedidos') ..._locais,
      ];

  /// Referência para distância: a pessoa, se a localização estiver liberada; senão, o centro do mapa.
  LatLng get _referencia => _eu ?? (_pronto ? _mapa.camera.center : _inicio);

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final lista = _lista ?? MediaQuery.of(context).accessibleNavigation;
    final visiveis = _visiveis;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(children: [
              Expanded(child: Text('Mapa da rede', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: EloCores.brand900))),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, icon: Icon(Icons.map_outlined), label: Text('Mapa')),
                  ButtonSegment(value: true, icon: Icon(Icons.list), label: Text('Lista')),
                ],
                selected: {lista},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _lista = s.first),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _busca,
              onChanged: _digitou,
              onSubmitted: (_) => _buscarEndereco(),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                labelText: 'Buscar cidade, estado ou endereço',
                isDense: true,
                suffixIcon: IconButton(
                  tooltip: 'Minha localização',
                  icon: const Icon(Icons.my_location, color: EloCores.brand700),
                  onPressed: _minhaLocalizacao,
                ),
              ),
            ),
          ),
          if (_sugestoes.isNotEmpty || _busca.text.trim().length >= 3)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Cartao(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(children: [
                  for (final s in _sugestoes)
                    ListTile(
                      dense: true,
                      leading: Icon(
                        switch (s['tipo']) { 'uf' => Icons.map_outlined, 'municipio' => Icons.location_city_outlined, _ => Icons.place_outlined },
                        color: EloCores.brand700,
                      ),
                      title: Text(s['tipo'] == 'uf' ? '${s['nome']} (${s['uf']})' : s['tipo'] == 'municipio' ? '${s['nome']}, ${s['uf']}' : s['nome']),
                      subtitle: s['tipo'] == 'lugar' ? Text(s['endereco'] ?? '') : null,
                      onTap: () => _ir(s),
                    ),
                  if (_busca.text.trim().length >= 3 && !_sugestoes.any((s) => s['tipo'] == 'lugar'))
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.travel_explore, color: EloCores.brand700),
                      title: Text('Buscar o endereço "${_busca.text.trim()}"'),
                      onTap: _buscarEndereco,
                    ),
                ]),
              ),
            ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(children: [
              for (final f in const [('todos', 'Todos'), ('pedidos', 'Pedidos'), ('servicos', 'Serviços')])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(f.$2),
                    selected: _filtro == f.$1,
                    onSelected: (_) => setState(() { _filtro = f.$1; _selecionado = null; }),
                  ),
                ),
              ActionChip(
                label: const Text('Oportunidades'),
                onPressed: () => avisar(context, 'Oportunidades de emprego e cursos chegam em breve.'),
              ),
            ]),
          ),
          if (_aviso != null)
            Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(_aviso!, style: const TextStyle(color: EloCores.erro, fontWeight: FontWeight.w700))),
          Expanded(
            child: Stack(children: [
              // O mapa fica montado mesmo na lista: a lista usa a mesma área visível
              Offstage(
                offstage: lista,
                child: FlutterMap(
                  mapController: _mapa,
                  options: MapOptions(
                    initialCenter: _inicio,
                    initialZoom: _zoomInicio,
                    minZoom: 3,
                    maxZoom: 18,
                    onMapReady: () {
                      _pronto = true;
                      _mapa.move(_inicio, _zoomInicio);
                      _carregarArea();
                    },
                    onMapEvent: (e) {
                      // Fim de gesto, movimento feito pelo app (busca, minha localização) ou mudança de tamanho
                      // (a aba do mapa abre escondida e só ganha altura quando aparece)
                      final porCodigo = e is MapEventMove &&
                          (e.source == MapEventSource.mapController || e.source == MapEventSource.nonRotatedSizeChange);
                      if (porCodigo || e is MapEventMoveEnd || e is MapEventFlingAnimationEnd || e is MapEventDoubleTapZoomEnd || e is MapEventScrollWheelZoom) {
                        _mapaMudou();
                      }
                    },
                    onTap: (_, _) => setState(() => _selecionado = null),
                  ),
                  children: [
                    TileLayer(urlTemplate: urlTiles, userAgentPackageName: 'br.elo.elo_app'),
                    MarkerLayer(markers: [
                      for (final m in visiveis)
                        Marker(
                          point: m.ponto,
                          width: m.pedidos ? 64 : 48,
                          height: 48,
                          alignment: Alignment.topCenter,
                          child: _Pino(marca: m, selecionado: identical(m, _selecionado), aoTocar: () => setState(() => _selecionado = m)),
                        ),
                      if (_eu != null)
                        Marker(
                          point: _eu!,
                          width: 22,
                          height: 22,
                          child: Semantics(
                            label: 'Você está aqui',
                            child: Container(decoration: BoxDecoration(color: EloCores.voluntario, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3))),
                          ),
                        ),
                    ]),
                    RichAttributionWidget(
                      attributions: [TextSourceAttribution('© colaboradores do OpenStreetMap')],
                      showFlutterMapAttribution: false,
                    ),
                  ],
                ),
              ),
              if (lista) _Lista(marcas: visiveis, referencia: _referencia, aoTocar: (m) => _abrir(m)),
              if (_carregando) const Positioned(top: 8, right: 8, child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3, color: EloCores.brand700))),
              if (!lista && !_carregando && visiveis.isEmpty)
                Positioned(
                  left: 16,
                  right: 16,
                  top: 8,
                  child: Cartao(child: Text('Nada nesta área ainda. Afaste o mapa ou busque outra cidade.', style: t.bodyMedium)),
                ),
              if (!lista && _selecionado != null)
                Positioned(left: 16, right: 16, bottom: 90, child: _CartaoSelecionado(marca: _selecionado!, referencia: _referencia, aoVerPedidos: () => _abrir(_selecionado!))),
            ]),
          ),
        ]),
      ),
    );
  }

  /// Bairro: abre a lista de pedidos daquela cidade. Local: mostra o card.
  void _abrir(_Marca m) {
    if (m.pedidos) {
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => TodosPedidos(
          inicial: Localidade(tipo: 'municipio', uf: m.dados['uf'], nome: m.dados['municipio'], id: m.dados['municipio_id']),
        ),
      ));
    } else {
      setState(() { _lista = false; _selecionado = m; });
      _mapa.move(m.ponto, 16);
    }
  }
}

class _Pino extends StatelessWidget {
  const _Pino({required this.marca, required this.selecionado, required this.aoTocar});
  final _Marca marca;
  final bool selecionado;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cor = marca.pedidos ? EloCores.pedido : marca.tipo.cor;
    return Semantics(
      button: true,
      label: '${marca.titulo}. ${marca.subtitulo}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: aoTocar,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: cor,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.white, width: selecionado ? 4 : 2),
            boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2))],
          ),
          child: Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(marca.pedidos ? Icons.favorite : marca.tipo.icone, color: Colors.white, size: 22),
            if (marca.pedidos) ...[
              const SizedBox(width: 4),
              Text('${marca.quantidade}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
            ],
          ]),
        ),
      ),
    );
  }
}

class _CartaoSelecionado extends StatelessWidget {
  const _CartaoSelecionado({required this.marca, required this.referencia, required this.aoVerPedidos});
  final _Marca marca;
  final LatLng referencia;
  final VoidCallback aoVerPedidos;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final d = marca.dados;
    final detalhes = <String>[
      if (!marca.pedidos) d['endereco'] as String,
      if (d['horario'] != null) d['horario'] as String,
      if (d['telefone'] != null) d['telefone'] as String,
      if (d['vagas'] != null) '${d['vagas']} vagas',
      if (d['capacidade_kg'] != null) 'Estoque: ${d['estoque_kg'] ?? 0} kg de ${d['capacidade_kg']} kg',
    ];
    return Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(EloRaio.lg),
      color: EloCores.superficie,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
              backgroundColor: marca.pedidos ? EloCores.pedidoClaro : marca.tipo.fundo,
              child: Icon(marca.pedidos ? Icons.favorite : marca.tipo.icone, color: marca.pedidos ? EloCores.pedido : marca.tipo.cor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(marca.titulo, style: t.titleMedium),
                Text(marca.subtitulo, style: t.bodyMedium),
              ]),
            ),
          ]),
          const SizedBox(height: 8),
          for (final x in detalhes) Text(x, style: t.bodyMedium),
          if (d['descricao'] != null) Text(d['descricao'], style: t.bodyMedium),
          const SizedBox(height: 6),
          Text(distanciaPorExtenso(referencia, marca.ponto), style: t.bodyLarge?.copyWith(fontWeight: FontWeight.w800)),
          if (marca.pedidos) ...[
            const SizedBox(height: 10),
            FilledButton(onPressed: aoVerPedidos, child: const Text('Ver pedidos')),
          ],
        ]),
      ),
    );
  }
}

/// Lista equivalente ao mapa (RF-402), ordenada por distância. Padrão com leitor de tela.
class _Lista extends StatelessWidget {
  const _Lista({required this.marcas, required this.referencia, required this.aoTocar});
  final List<_Marca> marcas;
  final LatLng referencia;
  final void Function(_Marca) aoTocar;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final ordenadas = [...marcas]..sort((a, b) => distanciaKm(referencia, a.ponto).compareTo(distanciaKm(referencia, b.ponto)));
    if (ordenadas.isEmpty) {
      return ListView(padding: const EdgeInsets.all(24), children: [
        Text('Nada nesta área ainda. Volte ao mapa e afaste, ou busque outra cidade.', style: t.bodyLarge),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
      itemCount: ordenadas.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final m = ordenadas[i];
        final distancia = distanciaPorExtenso(referencia, m.ponto);
        return Cartao(
          onTap: () => aoTocar(m),
          rotulo: '${m.titulo}. ${m.subtitulo}. $distancia.',
          child: Row(children: [
            Icon(m.pedidos ? Icons.favorite : m.tipo.icone, color: m.pedidos ? EloCores.pedido : m.tipo.cor, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.titulo, style: t.titleMedium),
                Text('${m.subtitulo} · $distancia', style: t.bodyMedium),
              ]),
            ),
            const Icon(Icons.chevron_right),
          ]),
        );
      },
    );
  }
}
