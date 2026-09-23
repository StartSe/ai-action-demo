// Destinos reais do cabeçalho deste app. Desde 17/09/2026 este arquivo é próprio do
// whatsapp-atendente (ver CLAUDE.md, "app independente"): não copie de/para o pdi-time.
// "Histórico" saiu do cabeçalho — os relatórios antigos são linkados de dentro de Relatórios.
export type ItemNavegacao = {
  rotulo: string;
  href: string;
  /**
   * Este item mostra quantas conversas estão esperando uma pessoa. Quem consulta e desenha o número é o
   * próprio `Topbar` (components/useEspera.ts): o aviso precisa valer em TODA tela, inclusive nas que
   * não têm conversa nenhuma na mão, e o título da aba sai do mesmo número.
   */
  avisaEspera?: boolean;
};

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Conversas", href: "/conversas", avisaEspera: true },
  { rotulo: "Assistente", href: "/assistente" },
  { rotulo: "Relatórios", href: "/relatorios" },
  { rotulo: "Configurações", href: "/setup" },
];
