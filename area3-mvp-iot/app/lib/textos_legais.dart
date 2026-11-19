/// Termos de uso e Política de privacidade do ELO.
///
/// A versão precisa ser a mesma da API (api/src/perfil/termos.ts). Mudou o texto: mude a versão
/// nos dois lugares, e quem aceitou a versão antiga aceita de novo ao abrir o app.
library;

const termosVersao = '2026-11-19';
const termosVigencia = '19 de novembro de 2026';

typedef SecaoLegal = ({String titulo, List<String> paragrafos});

const List<SecaoLegal> politicaPrivacidade = [
  (
    titulo: 'Quem somos',
    paragrafos: [
      'O ELO é uma rede de ajuda entre vizinhos ligada ao CRAS (Centro de Referência de Assistência Social) do seu município. '
          'Pelo app, você pede ajuda, oferece ajuda e acompanha as doações, que são entregues e retiradas sempre num ponto de coleta.',
      'Esta política explica, em linguagem simples, quais dados o ELO usa, para quê, quem vê e como você controla os seus dados, '
          'conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).',
    ],
  ),
  (
    titulo: 'Quais dados usamos',
    paragrafos: [
      'Cadastro: nome, e-mail, telefone, cidade e bairro. Se você entrar com o Google, recebemos também o identificador da sua conta Google.',
      'Foto de perfil, se você quiser colocar uma.',
      'Pedidos de ajuda: o título, a categoria, os itens e o relato que você escreve. O relato pode conter informações sensíveis, como saúde e situação financeira.',
      'Ajudas: o que você se ofereceu para levar e o que chegou ao ponto de coleta.',
      'Mensagens que você troca nas conversas do app.',
      'Localização do aparelho, só se você permitir. Ela é usada na hora (para achar sua cidade e mostrar o que está perto) e vai para o ELO arredondada a cerca de 1 km. Não guardamos onde você está nem onde mora.',
      'Registros de uso: entradas na conta e ações importantes, como criar um pedido ou excluir a conta, para a segurança de todos.',
    ],
  ),
  (
    titulo: 'Para que usamos',
    paragrafos: [
      'Para criar e proteger a sua conta, organizar os pedidos e as ajudas, avisar você do que acontece e permitir as entregas e retiradas no ponto de coleta.',
      'Para que a equipe do CRAS acompanhe os pedidos que precisam do serviço público, como os de maior urgência.',
      'Os dados são tratados para executar uma política pública de assistência social (LGPD, art. 7º, III, e art. 11, II, "b") e para prestar o serviço que você pediu ao criar a conta. '
          'A foto e a localização dependem da sua permissão, e você pode retirar essa permissão quando quiser.',
      'O ELO não vende os seus dados, não usa seus dados para publicidade e não toma decisões sobre você de forma automática sem que uma pessoa da equipe possa revisar.',
    ],
  ),
  (
    titulo: 'Quem vê o quê',
    paragrafos: [
      'No mural e no mapa, as outras pessoas veem só o título do pedido, a categoria, os itens e o bairro. Nunca veem o seu nome, o seu endereço, o seu telefone nem o relato.',
      'No mapa, os pedidos aparecem agrupados por bairro, nunca na sua casa.',
      'Quem ajuda num pedido aparece com o primeiro nome e a foto. Nas conversas, cada pessoa vê só o primeiro nome e a foto da outra.',
      'O relato do pedido só é lido pela equipe técnica do CRAS do seu município.',
      'O código de retirada é só seu: não mostre a ninguém além do agente do ponto de coleta.',
    ],
  ),
  (
    titulo: 'Com quem compartilhamos',
    paragrafos: [
      'Com a equipe do CRAS e da Secretaria de Assistência Social do seu município, que usa os dados para atender os pedidos.',
      'Com serviços que fazem o ELO funcionar, e só com o necessário: o envio dos códigos por e-mail (Resend), o login com o Google (Google) e a busca de endereços e mapas (OpenStreetMap). '
          'Na busca de endereço, vai só o texto que você digita, sem os seus dados de cadastro.',
      'Com autoridades, só quando a lei obrigar.',
    ],
  ),
  (
    titulo: 'Por quanto tempo guardamos',
    paragrafos: [
      'Enquanto a sua conta existir.',
      'Quando você exclui a conta, apagamos na hora o seu nome, e-mail, telefone, foto, mensagens e notificações, e o relato dos seus pedidos. '
          'Os pedidos e as entregas continuam no histórico do serviço público, sem identificar você. '
          'Pedidos que estão com a equipe do CRAS continuam com a equipe até serem encerrados.',
      'Os registros de uso são guardados pelo prazo que a lei exige (Marco Civil da Internet, art. 15).',
    ],
  ),
  (
    titulo: 'Seus direitos',
    paragrafos: [
      'Você pode, a qualquer momento: saber quais dados temos sobre você, corrigir dados errados, retirar a permissão da foto e da localização, e excluir a sua conta.',
      'Para excluir a conta: Perfil > Excluir minha conta. Pedimos um código no seu e-mail para confirmar que é você.',
      'Para os outros pedidos, fale com a equipe do CRAS do seu município. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
    ],
  ),
  (
    titulo: 'Segurança',
    paragrafos: [
      'O ELO não usa senha: você entra com um código enviado ao seu e-mail ou com o Google, e pode ligar a verificação em duas etapas no Perfil.',
      'A conexão com o ELO é protegida, o acesso da equipe aos dados é registrado e cada pessoa da equipe vê só o que precisa para o seu trabalho.',
    ],
  ),
  (
    titulo: 'Idade mínima',
    paragrafos: [
      'A conta do ELO é para maiores de 18 anos. Crianças e adolescentes são atendidos pelo CRAS junto com a família ou o responsável.',
    ],
  ),
  (
    titulo: 'Mudanças nesta política',
    paragrafos: [
      'Se esta política mudar, avisamos no app e pedimos que você leia e aceite a nova versão antes de continuar.',
    ],
  ),
];

const List<SecaoLegal> termosUso = [
  (
    titulo: 'O que é o ELO',
    paragrafos: [
      'O ELO conecta quem precisa de ajuda a vizinhos que podem ajudar, com o apoio do CRAS do município. O uso é gratuito.',
      'Ao criar a conta, você concorda com estes Termos de uso e com a Política de privacidade.',
    ],
  ),
  (
    titulo: 'Sua conta',
    paragrafos: [
      'Você precisa ter 18 anos ou mais e usar dados verdadeiros. Cada pessoa tem uma conta só, que é pessoal: não empreste a sua conta nem compartilhe os códigos que receber por e-mail.',
    ],
  ),
  (
    titulo: 'Pedir ajuda',
    paragrafos: [
      'Descreva com honestidade o que você precisa. Pedidos com sinais de urgência vão direto para a equipe do CRAS, que entra em contato.',
      'O ELO não garante que alguém vá atender o pedido. Quando conseguir o que precisava, encerre o pedido para que as pessoas saibam.',
      'Retire as doações no ponto de coleta com o seu código de retirada.',
    ],
  ),
  (
    titulo: 'Oferecer ajuda',
    paragrafos: [
      'Leve o que você se ofereceu para levar ao ponto de coleta indicado. Se não puder mais, avise pela conversa.',
      'Doe itens em bom estado e alimentos dentro da validade e bem fechados.',
      'A ajuda é sempre gratuita: é proibido cobrar, pedir algo em troca ou vender pelo ELO.',
    ],
  ),
  (
    titulo: 'Conversas',
    paragrafos: [
      'As conversas existem para combinar a ajuda entre quem pediu e quem vai ajudar. Trate todos com respeito.',
      'Não é permitido: ofender, assediar, discriminar, ameaçar, aplicar golpes, pedir dinheiro, pedir documentos ou dados bancários, nem enviar conteúdo sexual ou violento.',
      'Para a sua segurança, não compartilhe o seu endereço nem marque encontros: a entrega e a retirada são sempre no ponto de coleta.',
      'Se alguém desrespeitar estas regras, avise a equipe do CRAS do seu município.',
    ],
  ),
  (
    titulo: 'O que pode levar à suspensão',
    paragrafos: [
      'Quem descumprir estes termos, usar dados falsos ou usar o ELO para prejudicar outras pessoas pode ter a conta suspensa ou excluída, sem prejuízo das medidas legais.',
    ],
  ),
  (
    titulo: 'Responsabilidades',
    paragrafos: [
      'O ELO organiza a rede de ajuda e os pontos de coleta, mas as doações são feitas por pessoas da comunidade. Confira o que recebeu no ponto de coleta e avise o agente se algo não estiver em bom estado.',
      'O ELO pode ficar fora do ar para manutenção ou por problemas técnicos. Em situação de emergência, procure o CRAS, o SAMU (192), a Polícia (190) ou os Bombeiros (193).',
    ],
  ),
  (
    titulo: 'Excluir a conta',
    paragrafos: [
      'Você pode excluir a sua conta quando quiser, em Perfil > Excluir minha conta. Seus pedidos no mural são encerrados, as ajudas que você ia levar são canceladas, e quem estava envolvido é avisado.',
    ],
  ),
  (
    titulo: 'Mudanças e lei aplicável',
    paragrafos: [
      'Se estes termos mudarem, avisamos no app e pedimos um novo aceite.',
      'Estes termos seguem as leis do Brasil.',
    ],
  ),
];
