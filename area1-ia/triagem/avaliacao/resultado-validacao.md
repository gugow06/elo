# Avaliação (validacao) da triagem de risco

- Classificador após as regras: `offline-palavras-chave`
- Versão do léxico: `2026-11-19.2` · limiar de confiança: 0.75
- Casos: 20

| Métrica | Valor |
| --- | --- |
| Acurácia da faixa | 90.0% |
| **Recall da faixa vermelha** (meta 100%) | **100.0%** |
| Falsos negativos de vermelha | 0 |
| Precisão da faixa vermelha | 87.5% |
| Acurácia da categoria (verde/amarela corretas) | 100.0% |
| Decididos por regra determinística | 30.0% |
| Tempo médio por triagem | 0.15 ms |

## Matriz de confusão (linha = esperado, coluna = obtido)

| | verde | amarela | vermelha |
| --- | --- | --- | --- |
| **verde** | 7 | 0 | 1 |
| **amarela** | 1 | 4 | 0 |
| **vermelha** | 0 | 0 | 7 |

## Erros

| # | Relato | Esperado | Obtido | Origem |
| --- | --- | --- | --- | --- |
| 101 | Boa tarde, minha despensa está vazia e o salário só sai dia 10 | verde | vermelha | fallback |
| 109 | Meu pai tem 81 anos, mora sozinho e precisa de alguém para ir ao mercado com ele | amarela | verde | offline |
