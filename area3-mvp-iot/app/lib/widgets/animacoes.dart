import 'dart:async';

import 'package:material_ui/material_ui.dart';

/// Animações do ELO. Todas respeitam "reduzir animações" do sistema
/// (MediaQuery.disableAnimations): com ela ligada, o conteúdo aparece pronto, sem movimento.
bool semAnimacao(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Entrada suave: o conteúdo sobe um pouco e aparece. [ordem] escalona as seções (60 ms cada).
class Entrada extends StatefulWidget {
  const Entrada({super.key, required this.child, this.ordem = 0, this.ativa = true});
  final Widget child;
  final int ordem;
  /// false: aparece direto (ex.: a tela já foi mostrada nesta sessão).
  final bool ativa;
  @override
  State<Entrada> createState() => _EntradaState();
}

class _EntradaState extends State<Entrada> with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 520));
  late final _curva = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
  Timer? _atraso;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ctrl.isAnimating || _ctrl.isCompleted || _atraso != null) return;
    if (!widget.ativa || semAnimacao(context)) {
      _ctrl.value = 1;
    } else {
      _atraso = Timer(Duration(milliseconds: 80 + widget.ordem * 70), () {
        if (mounted) _ctrl.forward();
      });
    }
  }

  @override
  void dispose() {
    _atraso?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _curva,
        child: AnimatedBuilder(
          animation: _curva,
          builder: (_, filho) => Transform.translate(offset: Offset(0, 18 * (1 - _curva.value)), child: filho),
          child: widget.child,
        ),
      );
}

/// Texto que aparece como se estivesse sendo digitado, com o cursor piscando enquanto digita.
/// O leitor de tela lê o texto inteiro desde o começo. [digitar] = false mostra o texto pronto.
class TextoDigitado extends StatefulWidget {
  const TextoDigitado(this.texto, {super.key, this.style, this.digitar = true, this.porLetra = const Duration(milliseconds: 55), this.aoTerminar, this.depois});
  final String texto;
  final TextStyle? style;
  final bool digitar;
  final Duration porLetra;
  final VoidCallback? aoTerminar;
  /// Widget logo depois do texto (a mãozinha), que aparece quando a digitação termina.
  final Widget? depois;
  @override
  State<TextoDigitado> createState() => _TextoDigitadoState();
}

class _TextoDigitadoState extends State<TextoDigitado> {
  int _letras = 0;
  bool _cursor = true;
  Timer? _relogio;
  Timer? _pisca;
  bool _iniciado = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciado) return;
    _iniciado = true;
    final total = widget.texto.characters.length;
    if (!widget.digitar || semAnimacao(context)) {
      _letras = total;
      WidgetsBinding.instance.addPostFrameCallback((_) => widget.aoTerminar?.call());
      return;
    }
    _pisca = Timer.periodic(const Duration(milliseconds: 420), (_) {
      if (mounted) setState(() => _cursor = !_cursor);
    });
    // Pequena pausa antes de começar, como quem vai digitar
    _relogio = Timer(const Duration(milliseconds: 350), () {
      _relogio = Timer.periodic(widget.porLetra, (t) {
        if (!mounted) return t.cancel();
        setState(() => _letras++);
        if (_letras >= total) {
          t.cancel();
          _pisca?.cancel();
          setState(() => _cursor = false);
          widget.aoTerminar?.call();
        }
      });
    });
  }

  @override
  void dispose() {
    _relogio?.cancel();
    _pisca?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.texto.characters.length;
    final pronto = _letras >= total;
    final visivel = widget.texto.characters.take(_letras).toString();
    final estilo = DefaultTextStyle.of(context).style.merge(widget.style);
    return Semantics(
      label: widget.texto,
      excludeSemantics: true,
      child: Stack(children: [
        // Reserva o espaço do texto inteiro: nada embaixo "pula" enquanto digita
        Opacity(
          opacity: 0,
          child: Text.rich(TextSpan(text: widget.texto, style: estilo, children: [if (widget.depois != null) WidgetSpan(child: widget.depois!)])),
        ),
        Text.rich(TextSpan(style: estilo, children: [
          TextSpan(text: visivel),
          if (!pronto) TextSpan(text: '|', style: TextStyle(color: _cursor ? estilo.color : Colors.transparent, fontWeight: FontWeight.w400)),
          if (pronto && widget.depois != null) WidgetSpan(alignment: PlaceholderAlignment.middle, child: widget.depois!),
        ])),
      ]),
    );
  }
}

/// Retorno ao toque: o conteúdo encolhe de leve enquanto está pressionado.
class Pressionavel extends StatefulWidget {
  const Pressionavel({super.key, required this.child, this.ativo = true});
  final Widget child;
  final bool ativo;
  @override
  State<Pressionavel> createState() => _PressionavelState();
}

class _PressionavelState extends State<Pressionavel> {
  bool _apertado = false;
  void _mudar(bool v) {
    if (widget.ativo && _apertado != v) setState(() => _apertado = v);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.ativo || semAnimacao(context)) return widget.child;
    return Listener(
      onPointerDown: (_) => _mudar(true),
      onPointerUp: (_) => _mudar(false),
      onPointerCancel: (_) => _mudar(false),
      child: AnimatedScale(
        scale: _apertado ? 0.97 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

/// Bloco cinza que pulsa de leve: o lugar do conteúdo enquanto carrega.
class Esqueleto extends StatefulWidget {
  const Esqueleto({super.key, required this.altura, this.largura = double.infinity, this.raio = 16});
  final double altura;
  final double largura;
  final double raio;
  @override
  State<Esqueleto> createState() => _EsqueletoState();
}

class _EsqueletoState extends State<Esqueleto> with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!semAnimacao(context) && !_ctrl.isAnimating) _ctrl.repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween<double>(begin: 0.55, end: 1).animate(_ctrl),
        child: Container(
          width: widget.largura,
          height: widget.altura,
          decoration: BoxDecoration(color: const Color(0xFFE6ECE8), borderRadius: BorderRadius.circular(widget.raio)),
        ),
      );
}
