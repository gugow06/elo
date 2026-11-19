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
  testWidgets('boas-vindas: login por gov.br e por código, sem login social', (tester) async {
    await tester.pumpWidget(_app(const BoasVindas()));
    expect(find.text('Entrar com gov.br'), findsOneWidget);
    expect(find.text('Receber código por SMS'), findsOneWidget);
    expect(find.textContaining('Google'), findsNothing);
    expect(find.textContaining('Facebook'), findsNothing);
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
