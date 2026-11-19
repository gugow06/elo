import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'boas_vindas.dart';
import 'codigo_email.dart';
import 'documento_legal.dart';

/// Exclusão de conta (LGPD): explica o que acontece e confirma com o código do e-mail.
class ExcluirConta extends StatefulWidget {
  const ExcluirConta({super.key});
  @override
  State<ExcluirConta> createState() => _ExcluirContaState();
}

class _ExcluirContaState extends State<ExcluirConta> {
  bool _entendi = false;
  bool _enviando = false;

  Future<void> _continuar() async {
    final nav = Navigator.of(context);
    setState(() => _enviando = true);
    try {
      final envio = await Api.i.codigoExclusao();
      if (!mounted) return;
      await nav.push(MaterialPageRoute(
        builder: (_) => CodigoEmail(
          titulo: 'Confirmar a exclusão da conta',
          email: envio.email,
          codigoDemo: envio.codigoDemo,
          botao: 'Excluir minha conta',
          aoConfirmar: (codigo) async {
            await Api.i.excluirConta(codigo);
            if (mounted) avisar(context, 'Sua conta foi excluída. Obrigado por ter feito parte do ELO.');
            nav.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const BoasVindas()), (_) => false);
          },
        ),
      ));
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    Widget item(IconData icone, String texto) => Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icone, color: EloCores.brand700),
            const SizedBox(width: 12),
            Expanded(child: Text(texto, style: t.bodyLarge)),
          ]),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Excluir minha conta', style: TextStyle(fontWeight: FontWeight.w800))),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Text('O que acontece quando você exclui a conta', style: t.titleMedium),
          item(Icons.person_off_outlined, 'Apagamos o seu nome, e-mail, telefone, foto, conversas e notificações. Não dá para desfazer.'),
          item(Icons.assignment_late_outlined, 'Seus pedidos que estão no mural são encerrados, e quem ia levar alguma coisa é avisado.'),
          item(Icons.handshake_outlined, 'As ajudas que você ia levar são canceladas, e os itens voltam para o mural. O que já chegou ao ponto de coleta continua valendo.'),
          item(Icons.account_balance_outlined, 'Pedidos que estão com a equipe do CRAS continuam com a equipe até serem encerrados.'),
          item(Icons.history_outlined, 'Os pedidos e as entregas ficam no histórico do serviço público, sem o seu nome.'),
          const SizedBox(height: 12),
          TextButton(onPressed: () => abrirPolitica(context), child: const Text('Ler a Política de privacidade')),
          const SizedBox(height: 8),
          Cartao(
            child: CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _entendi,
              onChanged: (v) => setState(() => _entendi = v ?? false),
              title: const Text('Entendi que a exclusão é definitiva.'),
              controlAffinity: ListTileControlAffinity.leading,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: EloCores.erro),
            onPressed: !_entendi || _enviando ? null : _continuar,
            child: Text(_enviando ? 'Enviando o código…' : 'Continuar'),
          ),
          const SizedBox(height: 8),
          Text('Vamos enviar um código ao seu e-mail para confirmar que é você.', textAlign: TextAlign.center, style: t.bodyMedium),
        ]),
      ),
    );
  }
}
