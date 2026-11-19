import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../localizacao.dart';
import '../tema.dart';
import '../widgets/animacoes.dart';
import '../widgets/avatares.dart';
import '../widgets/banners.dart';
import '../widgets/comum.dart';
import 'pedido_detalhe.dart';
import 'todos_pedidos.dart';
import 'shell.dart';

/// Tela 2 do mockup: saudação, busca, 4 atalhos e pedidos próximos.
class Inicio extends StatefulWidget {
  const Inicio({super.key, required this.aoPedirAjuda, required this.aoAbrirMapa, this.aoAbrirPerfil});
  final VoidCallback aoPedirAjuda;
  final VoidCallback aoAbrirMapa;
  final VoidCallback? aoAbrirPerfil;
  @override
  State<Inicio> createState() => _InicioState();
}

class _InicioState extends State<Inicio> {
  late Future<List<dynamic>> _pedidos;
  int _naoLidas = 0;
  String _busca = '';
  /// Foto de perfil (caminho na API), para o avatar do cabeçalho.
  String? _foto;

  /// A saudação é digitada e as seções entram em sequência só na primeira vez que o Início
  /// aparece depois de abrir o app; depois (voltar de outra tela, sair e entrar) aparece pronto.
  static bool _jaApresentou = false;
  final bool _apresentar = !_jaApresentou;
  /// Pedidos pela localização do aparelho (true) ou pelo bairro da conta (false).
  bool _pelaLocalizacao = false;

  /// Raio dos "pedidos próximos" quando há localização.
  static const raioKm = 30;

  @override
  void initState() {
    super.initState();
    _jaApresentou = true;
    _carregar();
  }

  void _carregar() {
    _pedidos = _buscarPedidos();
    Api.i.notificacoes().then((n) {
      if (mounted) setState(() => _naoLidas = n.where((x) => x['lida'] != true).length);
    }).catchError((_) {});
    Api.i.perfil().then((p) {
      if (mounted) setState(() => _foto = p['foto'] as String?);
    }).catchError((_) {});
    setState(() {});
  }

  /// Com a localização do aparelho (a pessoa autoriza): pedidos até [raioKm] km, os mais perto primeiro.
  /// Sem ela: os do município da conta, o bairro primeiro.
  Future<List<dynamic>> _buscarPedidos() async {
    final aqui = await Localizacao.i.obter(pedir: true);
    if (aqui != null) {
      _pelaLocalizacao = true;
      return Api.i.mural(brasil: true, perto: Localizacao.aproximada(aqui), raioKm: raioKm);
    }
    _pelaLocalizacao = false;
    return Api.i.mural();
  }

  String get _saudacao {
    final h = DateTime.now().hour;
    return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final u = Api.i.usuario!;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async => _carregar(),
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 110), children: [
          Entrada(ativa: _apresentar, child: Row(children: [
            Semantics(label: 'ELO', image: true, child: Image.asset('assets/elo-logo-ajustada.png', height: 34)),
            const Spacer(),
            Semantics(
              button: true,
              label: _naoLidas > 0 ? 'Notificações, $_naoLidas não lidas' : 'Notificações',
              excludeSemantics: true,
              child: IconButton(
                iconSize: 28,
                onPressed: () async {
                  abrirNotificacoes(context);
                  setState(() => _naoLidas = 0);
                },
                icon: Badge(
                  isLabelVisible: _naoLidas > 0,
                  smallSize: 10,
                  backgroundColor: EloCores.brand600,
                  child: const Icon(Icons.notifications_none, color: EloCores.brand900),
                ),
              ),
            ),
            const SizedBox(width: 4),
            Semantics(
              button: true,
              label: 'Perfil de ${u.nome}',
              excludeSemantics: true,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: widget.aoAbrirPerfil,
                child: _foto == null
                    ? const CircleAvatar(radius: 24, backgroundColor: EloCores.brand100, child: Icon(Icons.account_circle, color: EloCores.brand700, size: 34))
                    : AvatarPessoa(nome: u.nome, foto: _foto, raio: 24),
              ),
            ),
          ])),
          const SizedBox(height: 14),
          // Saudação digitada na primeira vez, com a mãozinha acenando no fim
          TextoDigitado(
            '$_saudacao, ${u.primeiroNome}!',
            digitar: _apresentar,
            style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w900, color: EloCores.brand900),
            depois: const MaoAcenando(tamanho: 28),
          ),
          const SizedBox(height: 2),
          Entrada(
            ativa: _apresentar,
            ordem: 1,
            child: Text('Como podemos te ajudar hoje?', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w500, color: EloCores.texto2)),
          ),
          const SizedBox(height: 16),
          Entrada(ativa: _apresentar, ordem: 2, child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(99),
              boxShadow: const [BoxShadow(color: Color(0x14003B2E), blurRadius: 12, offset: Offset(0, 3))],
            ),
            child: TextField(
              onChanged: (v) => setState(() => _busca = v.toLowerCase()),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search, color: EloCores.texto2),
                hintText: 'Buscar ajuda, serviços ou oportunidades…',
                filled: true,
                fillColor: EloCores.superficie,
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: BorderSide.none),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: EloCores.brand600, width: 2)),
              ),
            ),
          )),
          const SizedBox(height: 16),
          Entrada(ativa: _apresentar, ordem: 3, child: const CarrosselBanners()),
          const SizedBox(height: 16),
          Entrada(ativa: _apresentar, ordem: 4, child: LayoutBuilder(builder: (context, c) {
            final largura = (c.maxWidth - 12) / 2;
            final atalhos = [
              _Atalho(rotulo: 'Pedir ajuda', detalhe: 'Receba apoio da comunidade', icone: Icons.favorite, cor: EloCores.pedido, fundo: EloCores.pedidoClaro, onTap: widget.aoPedirAjuda),
              _Atalho(rotulo: 'Oferecer ajuda', detalhe: 'Ajude quem precisa', icone: Icons.handshake, cor: EloCores.voluntario, fundo: EloCores.voluntarioClaro, onTap: widget.aoAbrirMapa),
              _Atalho(rotulo: 'Serviços públicos', detalhe: 'Acesse serviços do município', icone: Icons.account_balance, cor: EloCores.servico, fundo: EloCores.servicoClaro, onTap: widget.aoAbrirMapa),
              _Atalho(
                rotulo: 'Oportunidades',
                detalhe: 'Empregos, cursos e capacitações',
                icone: Icons.work,
                cor: EloCores.oportunidade,
                fundo: EloCores.oportunidadeClaro,
                onTap: () => avisar(context, 'Oportunidades de emprego e cursos chegam em breve.'),
              ),
            ];
            return Wrap(spacing: 12, runSpacing: 12, children: [for (final a in atalhos) SizedBox(width: largura, child: Pressionavel(child: a))]);
          })),
          const SizedBox(height: 24),
          Entrada(ativa: _apresentar, ordem: 5, child: Row(children: [
            Expanded(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text('Pedidos próximos de você', maxLines: 1, style: t.titleLarge?.copyWith(fontSize: 20, fontWeight: FontWeight.w900, color: EloCores.brand900)),
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TodosPedidos())),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Text('Ver todos', style: TextStyle(color: EloCores.brand700, fontWeight: FontWeight.w800, fontSize: 15)),
                SizedBox(width: 4),
                Icon(Icons.arrow_forward, size: 20, color: EloCores.brand700),
              ]),
            ),
          ])),
          const SizedBox(height: 8),
          FutureBuilder<List<dynamic>>(
            future: _pedidos,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return Semantics(
                  label: 'Carregando pedidos próximos',
                  liveRegion: true,
                  child: const Column(children: [Esqueleto(altura: 158), SizedBox(height: 12), Esqueleto(altura: 158)]),
                );
              }
              if (snap.hasError) return Text('${snap.error}', style: const TextStyle(color: EloCores.erro));
              final lista = snap.data!
                  .cast<Map<String, dynamic>>()
                  .where((p) => _busca.isEmpty || '${p['titulo']} ${p['bairro']} ${categorias[p['categoria']]}'.toLowerCase().contains(_busca))
                  .take(5)
                  .toList();
              if (lista.isEmpty) {
                return Text(_pelaLocalizacao ? 'Nenhum pedido aberto até $raioKm km de você agora. 💚' : 'Nenhum pedido aberto no seu bairro agora. 💚',
                    style: t.bodyLarge);
              }
              return Column(children: [
                for (final (i, p) in lista.indexed)
                  Entrada(
                    ativa: _apresentar,
                    ordem: 6 + i,
                    child: Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: CartaoPedido(
                      pedido: p,
                      onTap: () async {
                        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PedidoDetalhe(pedido: p)));
                        _carregar();
                      },
                    ),
                  )),
              ]);
            },
          ),
        ]),
      ),
    );
  }
}

/// Atalho do Início: ícone, título, uma linha de explicação e a seta, no fundo da cor do tipo.
class _Atalho extends StatelessWidget {
  const _Atalho({required this.rotulo, required this.detalhe, required this.icone, required this.cor, required this.fundo, required this.onTap});
  final String rotulo;
  final String detalhe;
  final IconData icone;
  final Color cor;
  final Color fundo;
  final VoidCallback onTap;
  static const _estiloTitulo = TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5, color: EloCores.brand900, height: 1.15);
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: '$rotulo. $detalhe',
        excludeSemantics: true,
        child: Material(
          color: fundo,
          borderRadius: BorderRadius.circular(EloRaio.lg),
          child: InkWell(
            borderRadius: BorderRadius.circular(EloRaio.lg),
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 96),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 12, 2, 12),
                child: Row(children: [
                  Icon(icone, color: cor, size: 30),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                      // Título de uma palavra nunca quebra no meio: diminui um pouco se não couber
                      if (rotulo.contains(' '))
                        Text(rotulo, maxLines: 2, style: _estiloTitulo)
                      else
                        FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(rotulo, maxLines: 1, style: _estiloTitulo)),
                      const SizedBox(height: 3),
                      Text(detalhe, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: EloCores.texto2, height: 1.25)),
                    ]),
                  ),
                  const Icon(Icons.chevron_right, color: EloCores.brand900, size: 22),
                ]),
              ),
            ),
          ),
        ),
      );
}
