-- Login social só com Google: remove vínculos Apple/Facebook (eram simulados no protótipo).
DELETE FROM conta_social WHERE provedor <> 'google';
