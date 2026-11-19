import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../tema.dart';

/// Banners do Início (images/banner1..3, usados como estão). O texto já está na imagem;
/// o leitor de tela lê a mesma frase.
const bannersInicio = [
  (imagem: 'assets/banner1.jpg', texto: 'Solidariedade que aproxima. Conecte-se à sua comunidade e faça a diferença na vida de quem precisa.'),
  (imagem: 'assets/banner2.jpg', texto: 'Comunidade conectada, mais apoio para todos.'),
  (imagem: 'assets/banner3.jpg', texto: 'Ajuda que conecta pessoas e transforma comunidades.'),
];

/// Carrossel com os banners: passa sozinho a cada [intervalo], com os pontos indicando qual está na tela.
/// Tocar num ponto vai para aquele banner. Para de passar enquanto a pessoa arrasta.
class CarrosselBanners extends StatefulWidget {
  const CarrosselBanners({super.key, this.intervalo = const Duration(seconds: 6)});
  final Duration intervalo;
  @override
  State<CarrosselBanners> createState() => _CarrosselBannersState();
}

class _CarrosselBannersState extends State<CarrosselBanners> {
  final _pagina = PageController();
  int _atual = 0;
  Timer? _relogio;

  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  void _iniciar() {
    _relogio?.cancel();
    _relogio = Timer.periodic(widget.intervalo, (_) {
      if (!_pagina.hasClients) return;
      _pagina.animateToPage((_atual + 1) % bannersInicio.length, duration: const Duration(milliseconds: 450), curve: Curves.easeInOut);
    });
  }

  @override
  void dispose() {
    _relogio?.cancel();
    _pagina.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 2,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(EloRaio.xl),
        child: Stack(children: [
          NotificationListener<ScrollNotification>(
            onNotification: (n) {
              // Arrastou: recomeça a contagem para não trocar logo em seguida
              if (n is ScrollStartNotification && n.dragDetails != null) _relogio?.cancel();
              if (n is ScrollEndNotification) _iniciar();
              return false;
            },
            child: PageView.builder(
              controller: _pagina,
              itemCount: bannersInicio.length,
              onPageChanged: (i) => setState(() => _atual = i),
              itemBuilder: (_, i) => Semantics(
                label: 'Banner ${i + 1} de ${bannersInicio.length}: ${bannersInicio[i].texto}',
                image: true,
                excludeSemantics: true,
                child: Image.asset(bannersInicio[i].imagem, fit: BoxFit.cover),
              ),
            ),
          ),
          Positioned(
            right: 12,
            bottom: 10,
            child: Row(children: [
              for (var i = 0; i < bannersInicio.length; i++)
                Semantics(
                  button: true,
                  label: 'Ver banner ${i + 1}',
                  selected: i == _atual,
                  excludeSemantics: true,
                  child: GestureDetector(
                    onTap: () => _pagina.animateToPage(i, duration: const Duration(milliseconds: 350), curve: Curves.easeInOut),
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        width: i == _atual ? 10 : 8,
                        height: i == _atual ? 10 : 8,
                        decoration: BoxDecoration(
                          color: i == _atual ? Colors.white : Colors.white.withValues(alpha: 0.55),
                          shape: BoxShape.circle,
                          boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 3)],
                        ),
                      ),
                    ),
                  ),
                ),
            ]),
          ),
        ]),
      ),
    );
  }
}
