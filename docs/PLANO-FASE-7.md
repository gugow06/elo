# Fase 7: ELO real (sem modo demo), mapa, locais, pedidos e perfil

Planejamento das próximas entregas do app e do painel. A partir desta fase o ELO **deixa de ser demonstração com dados fictícios**: passa a funcionar com dados e usuários reais. Complementa o [PLANO-IMPLEMENTACAO.md](PLANO-IMPLEMENTACAO.md) e respeita as regras do PRD citadas lá (P3/RS-01: endereço de cidadão nunca é público; RS-02: doação vai para ponto de coleta; RNF-A10/RF-402: o mapa sempre tem lista equivalente; D3: oferta por item).

## Andamento (19/11/2026, madrugada)

Implementado na branch `feat/fase-7` (commits locais, sem push), com testes:

| Frente | Situação |
| --- | --- |
| Perfil: seção "Verificação da conta", duas etapas por e-mail, selo "Verificado"; sai o texto "Pede e oferece ajuda no seu bairro" | ✅ Feito |
| Base geográfica real: 27 UFs e 5.571 municípios do IBGE com coordenadas, busca de localidades, busca de endereço gratuita pela API | ✅ Feito |
| Locais da rede no painel (5 tipos, busca pelo nome ou endereço, mapa para conferir, chave do sensor) | ✅ Feito |
| Lista "Todos os pedidos" com busca por estado/cidade, categoria e ordenação; ajudar pedido de outra cidade | ✅ Feito |
| Pedido com itens, várias pessoas ajudando, checklist de quem pediu | ✅ Feito |
| Mapa real (`flutter_map`), localização do aparelho, busca, lista por distância | ✅ Feito |
| Modo demonstração controlado por `MODO_DEMO`/`SEED_DEMO`; painel por e-mail; cadastro em qualquer cidade; comando do primeiro gestor; gestor convida a equipe | ✅ Feito |
| Foto de perfil (pública, F7-D5) guardada no Postgres (F7-D8); o pedido mostra quem ajuda em fotos sobrepostas com "+N" | ✅ Feito (19/11, manhã) |
| Município sem equipe do CRAS (pedido amarelo/vermelho) | ⏸️ Aguardando F7-D10 |
| LGPD (política, termos, consentimento, exclusão de conta) e publicação do app no Google | ⏸️ Precisa do texto jurídico e de domínio |
| Domínio verificado no Resend e HTTPS | ⏭️ Fora da fase de testes: sem domínio, o código só chega no e-mail dono da conta Resend |

Decisões assumidas por recomendação, para confirmar: F7-D3 (tipos de local), F7-D4 (quem pediu marca o item recebido) e F7-D11 (prioridade = aguardando há mais tempo).

## 0. Ponto de partida (como está hoje)

| Área | Hoje | Limite para produção |
| --- | --- | --- |
| Mapa (app) | Desenho em código (`CustomPaint`) com posições fixas por bairro | Não há latitude/longitude em nenhuma tabela; não existe mapa de verdade nem localização do aparelho |
| Locais | Só `ponto_coleta` (nome, endereço em texto, capacidade, estoque, chave do sensor IoT) | Sem tipo (abrigo, CRAS…), sem coordenadas; cadastro só pelo seed |
| Alcance | Usuário vê e ajuda só no próprio município (`sessao.municipioId` em todas as consultas) | Não dá para ajudar outra cidade ou estado |
| Itens do pedido | Lista fixa por categoria no app (`itensPorCategoria`), sem nada salvo | Ninguém marca o que já chegou |
| Ajudantes | Um voluntário por pedido (`oferta_unica_ativa`) | Não há "N pessoas ajudando" |
| Perfil | Nome e atalhos; sem foto, sem edição, sem verificação | Telefone é guardado mas nunca confirmado |
| Lista de pedidos | Mural do próprio município, ordenado por "meu bairro primeiro" e data; sem busca nem filtro | Não dá para procurar por estado ou cidade nem escolher a ordem |
| Modo demonstração | `MODO_DEMO` ligado por padrão: o código de acesso volta na resposta e aparece na tela; contas de demonstração na tela de entrar do app e do painel; seed fictício carregado no primeiro start; pipeline de dados gera dados sintéticos | Nada disso pode existir com usuários reais |
| Hospedagem | API no computador, APK aponta para o IP da rede local por HTTP | Usuário real precisa de endereço público com HTTPS |

## 1. Decisões para fechar antes de começar

| # | Decisão | Opções | Recomendação |
| --- | --- | --- | --- |
| F7-D1 | Provedor de mapa e de busca de endereço | ✅ **Decidido: `flutter_map`, só com serviços gratuitos** | Tiles raster do OpenStreetMap com atribuição e User-Agent do ELO (uso baixo, permitido pela política do OSM). Busca de endereço pelo Photon/Nominatim públicos, sempre pelo proxy da API (cache e no máximo 1 consulta por segundo). URL dos tiles e do geocodificador em variável de ambiente, para trocar por um servidor próprio ou plano gratuito com chave (MapTiler) quando houver tráfego real |
| F7-D2 | Base de municípios e bairros | Municípios fictícios do seed · lista real | **Lista real**: os 27 estados e 5.570 municípios da API pública do IBGE, com coordenadas. Bairro: lista cadastrada pelo gestor do município; onde não houver, o bairro vem do endereço (geocodificação reversa). Nenhum local ou pessoa fictícia em produção |
| F7-D3 | Tipos de local | Ver seção 3.1 | Lista da seção 3.1 |
| F7-D4 | Quem marca "item obtido" | Quem pediu · quem ajuda · os dois | **Quem pediu** marca "recebi"; quem ajuda marca "vou levar" e "levei". O check de quem pediu é o que conta |
| F7-D5 | Quem vê a foto de perfil | Todo mundo · só a própria pessoa e a equipe do CRAS | **Só a própria pessoa e a equipe.** O plano proíbe foto de voluntário no pedido e no mural (expõe identidade); no pedido aparece só a contagem ("4 pessoas ajudando") |
| F7-D6 | O que torna o usuário "verificado" | ✅ **Decidido: verificação em duas etapas por e-mail ativada** | E-mail confirmado + verificação em duas etapas por e-mail ativa = selo "Verificado". SMS fora. MFA por aplicativo (TOTP) e gov.br ficam como "em breve" |
| F7-D7 | Provedor de SMS | ✅ **Decidido: sem SMS** | Telefone fica só como contato, sem verificação. Nenhum provedor de SMS é contratado |
| F7-D8 | Onde guardar as fotos | Disco da API · storage compatível com S3 (MinIO local, Cloudflare R2/S3 em produção) | **S3 compatível**: MinIO no `docker-compose` para desenvolvimento, R2/S3 em produção, com a mesma interface |
| F7-D9 | Hospedagem | ✅ **Decidido: local por enquanto, código pronto para produção** | Roda no Docker Compose local. Tudo configurável por variável de ambiente (URLs, chaves, domínio), sem nenhum atalho de demonstração; HTTPS e domínio entram quando houver servidor |
| F7-D10 | Município sem equipe do CRAS no ELO | Bloquear pedidos · aceitar só pedidos verdes · aceitar tudo | Aceitar o pedido, mas: verde vai ao mural; amarelo/vermelho mostram ao cidadão o contato do CRAS/CREAS do município e o Disque 100/188, porque não há técnico para triar |
| F7-D11 | O que é "prioridade" na lista | Faixa de risco · tempo esperando | **Tempo esperando** ("aguardando há mais tempo"). A faixa de risco nunca é mostrada ao cidadão, e o mural só tem pedidos verdes |

## 2. Épico A: mapa real com localização e busca

**Objetivo:** o usuário abre o mapa centrado onde está, vê os locais da rede e os pedidos agregados por bairro, e pode buscar outra cidade ou estado para ajudar lá.

### Regras
- Pedido **nunca** aparece em ponto exato: só como contagem no centro do bairro ("3 pedidos em Vila Nova").
- Locais da rede (equipamentos públicos, pontos de coleta, abrigos) aparecem no endereço exato: são públicos.
- A localização do aparelho é usada **só no aparelho** para centralizar o mapa e calcular distância; a API não guarda (minimização, LGPD).
- Sem permissão de localização, o mapa abre no bairro do cadastro.
- A lista continua como alternativa ao mapa e é o padrão com leitor de tela (RNF-A10).

### Tarefas
| Camada | Tarefa |
| --- | --- |
| Banco | Migração: `latitude`/`longitude` em `municipio` (centro) e `bairro` (centroide); código IBGE e UF já indexados. Índice para busca por retângulo (`lat`, `lng`). PostGIS fica para quando houver polígono de bairro |
| Banco | Coordenadas reais: centro de cada município (IBGE) e centroide de cada bairro cadastrado (geocodificação) |
| API | `GET /mapa?bbox=` (público para usuário logado): locais dentro do retângulo + pedidos agregados por bairro, **de qualquer município** |
| API | `GET /geo/buscar?q=` (proxy do geocodificador): a chave fica no servidor, com cache e limite por usuário. Aceita cidade, endereço e CEP |
| API | Alcance entre municípios: leitura do mural e oferta de ajuda passam a valer para qualquer município (dados públicos, sem pessoais). Fila do técnico e painel continuam presos ao município |
| App | Trocar o `CustomPaint` por mapa real (pacote conforme F7-D1); pinos com ícone + rótulo por tipo (nunca só cor) |
| App | Localização com `geolocator`: pedido de permissão com texto explicando o uso; botão "minha localização"; fallback para o bairro |
| App | Barra de busca no topo do mapa com sugestões; ao escolher, o mapa vai para lá e recarrega o retângulo |
| App | Card flutuante do local/bairro com distância e direção por extenso (haversine, substitui o cálculo atual por `Offset`) |
| Android | Permissões `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` no manifesto; chave do mapa via `--dart-define` |

### Pronto quando
- Com permissão, o mapa abre na posição do aparelho; sem permissão, no bairro do cadastro.
- Buscar "Recife, PE" leva o mapa para lá e mostra os locais e pedidos de lá.
- Nenhuma resposta da API traz endereço ou coordenada de pedido; há teste para isso.

## 3. Épico B: cadastro de locais no painel

**Objetivo:** o gestor cadastra, edita e desativa locais da rede pelo nome do lugar ou pelo endereço.

### 3.1 Tipos de local (proposta, a partir dos tipos de conteúdo do plano)
| Tipo | Exemplos | Campos específicos |
| --- | --- | --- |
| Ponto de coleta | Escola, CRAS que recebe doação | Categorias aceitas, capacidade (kg); opcional: sensor IoT (gera a chave do dispositivo, mostrada uma vez) |
| Equipamento de assistência | CRAS, CREAS, Centro POP | Serviços oferecidos |
| Abrigo / acolhimento | Abrigo municipal, casa de passagem | Vagas, público atendido |
| Ponto de distribuição | Cozinha solidária, banco de alimentos | Dias e horários de distribuição |
| Saúde | UBS | Horário |

Campos comuns: nome, tipo, endereço, latitude/longitude, bairro, horário, telefone, ativo.

### Tarefas
| Camada | Tarefa |
| --- | --- |
| Banco | Tabela `local_rede` (todos os tipos) com coordenadas; `ponto_coleta` vira extensão 1:1 só para o que é de coleta/IoT (`local_id`). Migração copia os pontos atuais sem quebrar o simulador IoT |
| API | `GET/POST/PATCH /gestao/locais` (só gestor, no próprio município); desativar em vez de apagar; auditoria em toda alteração |
| API | Geocodificação no cadastro: busca por nome ou endereço → lista de candidatos → o gestor escolhe |
| Painel | Página **Locais**: lista com filtro por tipo e bairro; formulário com busca de endereço, mini mapa para confirmar e arrastar o pino, campos do tipo |
| Painel | Bairro sugerido automaticamente pelo ponto (centroide mais próximo), editável |

### Pronto quando
- O gestor cadastra um abrigo digitando o nome do lugar, confirma o pino e ele aparece no mapa do app.
- Técnico não cadastra; gestor de outro município não edita.

## 4. Épico C: pedido com itens, ajudantes e checklist

**Objetivo:** entrar no pedido, ver os itens, quantas pessoas estão ajudando e marcar o que já foi obtido (decisão D3: oferta por item).

### Tarefas
| Camada | Tarefa |
| --- | --- |
| Banco | Tabela `item_solicitacao` (descrição, quantidade, status: aberto · comprometido · entregue · obtido; quem marcou e quando) |
| Banco | `oferta` passa a ter itens (`oferta_item`) e deixa de ser única por pedido, exceto em categorias "inteiras" (móvel), que continuam com um ajudante |
| API | Itens sugeridos pela categoria da triagem; quem pede pode editar a lista antes de publicar e o técnico pode ajustar |
| API | "Quero ajudar com…": escolher itens; o pedido mostra `pessoas_ajudando` (contagem, sem nomes nem fotos) |
| API | Quem pediu marca "recebi" por item; quando todos estão obtidos, o pedido conclui e cada ajudante recebe "Sua ajuda chegou" |
| App | Tela do pedido em "Meus pedidos": itens com checkbox (alvo de 48), progresso ("3 de 5 itens"), "N pessoas ajudando", status e protocolo |
| App | Detalhe do mural: escolher itens para ajudar; itens já cobertos aparecem como "alguém já vai levar" |
| IoT | Entrega no ponto continua por protocolo do pedido; marca os itens do ajudante como "entregue no ponto" |

### Pronto quando
- Duas pessoas ajudam o mesmo pedido de alimento com itens diferentes, e o pedido mostra "2 pessoas ajudando".
- Quem pediu marca os itens e o pedido conclui sozinho quando todos chegam.
- Nenhuma tela mostra nome ou foto de quem ajuda.

## 5. Épico D: perfil, foto e verificação

**Objetivo:** personalizar o perfil e mostrar o caminho para um perfil verificado.

### Tarefas
| Camada | Tarefa |
| --- | --- |
| App | Remover o texto "Pede e oferece ajuda no seu bairro" |
| App | Editar perfil: nome, telefone (só contato, sem verificação), bairro |
| App | Foto: câmera ou galeria (`image_picker`), recorte quadrado e compressão no aparelho |
| API | `POST /perfil/foto`: aceita só JPEG/PNG até 5 MB, **remove metadados EXIF (inclusive GPS)**, gera 512 px, guarda no storage (F7-D8) e serve por URL assinada de curta duração |
| API | Verificação em duas etapas por e-mail: `POST /perfil/2fa/ativar` (confirma com um código enviado por e-mail) e `/desativar`; `dois_fatores_em` no usuário. Com ela ativa, todo login com Google pede também o código do e-mail; no login por e-mail o código já é o segundo passo, e a conta ganha o selo |
| App | Seção **Verificação da conta** no Perfil, como checklist: E-mail confirmado ✓ · **Verificação em duas etapas por e-mail** (ativar) · Foto de perfil · Aplicativo autenticador (**em breve**) · gov.br (**em breve**) |
| App | Selo **"Verificado"** no perfil quando a verificação em duas etapas por e-mail estiver ativa (F7-D6) |
| Painel | O técnico vê a foto e o nível de verificação na ficha (apoio à triagem de voluntários) |

### Pronto quando
- A foto aparece no perfil da própria pessoa e na ficha do técnico, e em nenhum outro lugar.
- Uma foto tirada com GPS não guarda a localização no servidor; há teste para isso.
- Ativar a verificação em duas etapas pede um código no e-mail e, depois disso, o perfil mostra "Verificado".
- Aplicativo autenticador e gov.br aparecem como "em breve" e, ao tocar, só explicam.

## 6. Épico E: lista de pedidos com busca e filtros

**Objetivo:** em "Ver todos", procurar pedidos por estado ou cidade e escolher a ordem.

### Tarefas
| Camada | Tarefa |
| --- | --- |
| API | `GET /mural` com filtros: `uf`, `municipio` (código IBGE), `bairro`, `categoria`; ordenação `recentes` · `aguardando` (há mais tempo) · `perto` (a posição vai só nessa consulta, sem ser guardada) · `quase_completo` (depois do épico C); paginação por cursor |
| API | Índices para `uf`, `municipio_id`, `criado_em` e `status` |
| App | Tela "Todos os pedidos": barra de busca com sugestões de estado e cidade (IBGE), chips de categoria e um seletor "Ordenar por" |
| App | Filtro lembrado entre aberturas; resultado vazio com sugestão ("Nenhum pedido em Natal, RN. Ver o estado todo?") |
| App | Mesmos filtros na lista que acompanha o mapa (RF-402) |

### Pronto quando
- Buscar "Bahia" lista os pedidos de todas as cidades da BA; buscar "Salvador" restringe à cidade.
- Ordenar por "Aguardando há mais tempo" põe primeiro os pedidos mais antigos ainda sem ajuda completa.
- Nenhum filtro devolve dado pessoal ou faixa de risco.

## 7. Épico F: sair do modo demonstração (dados reais)

**Objetivo:** o ELO roda com usuários e dados reais, sem nenhum atalho de demonstração.

### Tarefas
| Camada | Tarefa |
| --- | --- |
| API | `MODO_DEMO` desligado por padrão; o código de acesso **nunca** volta na resposta fora dos testes automatizados |
| API | Painel deixa o login por telefone com SMS simulado: operador entra por e-mail + código (Resend) e, depois, TOTP (MFA do plano original) |
| Banco | Seed de produção só com dados públicos reais: estados e municípios do IBGE (importador versionado). Sem pessoas, pedidos ou pontos |
| Banco | Os dados fictícios atuais viram **fixtures só de teste** (continuam garantindo os testes automatizados); `seed-se-vazio` não roda em produção |
| API | Comando para criar o primeiro gestor de um município (linha de comando, auditado); o gestor convida técnicos pelo painel |
| App | Remover "Contas de demonstração", o selo "Modo demonstração: o código é…" e o rodapé "protótipo com dados fictícios" |
| App | Cadastro com cidade real (busca IBGE) e bairro (lista do município ou vindo do endereço) |
| Painel | Remover as contas de demonstração da tela de entrar |
| Dados (área 2) | Pipeline lê as tabelas reais; o gerador de dados sintéticos fica só para teste; dashboard com estado vazio quando ainda não há dados |
| Infra | Hospedagem local (F7-D9) com configuração de produção: tudo por variável de ambiente, segredos fora do repositório, backup do banco por script. HTTPS, domínio e `usesCleartextTraffic` desligado entram quando houver servidor |
| E-mail | Domínio verificado no Resend (SPF/DKIM) e remetente do domínio |
| Google | Publicar o app OAuth (sai do modo teste e da lista de usuários de teste); cliente Android com o SHA-1 da chave de release definitiva |
| LGPD | Política de privacidade e termos de uso (o Google exige o link para publicar), consentimento no cadastro, exclusão de conta pelo app, logs sem dado pessoal |

### Pronto quando
- Nenhuma tela ou resposta da API mostra código de acesso, conta de demonstração ou dado fictício.
- Um usuário novo, de qualquer cidade do Brasil, cria conta com e-mail ou Google e recebe o código no próprio e-mail (com o Resend em domínio verificado; sem domínio, só o e-mail dono da conta Resend recebe).
- Trocar de ambiente (local → servidor) exige só mudar variáveis de ambiente, sem mexer no código.

## 8. Ordem e entregas

Cada linha é um PR.

**Antes de tudo:** marcar a `main` atual com a tag `entrega-fiap` (versão entregue em 19/11/2026, ainda com modo demonstração). A fase 7 não altera essa versão.

| Ordem | PR | Depende de | Tamanho |
| --- | --- | --- | --- |
| 1 | Perfil: tirar o texto e criar a seção "Verificação da conta" (só a interface, itens "em breve") | — | P |
| 2 | Configuração de produção local: variáveis de ambiente, perfil do Docker Compose sem atalhos de demonstração, backup do banco | F7-D9 | P |
| 3 | Base geográfica real: estados e municípios do IBGE, coordenadas, `local_rede`, `/geo/buscar` | F7-D1, F7-D2 | M |
| 4 | Sair do modo demonstração: fixtures só de teste, cadastro com cidade real, primeiro gestor por comando, painel por e-mail | 2, 3 | G |
| 5 | Painel: cadastro de locais | 3, F7-D3 | M |
| 6 | App: mapa real, localização, busca e alcance entre municípios | 3 | G |
| 7 | Lista de pedidos com busca por estado/cidade e ordenação | 3, F7-D11 | M |
| 8 | Pedido com itens, vários ajudantes e checklist | F7-D4 | G |
| 9 | Foto de perfil (storage) e verificação em duas etapas por e-mail | F7-D5, F7-D8 | M |
| 10 | LGPD (política, termos, consentimento, exclusão de conta); publicação do app OAuth no Google quando houver domínio | — | M |

P: até 1 dia · M: 2 a 3 dias · G: 4 a 5 dias.

## 9. Riscos

| Risco | Efeito | Mitigação |
| --- | --- | --- |
| Ajudar outro município muda o isolamento entre municípios | Vazamento de dado entre prefeituras | Abrir só leitura pública do mural e a oferta; fila, ficha e painel continuam presos ao município, com teste |
| Foto de perfil expõe identidade e localização | Risco LGPD | Visibilidade restrita (F7-D5), remoção de EXIF, URL assinada, exclusão junto com a conta |
| Pedido aparecer em ponto exato por erro | Fere P3/RS-01 | Pedido não tem coordenada no banco; só o bairro. Teste que varre a resposta do `/mapa` |
| Uso dos serviços gratuitos de mapa além da cota ou da política | Tiles ou busca bloqueados | Proxy com cache na API, limite de 1 busca/s, User-Agent do ELO; trocar a URL por servidor próprio ou plano gratuito com chave |
| Dados reais sem base legal e sem política de privacidade | Risco LGPD e bloqueio do Google OAuth | PR 10 antes de divulgar o app; até lá, uso restrito ao grupo |
| Município sem equipe do CRAS recebendo pedido urgente | Pedido grave sem ninguém olhando | F7-D10: orientação com contato do CRAS e Disque 100/188 |
| Mudanças da fase 7 quebrarem a versão entregue à FIAP | Avaliação usa versão diferente | Tag `entrega-fiap` antes de qualquer merge |
