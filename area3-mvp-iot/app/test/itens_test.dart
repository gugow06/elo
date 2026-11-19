// Componentes do pedido com itens: escolher o que levar, checklist de quem pediu e contagem de ajudantes.
import 'package:elo_app/tema.dart';
import 'package:elo_app/widgets/itens.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Widget _app(Widget filho) => MaterialApp(theme: temaElo(fontesGoogle: false), home: Scaffold(body: SingleChildScrollView(child: filho)));

const _itens = [
  ItemPedido(id: 'a', descricao: 'Arroz', status: 'aberto'),
  ItemPedido(id: 'b', descricao: 'Feijão', status: 'comprometido'),
  ItemPedido(id: 'c', descricao: 'Óleo', status: 'comprometido', meu: true),
  ItemPedido(id: 'd', descricao: 'Leite', status: 'obtido'),
];

void main() {
  testWidgets('quem ajuda só escolhe itens abertos; os outros mostram por quê', (tester) async {
    final mudancas = <String>[];
    await tester.pumpWidget(_app(EscolhaItens(itens: _itens, escolhidos: const {'a'}, aoMudar: (id, v) => mudancas.add('$id:$v'))));
    expect(find.text('Alguém já vai levar'), findsOneWidget);
    expect(find.text('Você vai levar'), findsOneWidget);
    expect(find.text('Já recebido'), findsOneWidget);
    await tester.tap(find.text('Arroz'));
    await tester.tap(find.text('Feijão'));
    expect(mudancas, ['a:false']);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });

  testWidgets('móvel: ninguém escolhe item por item', (tester) async {
    final mudancas = <String>[];
    await tester.pumpWidget(_app(EscolhaItens(itens: _itens, escolhidos: const {'a'}, travado: true, aoMudar: (id, v) => mudancas.add(id))));
    await tester.tap(find.text('Arroz'));
    expect(mudancas, isEmpty);
  });

  testWidgets('quem pediu vê o progresso e marca o que recebeu', (tester) async {
    final semantica = tester.ensureSemantics();
    final marcados = <String>[];
    await tester.pumpWidget(_app(ChecklistRecebido(itens: _itens, aoMarcar: (i, v) => marcados.add('${i.id}:$v'))));
    expect(find.text('1 de 4 recebidos'), findsOneWidget);
    expect(find.bySemanticsLabel('1 de 4 itens recebidos'), findsOneWidget);
    expect(find.text('Aguardando alguém para levar'), findsOneWidget);
    await tester.tap(find.text('Feijão'));
    await tester.tap(find.text('Leite'));
    expect(marcados, ['b:true', 'd:false']);
    semantica.dispose();
  });

  testWidgets('contagem de quem ajuda, sem nomes', (tester) async {
    await tester.pumpWidget(_app(const Column(children: [PessoasAjudando(0), PessoasAjudando(1), PessoasAjudando(4)])));
    expect(find.text('Ninguém ajudando ainda'), findsOneWidget);
    expect(find.text('1 pessoa ajudando'), findsOneWidget);
    expect(find.text('4 pessoas ajudando'), findsOneWidget);
  });
}
