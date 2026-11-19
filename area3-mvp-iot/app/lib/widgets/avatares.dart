import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../tema.dart';

/// Pessoa como a API devolve em `ajudantes`: primeiro nome e o endereço da foto (ou null).
typedef Ajudante = ({String nome, String? foto});

List<Ajudante> ajudantesDe(dynamic lista) => (lista as List? ?? const [])
    .map((e) => (nome: (e['nome'] ?? '') as String, foto: e['foto'] as String?))
    .toList();

String iniciais(String nome) {
  final partes = nome.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (partes.isEmpty) return '?';
  final a = partes.first.characters.first;
  final b = partes.length > 1 ? partes.last.characters.first : '';
  return (a + b).toUpperCase();
}

/// Foto de perfil redonda; sem foto (ou se ela não carregar), as iniciais do nome.
class AvatarPessoa extends StatelessWidget {
  const AvatarPessoa({super.key, required this.nome, this.foto, this.raio = 20});
  final String nome;
  /// Caminho na API (/fotos/…) ou null.
  final String? foto;
  final double raio;

  @override
  Widget build(BuildContext context) {
    final semFoto = Text(
      iniciais(nome),
      style: TextStyle(color: EloCores.brand700, fontWeight: FontWeight.w800, fontSize: raio * 0.7),
    );
    return CircleAvatar(
      radius: raio,
      backgroundColor: EloCores.brand100,
      child: foto == null
          ? semFoto
          : ClipOval(
              child: Image.network(
                '$apiUrl$foto',
                width: raio * 2,
                height: raio * 2,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Center(child: semFoto),
              ),
            ),
    );
  }
}

/// Grupo de avatares sobrepostos com "+N" no fim (quem está ajudando no pedido).
class GrupoAvatares extends StatelessWidget {
  const GrupoAvatares({super.key, required this.pessoas, required this.total, this.raio = 18, this.maximo = 5});
  final List<Ajudante> pessoas;
  /// Total de pessoas (a API manda até 5 com foto; o resto vira "+N").
  final int total;
  final double raio;
  final int maximo;

  @override
  Widget build(BuildContext context) {
    final visiveis = pessoas.take(maximo).toList();
    final resto = total - visiveis.length;
    final borda = raio * 0.12 + 1;
    final passo = raio * 1.35; // quanto cada círculo anda: < 2*raio para sobrepor
    final circulos = <Widget>[
      for (final p in visiveis) AvatarPessoa(nome: p.nome, foto: p.foto, raio: raio),
      if (resto > 0)
        CircleAvatar(
          radius: raio,
          backgroundColor: EloCores.superficie,
          child: Text(
            '+${resto > 999 ? 999 : resto}',
            style: TextStyle(color: EloCores.texto, fontWeight: FontWeight.w800, fontSize: raio * (resto > 99 ? 0.55 : 0.7)),
          ),
        ),
    ];
    final lado = (raio + borda) * 2;
    return SizedBox(
      width: circulos.isEmpty ? 0 : lado + passo * (circulos.length - 1),
      height: lado,
      child: Stack(children: [
        for (var i = 0; i < circulos.length; i++)
          Positioned(
            left: passo * i,
            child: Container(
              padding: EdgeInsets.all(borda),
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: i == circulos.length - 1 && resto > 0 ? Border.all(color: EloCores.borda) : null,
              ),
              child: circulos[i],
            ),
          ),
      ]),
    );
  }
}
