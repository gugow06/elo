import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import 'acompanhar.dart';
import 'boas_vindas.dart';
import 'codigo_email.dart';

class Perfil extends StatefulWidget {
  const Perfil({super.key});
  @override
  State<Perfil> createState() => _PerfilState();
}

class _PerfilState extends State<Perfil> {
  Map<String, dynamic>? _perfil;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final p = await Api.i.perfil();
      if (mounted) setState(() => _perfil = p);
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    }
  }

  /// Ativa ou desativa a verificação em duas etapas: as duas exigem o código do e-mail.
  Future<void> _alternarDoisFatores() async {
    final ativar = _perfil?['dois_fatores'] != true;
    final nav = Navigator.of(context);
    try {
      final envio = await Api.i.codigoDoisFatores();
      if (!mounted) return;
      await nav.push(MaterialPageRoute(
        builder: (_) => CodigoEmail(
          titulo: ativar ? 'Ativar verificação em duas etapas' : 'Desativar verificação em duas etapas',
          email: envio.email,
          codigoDemo: envio.codigoDemo,
          botao: ativar ? 'Ativar' : 'Desativar',
          aoConfirmar: (codigo) async {
            final p = ativar ? await Api.i.ativarDoisFatores(codigo) : await Api.i.desativarDoisFatores(codigo);
            if (mounted) setState(() => _perfil = p);
            nav.pop();
          },
        ),
      ));
      if (mounted && ativar && _perfil?['verificado'] == true) avisar(context, 'Pronto! Seu perfil agora é verificado.');
    } on ErroApi catch (e) {
      if (mounted) avisar(context, e.mensagem, erro: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final u = Api.i.usuario!;
    final p = _perfil;
    return Scaffold(
      appBar: AppBar(title: const Text('Perfil', style: TextStyle(fontWeight: FontWeight.w800))),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Cartao(
            child: Row(children: [
              const CircleAvatar(radius: 30, backgroundColor: EloCores.brand100, child: Icon(Icons.person, color: EloCores.brand700, size: 32)),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u.nome, style: t.titleMedium),
                  if (p?['email'] != null) Text(p!['email'], style: t.bodyMedium),
                  if (p?['verificado'] == true) ...[const SizedBox(height: 6), const SeloVerificado()],
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          _Atalho(icone: Icons.assignment_outlined, rotulo: 'Meus pedidos', tela: const Acompanhar(ajudas: false)),
          const SizedBox(height: 12),
          _Atalho(icone: Icons.handshake_outlined, rotulo: 'Minhas ajudas', tela: const Acompanhar(ajudas: true)),
          const SizedBox(height: 12),
          if (p == null)
            const Carregando(texto: 'Carregando verificação da conta…')
          else
            SecaoVerificacao(perfil: p, aoAlternarDoisFatores: _alternarDoisFatores),
          const SizedBox(height: 12),
          Cartao(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Seus dados', style: t.titleMedium),
              const SizedBox(height: 6),
              Text(
                'O ELO usa os seus dados só para organizar a ajuda (LGPD). Seu endereço nunca é mostrado no bairro, '
                'e o relato do pedido só é lido pela equipe técnica do CRAS.',
                style: t.bodyMedium,
              ),
            ]),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async {
              await Api.i.sair();
              if (!context.mounted) return;
              Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const BoasVindas()), (_) => false);
            },
            icon: const Icon(Icons.logout),
            label: const Text('Sair'),
          ),
        ]),
      ),
    );
  }
}

/// Selo "Verificado": e-mail confirmado + verificação em duas etapas por e-mail ativa.
class SeloVerificado extends StatelessWidget {
  const SeloVerificado({super.key});
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Perfil verificado',
        excludeSemantics: true,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: EloCores.sucessoClaro, borderRadius: BorderRadius.circular(99)),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.verified, size: 16, color: EloCores.sucesso),
            SizedBox(width: 4),
            Text('Verificado', style: TextStyle(color: EloCores.sucesso, fontWeight: FontWeight.w800, fontSize: 13)),
          ]),
        ),
      );
}

/// Checklist da verificação da conta. O que ainda não existe aparece como "em breve".
class SecaoVerificacao extends StatelessWidget {
  const SecaoVerificacao({super.key, required this.perfil, required this.aoAlternarDoisFatores});
  final Map<String, dynamic> perfil;
  final VoidCallback aoAlternarDoisFatores;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final emailOk = perfil['email_confirmado'] == true;
    final dois = perfil['dois_fatores'] == true;
    return Cartao(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Verificação da conta', style: t.titleMedium),
        const SizedBox(height: 4),
        Text(
          perfil['verificado'] == true
              ? 'Seu perfil é verificado.'
              : 'Ative a verificação em duas etapas por e-mail para ter o selo de perfil verificado.',
          style: t.bodyMedium,
        ),
        const SizedBox(height: 8),
        _ItemVerificacao(
          icone: Icons.mark_email_read_outlined,
          titulo: 'E-mail confirmado',
          detalhe: emailOk ? 'Confirmado pelo código ou pelo Google' : 'Entre com o código enviado ao e-mail para confirmar',
          feito: emailOk,
        ),
        _ItemVerificacao(
          icone: Icons.security_outlined,
          titulo: 'Verificação em duas etapas por e-mail',
          detalhe: dois ? 'Ativa: ao entrar com o Google, pedimos também um código no e-mail' : 'Pede um código no e-mail ao entrar',
          feito: dois,
          acao: TextButton(onPressed: aoAlternarDoisFatores, child: Text(dois ? 'Desativar' : 'Ativar')),
        ),
        const _ItemVerificacao(icone: Icons.photo_camera_outlined, titulo: 'Foto de perfil', detalhe: 'Em breve'),
        const _ItemVerificacao(icone: Icons.phonelink_lock_outlined, titulo: 'Aplicativo autenticador', detalhe: 'Em breve'),
        const _ItemVerificacao(icone: Icons.account_balance_outlined, titulo: 'Conta gov.br', detalhe: 'Em breve'),
      ]),
    );
  }
}

class _ItemVerificacao extends StatelessWidget {
  const _ItemVerificacao({required this.icone, required this.titulo, required this.detalhe, this.feito, this.acao});
  final IconData icone;
  final String titulo;
  final String detalhe;
  /// null = ainda não disponível ("em breve")
  final bool? feito;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final emBreve = feito == null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Icon(icone, color: emBreve ? EloCores.texto2 : EloCores.brand700),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(titulo, style: TextStyle(fontWeight: FontWeight.w700, color: emBreve ? EloCores.texto2 : EloCores.texto)),
            Text(detalhe, style: t.bodyMedium?.copyWith(fontSize: 14)),
          ]),
        ),
        if (acao != null)
          acao!
        else if (feito == true)
          const Icon(Icons.check_circle, color: EloCores.sucesso, semanticLabel: 'Feito'),
      ]),
    );
  }
}

class _Atalho extends StatelessWidget {
  const _Atalho({required this.icone, required this.rotulo, required this.tela});
  final IconData icone;
  final String rotulo;
  final Widget tela;
  @override
  Widget build(BuildContext context) => Cartao(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => tela)),
        rotulo: rotulo,
        child: Row(children: [
          Icon(icone, color: EloCores.brand700),
          const SizedBox(width: 12),
          Expanded(child: Text(rotulo, style: const TextStyle(fontWeight: FontWeight.w700))),
          const Icon(Icons.chevron_right),
        ]),
      );
}
