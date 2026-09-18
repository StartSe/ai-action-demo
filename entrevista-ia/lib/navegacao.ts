// Destinos do cabeçalho DESTE app. Ao contrário dos outros da suíte, este arquivo não é mais uma cópia
// literal do pdi-time: a Entrevistadora IA é um app independente (`"independente": true` em
// catalogo.json, US-001), dona da própria camada visual e de navegação. Ver CLAUDE.md.
//
// Seis destinos, na ordem de quem recruta: abro a vaga, cadastro o candidato, acompanho a entrevista e
// vejo se o processo está andando. "Histórico" saiu daqui e passou a ser linkado só de Relatórios
// ("Relatórios anteriores") — é uma lista de arquivos gerados, não um lugar de trabalho.
export type ItemNavegacao = { rotulo: string; href: string };

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Vagas", href: "/vagas" },
  { rotulo: "Candidatos", href: "/candidatos" },
  { rotulo: "Entrevistas", href: "/entrevistas" },
  { rotulo: "Relatórios", href: "/relatorios" },
  { rotulo: "Configurações", href: "/setup" },
];
