// Destinos reais do cabeçalho deste app. Desde 17/09/2026 este arquivo é próprio do
// whatsapp-atendente (ver CLAUDE.md, "app independente"): não copie de/para o pdi-time.
// "Histórico" saiu do cabeçalho — os relatórios antigos são linkados de dentro de Relatórios.
export type ItemNavegacao = {
  rotulo: string;
  href: string;
  /** Número no acento ao lado do rótulo (conversas esperando uma pessoa); ausente ou 0 não desenha nada. */
  contador?: number;
};

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Conversas", href: "/conversas" },
  { rotulo: "Assistente", href: "/assistente" },
  { rotulo: "Relatórios", href: "/relatorios" },
  { rotulo: "Configurações", href: "/setup" },
];

/**
 * A mesma navegação com o número de conversas que precisam de atenção em "Conversas". Quem já tem esse
 * número na tela (a lista de Conversas, o painel do Início) passa o resultado ao `Topbar`; quem não tem
 * continua usando `NAVEGACAO` e o cabeçalho fica sem contador, em vez de cada tela buscar isso sozinha.
 */
export function navegacaoComContador(atencao: number): ItemNavegacao[] {
  return NAVEGACAO.map((item) => (item.href === "/conversas" ? { ...item, contador: atencao } : item));
}
