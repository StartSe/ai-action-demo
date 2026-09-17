// Quem o vendedor encontra na sala (US-008).
//
// "Persona aleatória" no app **não** é sorteio (D8 do PRD): é distribuição. Um sorteio limpo entre 7
// personas erra feio em amostra pequena — com 30 vendedores é comum um perfil sair 9 vezes e outro
// 1, e aí a aba Personas do painel (US-024) mostra que o time "vende mal para o Cético" quando na
// verdade dois vendedores o pegaram. A escolha é sempre da persona **menos usada** até ali, e o
// acaso entra só para desempatar.
//
// Arquivo puro (sem `node:*`, sem banco): recebe a contagem pronta de quem chama — lib/sessoes.ts
// consulta o banco e passa. Assim dá para exercitar a distribuição por teste sem SQLite.
import { personasDe } from "./personas";
import type { Simulacao } from "./simulacoes";

/** Só o que a escolha precisa saber da simulação — quem chama pode passar a `Simulacao` inteira. */
export type SimulacaoDaEscolha = Pick<Simulacao, "modoPersona" | "personas">;

export type EntradaEscolha = {
  simulacao: SimulacaoDaEscolha;
  /** Quantas sessões cada persona já teve NESTA simulação (`sessoes.contarPorPersona`). */
  contagem: Record<string, number>;
  /**
   * As personas que **este** participante já pegou nesta simulação, uma entrada por sessão (pode
   * repetir). Quem volta ao mesmo link treina um perfil diferente enquanto houver algum sobrando.
   */
  jaUsadas?: string[];
  /** Injetável só para o teste conferir o desempate; em produção ninguém passa. */
  sorteio?: () => number;
};

/**
 * A persona da próxima sessão. Nunca lança e nunca devolve vazio: `personasDe` cai no catálogo
 * inteiro quando a simulação não tem lista utilizável, então sempre existe alguém para atender.
 *
 * A ordem de desempate é a ordem das perguntas do gestor, da mais forte para a mais fraca:
 *  1. **quantas vezes este participante já pegou esta persona** — variar o treino de quem repete;
 *  2. **quantas sessões esta persona já teve na simulação** — o equilíbrio que o painel precisa;
 *  3. **acaso** — para dois links abertos no mesmo segundo não caírem sempre na mesma persona.
 *
 * O critério 1 vem antes do 2 de propósito: o equilíbrio geral é do gestor, mas quem abre o link é
 * o vendedor, e repetir o mesmo cliente três vezes seguidas é o que faz ele parar de treinar. Como
 * é contagem, e não filtro, quem já passou por todas volta para a que usou menos — nunca trava.
 */
export function escolherPersona({ simulacao, contagem, jaUsadas = [], sorteio = Math.random }: EntradaEscolha): string {
  const candidatas = personasDe(simulacao.personas);

  const meus = new Map<string, number>();
  for (const id of jaUsadas) meus.set(id, (meus.get(id) ?? 0) + 1);

  let empatadas: string[] = [];
  let melhor: [number, number] | null = null;
  for (const { id } of candidatas) {
    const chave: [number, number] = [meus.get(id) ?? 0, contagem[id] ?? 0];
    if (!melhor || chave[0] < melhor[0] || (chave[0] === melhor[0] && chave[1] < melhor[1])) {
      melhor = chave;
      empatadas = [id];
    } else if (chave[0] === melhor[0] && chave[1] === melhor[1]) {
      empatadas.push(id);
    }
  }

  return empatadas[Math.floor(sorteio() * empatadas.length)] ?? candidatas[0].id;
}
