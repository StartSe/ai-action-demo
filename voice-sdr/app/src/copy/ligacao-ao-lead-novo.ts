// A ligação ao lead novo (RF-610), em /config/discagem e no fecho do tutorial.
// O banco chama isto de `speed_to_lead`; a tela fala do que acontece.

import type { MotivoDeFalhaDaDiscagem } from '@/discagem/tipos'

export const ligacaoAoLeadNovo = {
  titulo: 'Ligar para o lead novo em minutos',
  apoio: 'Para quem chega pelo formulário do site ou por integração',
  carregando: 'Lendo a ligação ao lead novo.',

  comoFunciona:
    'Com isto ligado, o lead que chega pelo endereço de entrada de leads recebe a primeira ligação no minuto seguinte. Lead importado por planilha ou cadastrado à mão não entra: esses você liga pelo discador.',
  janela:
    'A ligação respeita a janela de discagem desta tela, no fuso do lead. Lead que chega fora dela não recebe a ligação ao lead novo: ligue pelo discador quando a janela abrir.',
  custo:
    'Cada lead que chega vira uma ligação cobrada pelas suas contas de voz e de telefonia, sem ninguém clicar. Com 100 leads no mês, são até 100 ligações a mais. O teto diário de ligações e o teto de gasto desta tela continuam valendo.',
  portaoFechado:
    'Enquanto a primeira ligação de teste não terminar com a conversa transcrita, a assistente só liga para os números de teste. O lead do formulário espera até lá.',

  ligada: 'Ligada',
  desligada: 'Desligada',
  interruptor: 'Ligar para o lead novo em minutos',
  prazo: {
    rotulo: 'Prazo para a primeira ligação, em minutos',
    exemplo: 'de 1 a 1440',
    apoio:
      'Se a ligação não sair nesse prazo (fora da janela, teto do dia atingido), ela não sai mais por este caminho. Ligar horas depois dizendo que acabou de ver o pedido soa pior do que ligar pelo discador.',
    erro: 'Use um número inteiro de 1 a 1440.',
  },
  motivo: {
    rotulo: 'Motivo para ligar ou desligar',
    exemplo: 'Formulário do site no ar',
    apoio: 'Vai para a trilha de auditoria com o seu nome.',
    padraoDoTutorial: 'Ligada no fim da configuração inicial.',
  },
  salvar: 'Salvar',
  salvando: 'Salvando…',
  ligar: 'Ligar agora',
  salva: (ligada: boolean) =>
    ligada
      ? 'Ligada. O próximo lead do formulário recebe a ligação no minuto seguinte, dentro da janela.'
      : 'Desligada. O lead do formulário entra na lista e espera alguém ligar.',

  falhas: {
    'sem-permissao': 'Só quem administra a conta liga ou desliga a ligação ao lead novo.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao': 'A mudança não foi gravada. Tente de novo em alguns minutos.',
    'valor-recusado': 'O servidor recusou o valor. Confira o prazo e escreva o motivo.',
  } satisfies Record<MotivoDeFalhaDaDiscagem, string>,

  semConfiguracao: 'A conta ainda não tem a configuração de discagem.',

  tutorial: {
    titulo: 'Quer que a assistente ligue para quem preencher o formulário?',
    explicacao:
      'Opcional. Liga para o lead novo no minuto seguinte, dentro da janela de discagem. Cada lead vira uma ligação cobrada pelas suas contas de voz e de telefonia. Dá para desligar em Discagem a qualquer hora.',
    ligada: 'A ligação ao lead novo está ligada. Para desligar ou mudar o prazo, vá em Discagem.',
  },
} as const
