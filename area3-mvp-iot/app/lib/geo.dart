import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// Centro aproximado do Brasil: onde o mapa abre sem localização nem cidade conhecida.
const centroBrasil = LatLng(-14.235, -51.9253);

/// Tiles do mapa. Padrão: OpenStreetMap (gratuito, uso baixo, com atribuição). Para tráfego real,
/// troque por um servidor próprio ou plano gratuito com chave: --dart-define=MAP_TILES=https://.../{z}/{x}/{y}.png
const urlTiles = String.fromEnvironment('MAP_TILES', defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');

/// Distância em km entre dois pontos (fórmula de haversine).
double distanciaKm(LatLng a, LatLng b) {
  const raio = 6371.0;
  double rad(double g) => g * math.pi / 180;
  final dLat = rad(b.latitude - a.latitude);
  final dLng = rad(b.longitude - a.longitude);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(a.latitude)) * math.cos(rad(b.latitude)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * raio * math.asin(math.sqrt(h));
}

/// Direção de [de] para [para] em 8 pontos cardeais ("ao norte", "a sudeste"…).
String direcao(LatLng de, LatLng para) {
  final dy = para.latitude - de.latitude;
  final dx = (para.longitude - de.longitude) * math.cos(de.latitude * math.pi / 180);
  final graus = (math.atan2(dx, dy) * 180 / math.pi + 360) % 360;
  const nomes = ['ao norte', 'a nordeste', 'a leste', 'a sudeste', 'ao sul', 'a sudoeste', 'a oeste', 'a noroeste'];
  return nomes[((graus + 22.5) ~/ 45) % 8];
}

/// "2,4 km ao norte", "350 m a leste" ou "perto de você" (RNF-A10: distância e direção por extenso).
String distanciaPorExtenso(LatLng de, LatLng para) {
  final km = distanciaKm(de, para);
  if (km < 0.05) return 'perto de você';
  final valor = km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(km < 10 ? 1 : 0).replaceAll('.', ',')} km';
  return '$valor ${direcao(de, para)}';
}

/// Área visível do mapa no formato da API (oeste,sul,leste,norte), limitada ao Brasil.
String caixaApi({required double oeste, required double sul, required double leste, required double norte}) {
  double lng(double v) => v.clamp(-74.9, -30.1);
  double lat(double v) => v.clamp(-34.9, 5.9);
  String f(double v) => v.toStringAsFixed(5);
  return '${f(lng(oeste))},${f(lat(sul))},${f(lng(leste))},${f(lat(norte))}';
}
