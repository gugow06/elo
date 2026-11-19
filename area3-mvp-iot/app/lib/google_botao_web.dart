import 'package:google_sign_in_web/web_only.dart' as web;
import 'package:material_ui/material_ui.dart';

/// Na web, o Google só permite entrar pelo botão oficial dele (Google Identity Services).
Widget botaoGoogleOficial() => web.renderButton(
      configuration: web.GSIButtonConfiguration(
        type: web.GSIButtonType.standard,
        theme: web.GSIButtonTheme.outline,
        size: web.GSIButtonSize.large,
        text: web.GSIButtonText.continueWith,
        shape: web.GSIButtonShape.pill,
        minimumWidth: 320,
        locale: 'pt-BR',
      ),
    );
