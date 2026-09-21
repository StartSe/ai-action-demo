// O diagnóstico do mix salvo no histórico, desenhado para a tela de link (/r/[id]) e para a folha
// de impressão (/imprimir/[id]). Server Component: só lê o registro e mostra.
import { moeda, percentual } from "@/lib/formato";
import { ROTULO_ESTADO } from "@/lib/rotulos";
import type { Estado } from "@/lib/precificacao";
import type { DiagnosticoMix } from "@/lib/types";

/** O que a rota de IA guardou como `entrada`: a foto da carteira na hora do diagnóstico. */
export type EntradaMix = { itens: { nome: string; preco: number; margem: number; estado: Estado }[] };

export function ResultadoMix({ diagnostico, entrada }: { diagnostico: DiagnosticoMix; entrada: EntradaMix }) {
  return (
    <article className="reveal">
      <p className="summary">{diagnostico.resumo}</p>

      {diagnostico.prioridades.length > 0 && (
        <section className="mb-7">
          <h2 className="section-title">O que corrigir primeiro</h2>
          <ol className="flex flex-col gap-4">
            {diagnostico.prioridades.map((p, i) => (
              <li key={i} className="card p-4">
                <strong className="text-[15px] text-ink">{p.item}</strong>
                <p className="text-[14px] text-ink-2 mt-1">{p.observacao}</p>
                <p className="text-[14px] text-accent-ink font-semibold mt-1">{p.acao}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mb-7">
        <h2 className="section-title">A carteira na hora deste diagnóstico</h2>
        <table className="ficha w-full">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Preço</th>
              <th className="text-right">Margem</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {entrada.itens.map((i) => (
              <tr key={i.nome}>
                <td>{i.nome}</td>
                <td className="text-right cifra">{moeda(i.preco)}</td>
                <td className="text-right cifra">{percentual(i.margem)}</td>
                <td>{ROTULO_ESTADO[i.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {diagnostico.ponto_forte && <p className="apoio">{diagnostico.ponto_forte}</p>}
    </article>
  );
}
