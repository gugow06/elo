// Testes de interface e acessibilidade do app ELO (guidelines nativas do Flutter).
import 'package:elo_app/api.dart';
import 'package:elo_app/localizacao.dart';
import 'package:elo_app/tema.dart';
import 'package:elo_app/telas/boas_vindas.dart';
import 'package:elo_app/geo.dart';
import 'package:latlong2/latlong.dart';
import 'package:elo_app/telas/perfil.dart';
import 'package:elo_app/widgets/comum.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Widget _app(Widget filho) => MaterialApp(theme: temaElo(fontesGoogle: false), home: filho);

final _pedido = {
  'id': 'p1',
  'titulo': 'Família precisa de alimentos',
  'categoria': 'alimento',
  'bairro': 'Vila Nova',
  'ponto_coleta': 'Ponto de Coleta Vila Nova',
  'criado_em': DateTime.now().subtract(const Duration(hours: 5)).toIso8601String(),
};

void main() {
  testWidgets('boas-vindas: entrar, criar conta e continuar com Google', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(const BoasVindas()));
    expect(find.text('Entrar na minha conta'), findsOneWidget);
    expect(find.text('Criar uma conta'), findsOneWidget);
    expect(find.text('Ou continue com'), findsOneWidget);
    expect(find.text('Continuar com Google'), findsOneWidget);
    for (final fora in ['Apple', 'Facebook', 'gov.br']) {
      expect(find.textContaining(fora), findsNothing);
    }
    // Ordem do mockup: entrar, criar conta e Google por último
    double y(String texto) => tester.getTopLeft(find.text(texto)).dy;
    expect(y('Entrar na minha conta'), lessThan(y('Criar uma conta')));
    expect(y('Criar uma conta'), lessThan(y('Continuar com Google')));
  });

  testWidgets('Google sem Client ID configurado avisa em vez de travar', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(const BoasVindas()));
    await tester.tap(find.text('Continuar com Google'));
    await tester.pump();
    expect(find.textContaining('login com Google não foi configurado'), findsOneWidget);
  });

  testWidgets('boas-vindas atende contraste, alvo de toque e rótulos (celular em retrato)', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final semantica = tester.ensureSemantics();
    await tester.pumpWidget(_app(const BoasVindas()));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    semantica.dispose();
  });

  testWidgets('verificação da conta: selo só com duas etapas ativa; SMS fora; o resto "em breve"', (tester) async {
    final semantica = tester.ensureSemantics();
    var toques = 0;
    Widget secao(Map<String, dynamic> p) => _app(Scaffold(body: SingleChildScrollView(child: SecaoVerificacao(perfil: p, aoAlternarDoisFatores: () => toques++))));

    await tester.pumpWidget(secao({'email_confirmado': true, 'dois_fatores': false, 'verificado': false}));
    expect(find.text('Verificação em duas etapas por e-mail'), findsOneWidget);
    expect(find.text('Ativar'), findsOneWidget);
    expect(find.text('Em breve'), findsNWidgets(2)); // aplicativo autenticador e gov.br (a foto já existe, no topo do Perfil)
    expect(find.textContaining('SMS'), findsNothing);
    await tester.tap(find.text('Ativar'));
    expect(toques, 1);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    await tester.pumpWidget(secao({'email_confirmado': true, 'dois_fatores': true, 'verificado': true}));
    expect(find.text('Desativar'), findsOneWidget);
    expect(find.text('Seu perfil é verificado.'), findsOneWidget);
    semantica.dispose();
  });

  testWidgets('selo de perfil verificado tem rótulo para leitor de tela', (tester) async {
    final semantica = tester.ensureSemantics();
    await tester.pumpWidget(_app(const Scaffold(body: Center(child: SeloVerificado()))));
    expect(find.bySemanticsLabel('Perfil verificado'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    semantica.dispose();
  });

  testWidgets('cartão do mural é lido como um bloco, sem endereço nem nome', (tester) async {
    final semantica = tester.ensureSemantics();
    await tester.pumpWidget(_app(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: CartaoPedido(pedido: _pedido, onTap: () {})))));
    expect(
      find.bySemanticsLabel(RegExp(r'Alimentação\. Família precisa de alimentos\. Bairro Vila Nova\.')),
      findsOneWidget,
    );
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    semantica.dispose();
  });

  testWidgets('tag de categoria usa texto escuro sobre âmbar', (tester) async {
    await tester.pumpWidget(_app(const Scaffold(body: Center(child: TagCategoria('alimento')))));
    final texto = tester.widget<Text>(find.text('Alimentação'));
    expect(texto.style?.color, EloCores.brand900);
  });

  test('lista de pedidos monta os filtros do mural', () {
    expect(Api.caminhoMural(), '/mural');
    expect(Api.caminhoMural(brasil: true), '/mural?abrangencia=brasil');
    expect(Api.caminhoMural(brasil: true, perto: (latitude: -22.89, longitude: -47.05)), '/mural?abrangencia=brasil&lat=-22.89&lon=-47.05');
    expect(Api.caminhoMural(brasil: true, uf: 'BA'), '/mural?uf=BA'); // estado escolhido vale mais
    expect(Api.caminhoMural(uf: 'BA', ordem: 'aguardando'), '/mural?uf=BA&ordem=aguardando');
    expect(Api.caminhoMural(municipio: 'abc', categoria: 'roupa', pagina: 2), '/mural?municipio=abc&categoria=roupa&pagina=2');
    expect(Api.caminhoMural(pagina: 0), '/mural');
  });

  testWidgets('cartão mostra a cidade só na lista de todos os pedidos', (tester) async {
    final p = {..._pedido, 'municipio': 'Salvador', 'uf': 'BA'};
    await tester.pumpWidget(_app(Scaffold(body: CartaoPedido(pedido: p, onTap: () {}))));
    expect(find.textContaining('Salvador'), findsNothing);
    await tester.pumpWidget(_app(Scaffold(body: CartaoPedido(pedido: p, onTap: () {}, mostrarCidade: true))));
    expect(find.text('Bairro Vila Nova · Salvador - BA'), findsOneWidget);
  });

  test('mapa descreve distância e direção por extenso (latitude e longitude reais)', () {
    const se = LatLng(-23.5505, -46.6333); // Praça da Sé, São Paulo
    expect(distanciaPorExtenso(se, const LatLng(-23.5300, -46.6333)), '2,3 km ao norte');
    expect(distanciaPorExtenso(se, const LatLng(-23.5505, -46.6290)), contains('a leste'));
    expect(distanciaPorExtenso(se, const LatLng(-23.5505, -46.6290)), endsWith('m a leste'));
    expect(distanciaPorExtenso(se, se), 'perto de você');
    expect(distanciaKm(se, const LatLng(-22.9068, -43.1729)), closeTo(357, 5)); // São Paulo → Rio
  });

  test('área do mapa vai para a API limitada ao Brasil', () {
    expect(caixaApi(oeste: -46.7, sul: -23.6, leste: -46.6, norte: -23.5), '-46.70000,-23.60000,-46.60000,-23.50000');
    expect(caixaApi(oeste: -180, sul: -90, leste: 180, norte: 90), '-74.90000,-34.90000,-30.10000,5.90000');
  });

  test('localização para ordenar vai arredondada a ~1 km', () {
    expect(Localizacao.aproximada((latitude: -22.87654, longitude: -47.12345)), (latitude: -22.88, longitude: -47.12));
  });
}
