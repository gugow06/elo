// Testes de interface e acessibilidade do app ELO (guidelines nativas do Flutter).
import 'package:elo_app/tema.dart';
import 'package:elo_app/telas/boas_vindas.dart';
import 'package:elo_app/telas/mapa.dart';
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
  testWidgets('boas-vindas: entrar, criar conta e Google, Apple e Facebook', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final semantica = tester.ensureSemantics();
    await tester.pumpWidget(_app(const BoasVindas()));
    expect(find.text('Entrar na minha conta'), findsOneWidget);
    expect(find.text('Criar uma conta'), findsOneWidget);
    expect(find.text('Ou continue com'), findsOneWidget);
    for (final p in ['Google', 'Apple', 'Facebook']) {
      expect(find.bySemanticsLabel('Continuar com $p'), findsOneWidget);
    }
    expect(find.textContaining('gov.br'), findsNothing);
    // Ordem do mockup: entrar acima de criar conta, sociais por último
    expect(tester.getTopLeft(find.text('Entrar na minha conta')).dy, lessThan(tester.getTopLeft(find.text('Criar uma conta')).dy));
    expect(tester.getTopLeft(find.text('Criar uma conta')).dy, lessThan(tester.getTopLeft(find.text('Ou continue com')).dy));
    semantica.dispose();
  });

  testWidgets('botão social abre a escolha de conta do provedor', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final semantica = tester.ensureSemantics();
    await tester.pumpWidget(_app(const BoasVindas()));
    await tester.tap(find.bySemanticsLabel('Continuar com Apple'));
    await tester.pumpAndSettle();
    expect(find.text('Escolha uma conta Apple'), findsOneWidget);
    expect(find.text('Cláudia Martins'), findsOneWidget);
    expect(find.text('Usar outra conta'), findsOneWidget);
    semantica.dispose();
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

  test('mapa descreve distância e direção por extenso', () {
    expect(distancia(const Offset(0.5, 0.5), const Offset(0.5, 0.1)), contains('ao norte'));
    expect(distancia(const Offset(0.5, 0.5), const Offset(0.9, 0.5)), contains('a leste'));
    expect(distancia(const Offset(0.5, 0.5), const Offset(0.5, 0.5)), 'perto de você');
  });
}
