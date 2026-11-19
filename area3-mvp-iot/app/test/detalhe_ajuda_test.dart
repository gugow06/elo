// "Minhas ajudas" → detalhe: endereço do ponto, o que levar e o protocolo de novo.
import 'package:elo_app/tema.dart';
import 'package:elo_app/telas/detalhe_ajuda.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('mostra o protocolo, só os itens que a pessoa leva e onde entregar', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: temaElo(fontesGoogle: false),
      home: const DetalheAjuda(o: {
        'titulo': 'Família precisa de alimentos',
        'protocolo': '482915',
        'status': 'em_atendimento',
        'bairro': 'Vila Nova',
        'municipio': 'Campinas',
        'uf': 'SP',
        'ponto_coleta': 'Ponto de Coleta Vila Nova',
        'ponto_coleta_endereco': 'Escola Municipal Vila Nova, portão lateral',
        'ponto_coleta_horario': 'Seg a sex, 8h às 17h',
        'instrucoes': 'Leve Arroz ao Ponto de Coleta Vila Nova. Lá, digite o protocolo 482915 no teclado do ponto.',
        'desfecho_texto': 'Aguardando você levar a doação ao ponto de coleta.',
        'pessoas_ajudando': 2,
        'ajudantes': [],
        'itens': [
          {'id': 'a', 'descricao': 'Arroz', 'status': 'comprometido', 'meu': true},
          {'id': 'b', 'descricao': 'Feijão', 'status': 'comprometido', 'meu': false},
        ],
      }),
    ));
    expect(find.text('482915'), findsOneWidget);
    expect(find.text('Arroz'), findsOneWidget);
    expect(find.text('Feijão'), findsNothing); // outra pessoa leva
    expect(find.text('Escola Municipal Vila Nova, portão lateral'), findsOneWidget);
    expect(find.text('Seg a sex, 8h às 17h'), findsOneWidget);
    expect(find.text('2 pessoas ajudando'), findsOneWidget);
  });
}
