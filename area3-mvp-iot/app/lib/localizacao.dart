import 'package:geolocator/geolocator.dart';

/// Localização do aparelho, sempre com a permissão da pessoa (o sistema pergunta na primeira vez).
/// Usa o que o aparelho tiver: GPS ou rede (Wi-Fi e operadora), com precisão média, que basta
/// para achar a cidade e o bairro. Sem permissão ou sem sinal, devolve null e o app segue sem ela.
///
/// Para onde vai: no celular, abre o mapa perto da pessoa e calcula distâncias. Para a API vai só
/// quando precisa (achar a cidade e o bairro ao criar a conta; ordenar "mais perto de mim"), e a API
/// não guarda: no cadastro, o bairro novo recebe só uma posição arredondada a ~1 km.
class Localizacao {
  Localizacao._();
  static final i = Localizacao._();

  ({double latitude, double longitude})? _ultima;

  /// Última posição obtida nesta sessão do app.
  ({double latitude, double longitude})? get ultima => _ultima;

  Future<({double latitude, double longitude})?>? _emAndamento;

  /// [pedir]: mostra o pedido de permissão do sistema, se ainda não foi respondido.
  /// Telas que pedem ao mesmo tempo (Início e Mapa) recebem a mesma resposta.
  Future<({double latitude, double longitude})?> obter({required bool pedir}) {
    final f = _emAndamento ??= _obter(pedir).whenComplete(() => _emAndamento = null);
    return f;
  }

  Future<({double latitude, double longitude})?> _obter(bool pedir) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied && pedir) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 12)),
        );
      } catch (_) {
        // Sem sinal agora: a última posição conhecida do aparelho (não existe na web)
        pos = await Geolocator.getLastKnownPosition().catchError((_) => null);
      }
      if (pos == null) return null;
      return _ultima = (latitude: pos.latitude, longitude: pos.longitude);
    } catch (_) {
      return null;
    }
  }

  /// Arredonda a ~1 km (2 casas): o suficiente para ordenar por distância sem revelar a casa.
  static ({double latitude, double longitude}) aproximada(({double latitude, double longitude}) p) =>
      (latitude: (p.latitude * 100).round() / 100, longitude: (p.longitude * 100).round() / 100);
}
