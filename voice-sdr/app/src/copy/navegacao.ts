export type ItemDeNavegacao = {
  rotulo: string
  caminho: string
  /**
   * A tela existe. Falso é item anunciado e ainda não construído: ele aparece
   * apagado, sem link, dizendo "em breve".
   *
   * Some do menu não é opção aqui: o conjunto de rotas da seção 7 do
   * PRD-implementacao é o mapa do produto, e escondê-lo faria cada tela nova
   * parecer uma surpresa. Mas link que não leva a lugar nenhum é pior do que
   * texto apagado, e por isso o item só vira elo quando a rota existe.
   *
   * `testes/estatica/navegacao-e-rotas.test.ts` cobra os dois lados: item
   * marcado como disponível precisa ter rota, e rota registrada precisa estar
   * marcada como disponível.
   */
  disponivel: boolean
}

export type Trilha = {
  sigla: string
  itens: readonly ItemDeNavegacao[]
}

/** Os caminhos vêm do conjunto canônico em docs/PRD-implementacao.md seção 7. */
export const navegacao: { trilhas: readonly Trilha[] } = {
  trilhas: [
    {
      sigla: 'OPERAÇÃO',
      itens: [
        { rotulo: 'Painel', caminho: '/', disponivel: true },
        { rotulo: 'Precisam de você', caminho: '/fila', disponivel: true },
        { rotulo: 'Funil', caminho: '/funil', disponivel: true },
        { rotulo: 'Leads', caminho: '/leads', disponivel: true },
        { rotulo: 'Chamadas', caminho: '/chamadas', disponivel: true },
        { rotulo: 'Conversas', caminho: '/conversas', disponivel: true },
        { rotulo: 'Reuniões', caminho: '/reunioes', disponivel: true },
      ],
    },
    {
      sigla: 'MÁQUINA',
      itens: [
        { rotulo: 'Identidade', caminho: '/sarah/identidade', disponivel: true },
        { rotulo: 'Voz', caminho: '/sarah/voz', disponivel: true },
        { rotulo: 'Playbooks', caminho: '/sarah/playbooks', disponivel: true },
        { rotulo: 'Base de conhecimento', caminho: '/sarah/conhecimento', disponivel: true },
        { rotulo: 'Ensaio', caminho: '/sarah/ensaio', disponivel: true },
        { rotulo: 'Campanhas', caminho: '/campanhas', disponivel: false },
        { rotulo: 'Cadências', caminho: '/cadencias', disponivel: false },
        { rotulo: 'Números', caminho: '/numeros', disponivel: true },
        { rotulo: 'Especialistas', caminho: '/especialistas', disponivel: true },
      ],
    },
    {
      sigla: 'ADMINISTRAÇÃO',
      itens: [
        { rotulo: 'Conta', caminho: '/config/conta', disponivel: true },
        { rotulo: 'Integrações', caminho: '/config/integracoes', disponivel: true },
        { rotulo: 'Discagem', caminho: '/config/discagem', disponivel: true },
        { rotulo: 'Bloqueios', caminho: '/config/bloqueios', disponivel: true },
        { rotulo: 'Privacidade', caminho: '/config/privacidade', disponivel: true },
        { rotulo: 'Equipe', caminho: '/config/equipe', disponivel: true },
        { rotulo: 'Webhooks', caminho: '/config/webhooks', disponivel: false },
        { rotulo: 'Auditoria', caminho: '/config/auditoria', disponivel: true },
      ],
    },
  ],
}

/** Os textos da barra lateral que não são itens da trilha. */
export const barraLateral = {
  rotulo: 'Navegação principal',
  /** A marca do item anunciado e ainda não construído. */
  emBreve: 'em breve',
  /** O que o leitor de tela ouve depois do rótulo do item com contagem. */
  esperando: (quantidade: number): string =>
    quantidade === 1 ? '1 item esperando' : `${quantidade} itens esperando`,
} as const

/** O caminho do item que mostra a contagem da fila. */
export const CAMINHO_DA_FILA = '/fila'
