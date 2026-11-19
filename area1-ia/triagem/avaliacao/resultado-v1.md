# Avaliação da triagem de risco

- Classificador após as regras: `offline-palavras-chave`
- Versão do léxico: `2026-11-19.1` · limiar de confiança: 0.75
- Casos: 60

| Métrica | Valor |
| --- | --- |
| Acurácia da faixa | 95.0% |
| **Recall da faixa vermelha** (meta 100%) | **86.7%** |
| Falsos negativos de vermelha | 2 |
| Precisão da faixa vermelha | 92.9% |
| Acurácia da categoria (verde/amarela corretas) | 97.7% |
| Decididos por regra determinística | 21.7% |
| Tempo médio por triagem | 0.07 ms |

## Matriz de confusão (linha = esperado, coluna = obtido)

| | verde | amarela | vermelha |
| --- | --- | --- | --- |
| **verde** | 30 | 0 | 0 |
| **amarela** | 0 | 14 | 1 |
| **vermelha** | 2 | 0 | 13 |

## Erros

| # | Relato | Esperado | Obtido | Origem |
| --- | --- | --- | --- | --- |
| 41 | minha vó precisa de alguem pra ficar com ela enquanto eu trabalho | amarela | vermelha | fallback |
| 47 | Preciso de cesta básica mas meu companheiro não deixa eu sair de casa | vermelha | verde | offline |
| 54 | O menino do lado trabalha vendendo no farol o dia todo em vez de ir para a escola | vermelha | verde | offline |
