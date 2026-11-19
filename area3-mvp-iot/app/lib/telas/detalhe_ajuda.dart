import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';

import '../geo.dart';
import '../tema.dart';
import '../widgets/comum.dart';
import '../widgets/itens.dart';

/// "Minhas ajudas" → detalhe: onde entregar (endereço, horário, telefone e mapa), o que levar
/// e o protocolo para digitar no ponto de coleta. [o] é um item de GET /voluntario/ofertas.
class DetalheAjuda extends StatelessWidget {
  const DetalheAjuda({super.key, required this.o});
  final Map<String, dynamic> o;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final itens = ItemPedido.daLista(o['itens']);
    final meus = itens.where((i) => i.meu).toList();
    final protocolo = o['protocolo'] as String;
    final lat = (o['ponto_coleta_latitude'] as num?)?.toDouble();
    final lng = (o['ponto_coleta_longitude'] as num?)?.toDouble();
    final encerrado = o['status'] == 'concluida' || o['status'] == 'cancelada';
    String? texto(String chave) {
      final v = o[chave];
      return v is String && v.trim().isNotEmpty ? v : null;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Sua ajuda', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
        Text(o['titulo'], style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text('Bairro ${o['bairro']}${o['municipio'] != null ? ' · ${o['municipio']} - ${o['uf']}' : ''}', style: t.bodyMedium),
        const SizedBox(height: 16),

        // Protocolo em destaque: é o que a pessoa digita no teclado do ponto de coleta
        Cartao(
          child: Column(children: [
            Text('Protocolo para digitar no ponto de coleta', style: t.bodyMedium, textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Semantics(
              label: 'Protocolo ${protocolo.split('').join(' ')}',
              excludeSemantics: true,
              child: Text(protocolo, style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, letterSpacing: 8, color: EloCores.brand900)),
            ),
          ]),
        ),
        const SizedBox(height: 12),

        Cartao(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('O que levar', style: t.titleMedium),
            const SizedBox(height: 6),
            if (meus.isEmpty)
              Text('A doação combinada.', style: t.bodyLarge)
            else
              for (final i in meus)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Icon(i.obtido || i.entregue ? Icons.check_circle : Icons.inventory_2_outlined,
                        color: i.obtido || i.entregue ? EloCores.sucesso : EloCores.brand700, size: 22),
                    const SizedBox(width: 10),
                    Expanded(child: Text(i.descricao, style: t.bodyLarge)),
                    if (i.obtido || i.entregue)
                      Flexible(
                        child: Text(i.obtido ? 'Já recebido' : i.textoChegou,
                            textAlign: TextAlign.end, style: t.bodyMedium?.copyWith(color: EloCores.sucesso, fontWeight: FontWeight.w700)),
                      ),
                  ]),
                ),
            const SizedBox(height: 10),
            PessoasAjudando.doPedido(o),
          ]),
        ),
        const SizedBox(height: 12),

        Cartao(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Onde entregar', style: t.titleMedium),
            const SizedBox(height: 6),
            Text(texto('ponto_coleta') ?? 'Ponto de coleta', style: t.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
            if (texto('ponto_coleta_endereco') != null) _Linha(icone: Icons.place_outlined, texto: texto('ponto_coleta_endereco')!),
            if (texto('ponto_coleta_horario') != null) _Linha(icone: Icons.schedule, texto: texto('ponto_coleta_horario')!),
            if (texto('ponto_coleta_telefone') != null) _Linha(icone: Icons.phone_outlined, texto: texto('ponto_coleta_telefone')!),
            if (lat != null && lng != null) ...[
              const SizedBox(height: 12),
              ExcludeSemantics(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(EloRaio.md),
                  child: SizedBox(
                    height: 180,
                    child: FlutterMap(
                      options: MapOptions(
                        initialCenter: LatLng(lat, lng),
                        initialZoom: 16,
                        interactionOptions: const InteractionOptions(flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag),
                      ),
                      children: [
                        TileLayer(urlTemplate: urlTiles, userAgentPackageName: 'br.elo.elo_app'),
                        MarkerLayer(markers: [
                          Marker(point: LatLng(lat, lng), width: 40, height: 40, child: const Icon(Icons.location_on, color: EloCores.brand700, size: 40)),
                        ]),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text('© colaboradores do OpenStreetMap', style: t.bodySmall),
            ],
          ]),
        ),
        const SizedBox(height: 12),

        if (!encerrado && texto('instrucoes') != null)
          Cartao(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Como entregar', style: t.titleMedium),
              const SizedBox(height: 6),
              Text(texto('instrucoes')!, style: t.bodyLarge),
            ]),
          ),
        if (texto('desfecho_texto') != null) ...[
          const SizedBox(height: 12),
          Selo(texto('desfecho_texto')!),
        ],
      ]),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.icone, required this.texto});
  final IconData icone;
  final String texto;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icone, size: 20, color: EloCores.texto2),
          const SizedBox(width: 8),
          Expanded(child: Text(texto, style: Theme.of(context).textTheme.bodyLarge)),
        ]),
      );
}
