import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';

/// ELO Design System: tokens do mockup (ver docs/PLANO-IMPLEMENTACAO.md, seção 3).
/// Pares texto/fundo escolhidos para contraste mínimo de 4,5:1.
abstract final class EloCores {
  static const brand900 = Color(0xFF003B2E); // logo, títulos, botão primário
  static const brand700 = Color(0xFF006B52); // links e texto verde
  static const brand600 = Color(0xFF078D6C); // ícones e preenchimentos
  static const brand100 = Color(0xFFDFF3EA);
  static const accent500 = Color(0xFFFFB000); // tag de categoria (texto escuro em cima)

  static const fundo = Color(0xFFF6F8F5);
  static const superficie = Colors.white;
  static const borda = Color(0xFFE3E8E4);
  static const texto = Color(0xFF14231D);
  static const texto2 = Color(0xFF4A5A53);

  // Tipos de conteúdo: cor + ícone, nunca só cor
  static const pedido = Color(0xFF078D6C);
  static const pedidoClaro = Color(0xFFDFF3EA);
  static const voluntario = Color(0xFF1D5FBF);
  static const voluntarioClaro = Color(0xFFE3EEFC);
  static const servico = Color(0xFF6B3FB5);
  static const servicoClaro = Color(0xFFEFE7FB);
  static const oportunidade = Color(0xFFB4560A);
  static const oportunidadeClaro = Color(0xFFFDEBD6);

  static const sucesso = Color(0xFF0F6B3D);
  static const sucessoClaro = Color(0xFFDDF3E6);
  static const erro = Color(0xFFA3171C);
}

abstract final class EloRaio {
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
}

/// [fontesGoogle] = false nos testes (sem rede).
ThemeData temaElo({bool fontesGoogle = true}) {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: EloCores.brand900,
      primary: EloCores.brand900,
      secondary: EloCores.brand600,
      surface: EloCores.superficie,
      error: EloCores.erro,
    ),
    scaffoldBackgroundColor: EloCores.fundo,
    splashFactory: InkSparkle.splashFactory,
  );
  final texto = (fontesGoogle ? GoogleFonts.nunitoSansTextTheme(base.textTheme) : base.textTheme).apply(bodyColor: EloCores.texto, displayColor: EloCores.brand900);
  return base.copyWith(
    textTheme: texto.copyWith(
      headlineMedium: texto.headlineMedium?.copyWith(fontWeight: FontWeight.w800, fontSize: 26),
      titleLarge: texto.titleLarge?.copyWith(fontWeight: FontWeight.w800, fontSize: 22),
      titleMedium: texto.titleMedium?.copyWith(fontWeight: FontWeight.w800, fontSize: 18),
      bodyLarge: texto.bodyLarge?.copyWith(fontSize: 16, height: 1.5),
      bodyMedium: texto.bodyMedium?.copyWith(fontSize: 15, height: 1.45, color: EloCores.texto2),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: EloCores.fundo,
      foregroundColor: EloCores.brand900,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: EloCores.brand900,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52), // alvo de toque >= 48
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: EloCores.brand900,
        minimumSize: const Size.fromHeight(52),
        side: const BorderSide(color: EloCores.borda, width: 2),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: EloCores.superficie,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(EloRaio.md), borderSide: const BorderSide(color: EloCores.borda, width: 2)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(EloRaio.md), borderSide: const BorderSide(color: EloCores.borda, width: 2)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(EloRaio.md), borderSide: const BorderSide(color: EloCores.brand700, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: const StadiumBorder(),
      side: BorderSide.none,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700, color: EloCores.brand900),
      selectedColor: EloCores.brand100,
      checkmarkColor: EloCores.brand700,
    ),
    // Transição entre telas: a nova desliza e a anterior esmaece (Android, web e desktop);
    // no iOS, fica a padrão do sistema
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
    }),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: EloCores.brand700,
        minimumSize: const Size(48, 48),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: EloCores.brand900,
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(EloRaio.md)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: EloCores.superficie,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: EloCores.borda,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(EloRaio.xl))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: EloCores.superficie,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(EloRaio.xl)),
      titleTextStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: EloCores.brand900),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: EloCores.brand900,
      unselectedLabelColor: EloCores.texto2,
      indicatorColor: EloCores.brand600,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: EloCores.borda,
    ),
    checkboxTheme: CheckboxThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      side: const BorderSide(color: EloCores.texto2, width: 2),
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? EloCores.brand600 : Colors.transparent),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: EloCores.brand600, linearTrackColor: EloCores.brand100),
    dividerTheme: const DividerThemeData(color: EloCores.borda, thickness: 1, space: 24),
    listTileTheme: const ListTileThemeData(iconColor: EloCores.brand700, titleTextStyle: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: EloCores.texto)),
    badgeTheme: const BadgeThemeData(backgroundColor: EloCores.erro, textStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
    textSelectionTheme: const TextSelectionThemeData(cursorColor: EloCores.brand700, selectionColor: EloCores.brand100, selectionHandleColor: EloCores.brand600),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: EloCores.superficie,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shadowColor: const Color(0x33003B2E),
      height: 74,
      indicatorColor: EloCores.brand100,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(size: 26, color: s.contains(WidgetState.selected) ? EloCores.brand700 : EloCores.texto2),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: s.contains(WidgetState.selected) ? EloCores.brand700 : EloCores.texto2),
      ),
    ),
  );
}
