# Dados geográficos

`municipios.csv` e `ufs.csv`: os 5.570 municípios e as 27 unidades da federação, com código do IBGE e coordenadas (centro do município e da UF).

Fonte: [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (licença MIT, © Kelvin S. do Prado), que compila dados públicos do IBGE. Mantidas só as colunas usadas pelo ELO.

Importação: `pnpm db:ibge` (também roda ao subir a API e no seed). É idempotente: atualiza pelo código do IBGE.
