import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../localizacao.dart';
import '../tema.dart';
import '../widgets/comum.dart';

/// Pedir ajuda: o cidadão conta o que precisa em texto livre. A triagem acontece na API;
/// o cidadão nunca vê a faixa de risco (RT-05), só o protocolo e o próximo passo.
class PedirAjuda extends StatefulWidget {
  const PedirAjuda({super.key});
  @override
  State<PedirAjuda> createState() => _PedirAjudaState();
}

class _PedirAjudaState extends State<PedirAjuda> {
  final _relato = TextEditingController();
  List<Map<String, dynamic>> _bairros = [];
  /// id de um bairro da lista, [_local] (o da localização), [_outro] (digitado) ou null (o da conta).
  String? _bairroId;
  /// A conta tem bairro? Sem bairro na conta, escolher o bairro do pedido é obrigatório.
  bool? _contaTemBairro;
  /// Bairro que a localização do aparelho encontrou e que ainda não está na lista.
  String? _bairroLocal;
  final _bairroDigitado = TextEditingController();

  static const _local = '_local';
  static const _outro = '_outro';
  bool _enviando = false;
  Map<String, dynamic>? _resposta;
  String? _erro;

  static const _sugestoes = ['Preciso de uma cesta básica', 'Preciso de roupas de frio', 'Preciso de um colchão', 'Preciso de material escolar'];

  @override
  void initState() {
    super.initState();
    _carregarBairros();
  }

  /// Bairros do município e, para conta sem bairro, a sugestão pela localização (se já permitida).
  Future<void> _carregarBairros() async {
    try {
      final lista = (await Api.i.bairros()).cast<Map<String, dynamic>>();
      final perfil = await Api.i.perfil();
      if (!mounted) return;
      final temBairro = perfil['bairro'] != null;
      setState(() { _bairros = lista; _contaTemBairro = temBairro; });
      if (temBairro) return;
      final aqui = await Localizacao.i.obter(pedir: true);
      if (aqui == null) return;
      final r = await Api.i.ondeEstou(aqui.latitude, aqui.longitude);
      final nome = (r['bairro'] as Map?)?['nome'] as String?;
      if (!mounted || nome == null || _bairroId != null) return;
      final daLista = lista.where((b) => (b['nome'] as String).toLowerCase() == nome.toLowerCase());
      setState(() {
        if (daLista.isNotEmpty) {
          _bairroId = daLista.first['id'] as String;
        } else {
          _bairroLocal = nome;
          _bairroId = _local;
        }
      });
    } on ErroApi {
      if (mounted) setState(() => _contaTemBairro ??= false);
    }
  }

  Future<void> _enviar() async {
    final digitado = _bairroDigitado.text.trim();
    if (_contaTemBairro == false && (_bairroId == null || (_bairroId == _outro && digitado.length < 2))) {
      setState(() => _erro = 'Escolha o bairro do pedido.');
      return;
    }
    setState(() { _enviando = true; _erro = null; });
    try {
      final r = await Api.i.pedirAjuda(
        _relato.text,
        bairroId: _bairroId == _local || _bairroId == _outro ? null : _bairroId,
        bairroNome: _bairroId == _local ? _bairroLocal : (_bairroId == _outro ? digitado : null),
      );
      setState(() => _resposta = r);
    } on ErroApi catch (e) {
      setState(() => _erro = e.mensagem);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    if (_resposta != null) return _Confirmacao(resposta: _resposta!);
    return Scaffold(
      appBar: AppBar(title: const Text('Pedir ajuda', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Text('Conte o que você precisa', style: t.titleLarge),
        const SizedBox(height: 6),
        Text('Escreva do seu jeito. O seu nome e endereço não aparecem para ninguém do bairro.', style: t.bodyMedium),
        const SizedBox(height: 16),
        TextField(
          controller: _relato,
          minLines: 4,
          maxLines: 8,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          style: const TextStyle(fontSize: 17),
          decoration: const InputDecoration(labelText: 'O que você precisa?', alignLabelWithHint: true, hintText: 'Ex.: perdi o emprego e preciso de uma cesta básica'),
          onChanged: (_) => setState(() {}),
        ),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in _sugestoes)
            ActionChip(
              label: Text(s),
              onPressed: () => setState(() => _relato.text = s),
              backgroundColor: EloCores.brand100,
              labelStyle: const TextStyle(color: EloCores.brand900, fontWeight: FontWeight.w700),
            ),
        ]),
        const SizedBox(height: 16),
        if (_contaTemBairro != null)
          DropdownButtonFormField<String>(
            // A sugestão da localização chega depois: a chave recria o campo com o valor novo
            key: ValueKey('bairro-$_bairroLocal-${_bairros.length}'),
            initialValue: _bairroId,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: _contaTemBairro! ? 'Bairro do pedido (opcional)' : 'Bairro do pedido',
              helperText: _contaTemBairro! ? null : 'Mostramos o pedido para quem está perto desse bairro. Nunca o seu endereço.',
              helperMaxLines: 2,
            ),
            items: [
              if (_contaTemBairro!) const DropdownMenuItem(value: null, child: Text('O bairro do meu cadastro')),
              if (_bairroLocal != null) DropdownMenuItem(value: _local, child: Text('$_bairroLocal (onde você está)', overflow: TextOverflow.ellipsis)),
              for (final b in _bairros) DropdownMenuItem(value: b['id'] as String, child: Text(b['nome'], overflow: TextOverflow.ellipsis)),
              const DropdownMenuItem(value: _outro, child: Text('Meu bairro não está na lista')),
            ],
            onChanged: (v) => setState(() => _bairroId = v),
          ),
        if (_bairroId == _outro) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _bairroDigitado,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Bairro', hintText: 'Nome do bairro'),
          ),
        ],
        if (_erro != null) ...[
          const SizedBox(height: 12),
          Semantics(liveRegion: true, child: Text(_erro!, style: const TextStyle(color: EloCores.erro, fontWeight: FontWeight.w700))),
        ],
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _enviando || _relato.text.trim().length < 10 ? null : _enviar,
          icon: const Icon(Icons.send),
          label: Text(_enviando ? 'Enviando…' : 'Enviar pedido'),
        ),
        const SizedBox(height: 12),
        Text('Sem celular ou sem internet? Peça ajuda no CRAS ou pelo WhatsApp da prefeitura.', style: t.bodyMedium, textAlign: TextAlign.center),
      ]),
    );
  }
}

class _Confirmacao extends StatelessWidget {
  const _Confirmacao({required this.resposta});
  final Map<String, dynamic> resposta;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final protocolo = resposta['protocolo'] as String;
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const SizedBox(height: 24),
          const Icon(Icons.check_circle, color: EloCores.brand600, size: 72),
          const SizedBox(height: 16),
          Text('Pedido recebido!', style: t.headlineMedium, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          Text('Seu protocolo', style: t.bodyLarge, textAlign: TextAlign.center),
          Semantics(
            label: 'Protocolo ${protocolo.split('').join(' ')}',
            excludeSemantics: true,
            child: Text(protocolo, textAlign: TextAlign.center, style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w900, letterSpacing: 10, color: EloCores.brand900)),
          ),
          const SizedBox(height: 8),
          Text('Anote este número. Com ele e a sua data de nascimento você consulta o pedido por qualquer canal.', style: t.bodyMedium, textAlign: TextAlign.center),
          const SizedBox(height: 20),
          Cartao(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(resposta['status'], style: t.titleMedium),
              const SizedBox(height: 6),
              Text(resposta['mensagem'], style: t.bodyLarge),
            ]),
          ),
          const SizedBox(height: 24),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Acompanhar meu pedido')),
        ]),
      ),
    );
  }
}
