# Avaliação (treino) da triagem de risco

- Classificador após as regras: `offline-palavras-chave`
- Versão do léxico: `2026-11-19.2` · limiar de confiança: 0.75
- Casos: 60

| Métrica | Valor |
| --- | --- |
| Acurácia da faixa | 100.0% |
| **Recall da faixa vermelha** (meta 100%) | **100.0%** |
| Falsos negativos de vermelha | 0 |
| Precisão da faixa vermelha | 100.0% |
| Acurácia da categoria (verde/amarela corretas) | 97.8% |
| Decididos por regra determinística | 25.0% |
| Tempo médio por triagem | 0.05 ms |

## Matriz de confusão (linha = esperado, coluna = obtido)

| | verde | amarela | vermelha |
| --- | --- | --- | --- |
| **verde** | 30 | 0 | 0 |
| **amarela** | 0 | 15 | 0 |
| **vermelha** | 0 | 0 | 15 |

## Erros

Nenhum.
