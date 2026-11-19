import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'tema.dart';
import 'telas/boas_vindas.dart';
import 'telas/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.i.carregarSessao();
  runApp(const EloApp());
}

class EloApp extends StatelessWidget {
  const EloApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ELO',
      debugShowCheckedModeBanner: false,
      theme: temaElo(),
      locale: const Locale('pt', 'BR'),
      home: Api.i.usuario == null ? const BoasVindas() : const Shell(),
    );
  }
}
