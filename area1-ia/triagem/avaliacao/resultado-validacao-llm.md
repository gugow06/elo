# Avaliação (validacao) da triagem de risco

- Classificador após as regras: `llm:gemini-3.5-flash-lite`
- Versão do léxico: `2026-11-19.2` · prompt: `v2` · limiar de confiança: 0.75
- Casos: 20

| Métrica | Valor |
| --- | --- |
| Acurácia da faixa | 100.0% |
| **Recall da faixa vermelha** (meta 100%) | **100.0%** |
| Falsos negativos de vermelha | 0 |
| Precisão da faixa vermelha | 100.0% |
| Acurácia da categoria (verde/amarela corretas) | 100.0% |
| Decididos por regra determinística | 30.0% |
| Tempo médio por triagem | 639.30 ms |

## Matriz de confusão (linha = esperado, coluna = obtido)

| | verde | amarela | vermelha |
| --- | --- | --- | --- |
| **verde** | 8 | 0 | 0 |
| **amarela** | 0 | 5 | 0 |
| **vermelha** | 0 | 0 | 7 |

## Erros

Nenhum.
