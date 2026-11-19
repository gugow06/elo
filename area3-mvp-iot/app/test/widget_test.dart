// Testes de interface e acessibilidade do app ELO (guidelines nativas do Flutter).
import 'package:elo_app/api.dart';
import 'package:elo_app/tema.dart';
import 'package:elo_app/telas/boas_vindas.dart';
import 'package:elo_app/telas/mapa.dart';
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
    expect(find.text('Em breve'), findsNWidgets(3));
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

  test('mapa descreve distância e direção por extenso', () {
    expect(distancia(const Offset(0.5, 0.5), const Offset(0.5, 0.1)), contains('ao norte'));
    expect(distancia(const Offset(0.5, 0.5), const Offset(0.9, 0.5)), contains('a leste'));
    expect(distancia(const Offset(0.5, 0.5), const Offset(0.5, 0.5)), 'perto de você');
  });
}
