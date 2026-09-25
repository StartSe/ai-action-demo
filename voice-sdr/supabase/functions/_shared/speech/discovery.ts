// Falas da Sarah no propósito de descoberta (`discovery`).
//
// Primeiro contato: a Sarah se apresenta, levanta a dor e confirma o interesse.
// O que ela faz no fim depende de ter ou não ferramenta de agenda, e por isso o
// fechamento tem duas variantes.
//
// **A variante é o achado O-06 da revisão técnica.** Da F2 à F4 a Sarah liga
// sem nenhuma ferramenta de agenda: `tool-availability` e `tool-book-meeting`
// só entram na F5. O roteiro de descoberta, como o design o escreveu, propõe
// reunião e não consegue marcar, e a ligação de teste terminaria em promessa
// que o sistema não cumpre. O fechamento `sem_agenda` levanta a dor, confirma o
// interesse e pergunta por onde e quando o especialista deve procurar, sem
// oferecer nada que dependa de agenda.
//
// Quem escolhe a variante é `escolherVariante` de `../playbook/camada-um.ts`, e
// ela decide pelo conjunto de ferramentas do propósito, não pela fatia: quando
// `tool-availability` entrar na publicação, o fechamento troca sozinho. Foi o
// que a F5 fez: `sem_agenda` está aposentada desde então, e fica aqui para o
// que foi ao ar da F2 à F4 continuar recompilável (`CATALOGO_DE_VARIANTES`).
//
// O registro e a convenção de marcadores estão em `todos-os-propositos.ts`.
// Marcadores desta fala, além dos de lá:
//
// | Marcador | De onde vem |
// |---|---|
// | `{oferta}` | `agents.offer_line` |
// | `{opcao_um}`, `{opcao_dois}` | ofertas de `tool-availability` (F5) |

/** Falas de descoberta. O fechamento é o único bloco com variante. */
export const FALAS_DE_DESCOBERTA = {
  /** Vem logo depois do aviso de gravação, que é de todo propósito. */
  abertura: [
    'Fecho em dois. {oferta}',
    'E como vocês fazem isso aí no dia a dia?',
  ],

  /** Levanta a dor antes de qualquer proposta. */
  levantamentoDaDor: [
    'E isso trava vocês em quê? Tempo, custo, retrabalho?',
    'Quanto isso pesa no mês de vocês, mais ou menos?',
  ],

  fechamento: {
    /**
     * F2 a F4, aposentada na F5. Nenhuma ferramenta de agenda existia, então a Sarah não oferece
     * nem promete nada que dependa de uma. Ela pergunta o melhor canal e o
     * melhor período, e quem procura é o especialista.
     */
    sem_agenda: [
      'Pelo que você me contou, acho que vale mesmo você falar com um especialista nosso.',
      'Prefere que ele te ligue ou que ele te chame no WhatsApp?',
      'E qual período do dia costuma ser mais tranquilo pra você atender?',
      'Fechado. Passo o seu contato pra ele e ele te procura. Obrigada pelo papo, {nome_do_lead}!',
    ],

    /**
     * F5 em diante, quando `tool-availability` entra no conjunto do propósito.
     * Aqui a oferta de horário é legítima, porque existe ferramenta que a
     * cumpre.
     */
    com_agenda: [
      'Pelo que você me contou, acho que vale mesmo você falar com um especialista nosso.',
      'Tenho dois horários aqui: {opcao_um} ou {opcao_dois}. Qual fica melhor pra você?',
      'Fechado, deixei marcado. Você recebe a confirmação da reunião no seu e-mail.',
    ],
  },
} as const
