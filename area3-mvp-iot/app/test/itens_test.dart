// Componentes do pedido com itens: escolher o que levar, checklist de quem pediu e contagem de ajudantes.
import 'package:elo_app/tema.dart';
import 'package:elo_app/telas/acompanhar.dart';
import 'package:elo_app/widgets/avatares.dart';
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

  testWidgets('contagem de quem ajuda, sem lista de pessoas', (tester) async {
    await tester.pumpWidget(_app(const Column(children: [PessoasAjudando(0), PessoasAjudando(1), PessoasAjudando(4)])));
    expect(find.text('Ninguém ajudando ainda'), findsOneWidget);
    expect(find.text('1 pessoa ajudando'), findsOneWidget);
    expect(find.text('4 pessoas ajudando'), findsOneWidget);
  });

  testWidgets('quem ajuda aparece em fotos sobrepostas, com iniciais sem foto e "+N" para o resto', (tester) async {
    const ajudantes = <Ajudante>[(nome: 'Cláudia', foto: null), (nome: 'Roberto', foto: null)];
    await tester.pumpWidget(_app(const PessoasAjudando(7, ajudantes: ajudantes)));
    expect(find.text('7 pessoas ajudando'), findsOneWidget);
    expect(find.text('C'), findsOneWidget);
    expect(find.text('R'), findsOneWidget);
    expect(find.text('+5'), findsOneWidget);
    expect(find.bySemanticsLabel('7 pessoas ajudando: Cláudia, Roberto e outras'), findsOneWidget);
  });

  test('iniciais do nome', () {
    expect(iniciais('Ana Paula Ribeiro'), 'AR');
    expect(iniciais('cláudia'), 'C');
    expect(iniciais('  '), '?');
  });

  testWidgets('item que chegou ao ponto (registrado pelo agente) mostra a quantidade e "pode retirar"', (tester) async {
    await tester.pumpWidget(_app(ChecklistRecebido(
      itens: ItemPedido.daLista([
        {'id': 'a', 'descricao': 'Arroz', 'status': 'entregue', 'quantidade': 3},
        {'id': 'b', 'descricao': 'Feijão', 'status': 'comprometido'},
      ]),
      aoMarcar: (_, _) {},
    )));
    expect(find.text('Chegou ao ponto de coleta (3): pode retirar'), findsOneWidget);
    expect(find.text('Alguém vai levar'), findsOneWidget);
  });

  testWidgets('código de retirada aparece para quem pediu, com leitura para leitor de tela', (tester) async {
    await tester.pumpWidget(_app(const CodigoRetirada('4821')));
    expect(find.text('4821'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Código de retirada 4 8 2 1')), findsOneWidget);
  });
}
