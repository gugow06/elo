import 'dart:async';
import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'pedido_detalhe.dart';

/// Estado ou cidade escolhidos na busca. null = o município de quem usa.
class Localidade {
  const Localidade({required this.tipo, required this.uf, required this.nome, this.id});
  final String tipo; // uf | municipio
  final String uf;
  final String nome;
  final String? id;

  String get rotulo => tipo == 'uf' ? '$nome ($uf)' : '$nome, $uf';
  Map<String, dynamic> toJson() => {'tipo': tipo, 'uf': uf, 'nome': nome, 'id': id};
  factory Localidade.fromJson(Map<String, dynamic> j) =>
      Localidade(tipo: j['tipo'], uf: (j['uf'] as String).trim(), nome: j['nome'], id: j['id'] as String?);
}

/// Ordens da lista. "Prioridade" = quem espera há mais tempo (a faixa de risco nunca aparece no app).
const ordens = {
  'bairro': 'Meu bairro primeiro',
  'recentes': 'Mais recentes',
  'aguardando': 'Aguardando há mais tempo',
};

const _limite = 30;
const _chave = 'elo.filtro_mural';

/// "Ver todos": pedidos do mural com busca por estado ou cidade, categoria e ordenação.
class TodosPedidos extends StatefulWidget {
  const TodosPedidos({super.key, this.inicial});
  /// Abre já filtrada (ex.: tocar num bairro no mapa); senão, volta o último filtro usado.
  final Localidade? inicial;
  @override
  State<TodosPedidos> createState() => _TodosPedidosState();
}

class _TodosPedidosState extends State<TodosPedidos> {
  final _busca = TextEditingController();
  Timer? _espera;
  List<Localidade> _sugestoes = [];
  Localidade? _local;
  String? _categoria;
  String _ordem = 'bairro';
  final List<Map<String, dynamic>> _itens = [];
  int _pagina = 0;
  bool _carregando = true;
  bool _fim = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _restaurar();
  }

  @override
  void dispose() {
    _espera?.cancel();
    _busca.dispose();
    super.dispose();
  }

  /// O último filtro usado volta ao abrir a tela.
  Future<void> _restaurar() async {
    final p = await SharedPreferences.getInstance();
    final s = p.getString(_chave);
    if (s != null) {
      final j = jsonDecode(s) as Map<String, dynamic>;
      _local = j['local'] == null ? null : Localidade.fromJson(Map<String, dynamic>.from(j['local']));
      _categoria = j['categoria'] as String?;
      _ordem = ordens.containsKey(j['ordem']) ? j['ordem'] as String : 'bairro';
    }
    if (widget.inicial != null) _local = widget.inicial;
    await _recarregar();
  }

  Future<void> _guardar() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_chave, jsonEncode({'local': _local?.toJson(), 'categoria': _categoria, 'ordem': _ordem}));
  }

  Future<void> _recarregar() async {
    setState(() { _itens.clear(); _pagina = 0; _fim = false; });
    await _carregarPagina();
  }

  Future<void> _carregarPagina() async {
    setState(() { _carregando = true; _erro = null; });
    try {
      final r = await Api.i.mural(
        uf: _local?.tipo == 'uf' ? _local!.uf : null,
        municipio: _local?.tipo == 'municipio' ? _local!.id : null,
        categoria: _categoria,
        ordem: _ordem,
        pagina: _pagina,
      );
      if (!mounted) return;
      setState(() {
        _itens.addAll(r.cast<Map<String, dynamic>>());
        _fim = r.length < _limite;
        _pagina++;
      });
    } on ErroApi catch (e) {
      if (mounted) setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  void _digitou(String texto) {
    _espera?.cancel();
    if (texto.trim().length < 2) {
      setState(() => _sugestoes = []);
      return;
    }
    _espera = Timer(const Duration(milliseconds: 300), () async {
      try {
        final r = await Api.i.localidades(texto.trim());
        if (mounted) setState(() => _sugestoes = r.map((e) => Localidade.fromJson(Map<String, dynamic>.from(e))).toList());
      } on ErroApi {
        // busca é só uma ajuda; erro aqui não bloqueia a lista
      }
    });
  }

  void _escolher(Localidade? l) {
    _busca.clear();
    setState(() { _local = l; _sugestoes = []; });
    FocusScope.of(context).unfocus();
    _guardar();
    _recarregar();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Todos os pedidos', style: TextStyle(fontWeight: FontWeight.w800))),
      body: RefreshIndicator(
        onRefresh: _recarregar,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          TextField(
            controller: _busca,
            onChanged: _digitou,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              labelText: 'Buscar por estado ou cidade',
              hintText: 'Ex.: Bahia, Recife, SP',
            ),
          ),
          if (_sugestoes.isNotEmpty)
            Cartao(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(children: [
                for (final s in _sugestoes)
                  ListTile(
                    leading: Icon(s.tipo == 'uf' ? Icons.map_outlined : Icons.location_city_outlined, color: EloCores.brand700),
                    title: Text(s.rotulo),
                    subtitle: Text(s.tipo == 'uf' ? 'Estado inteiro' : 'Cidade'),
                    onTap: () => _escolher(s),
                  ),
              ]),
            ),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            InputChip(
              avatar: const Icon(Icons.place_outlined, size: 18),
              label: Text(_local?.rotulo ?? 'Minha cidade'),
              onDeleted: _local == null ? null : () => _escolher(null),
              deleteButtonTooltipMessage: 'Voltar para a minha cidade',
            ),
          ]),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final entrada in [const MapEntry<String?, String>(null, 'Todas'), ...categorias.entries.map((e) => MapEntry<String?, String>(e.key, e.value))])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(entrada.value),
                    selected: _categoria == entrada.key,
                    onSelected: (_) {
                      setState(() => _categoria = entrada.key);
                      _guardar();
                      _recarregar();
                    },
                  ),
                ),
            ]),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _ordem,
            decoration: const InputDecoration(labelText: 'Ordenar por'),
            items: [for (final o in ordens.entries) DropdownMenuItem(value: o.key, child: Text(o.value))],
            onChanged: (v) {
              if (v == null) return;
              setState(() => _ordem = v);
              _guardar();
              _recarregar();
            },
          ),
          const SizedBox(height: 16),
          if (_erro != null)
            Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_erro!, style: const TextStyle(color: EloCores.erro, fontWeight: FontWeight.w700))),
          if (!_carregando && _itens.isEmpty && _erro == null) ...[
            Text(
              _local == null ? 'Nenhum pedido aguardando ajuda na sua cidade agora.' : 'Nenhum pedido aguardando ajuda em ${_local!.rotulo}.',
              style: t.bodyLarge,
            ),
            if (_local?.tipo == 'municipio')
              TextButton(
                onPressed: () => _escolher(Localidade(tipo: 'uf', uf: _local!.uf, nome: _local!.uf)),
                child: Text('Ver o estado todo (${_local!.uf})'),
              ),
          ],
          for (final p in _itens)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CartaoPedido(
                pedido: p,
                mostrarCidade: true,
                onTap: () async {
                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PedidoDetalhe(pedido: p)));
                  _recarregar();
                },
              ),
            ),
          if (_carregando) const Carregando(texto: 'Carregando pedidos…'),
          if (!_carregando && !_fim && _itens.isNotEmpty)
            OutlinedButton(onPressed: _carregarPagina, child: const Text('Ver mais pedidos')),
        ]),
      ),
    );
  }
}
