import { Chip } from "@/components/ui";
import { AvatarPessoa } from "@/components/AvatarPessoa";
import { NOMES_FONTES } from "@/components/ProgressoProspeccao";
import { ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import type { CandidatoParcial } from "@/lib/pesquisa-parciais";
import type { Conta, LeadProspeccao } from "@/lib/types";

export function ResultadosParciais({ candidatos, leads, contas, executando }: {
  candidatos: CandidatoParcial[]; leads: LeadProspeccao[]; contas: Conta[]; executando: boolean;
}) {
  const pessoas = [
    ...leads.map(l => ({ chave: l.id, nome: l.nome, cargo: l.cargo, empresa: l.empresa, url: l.linkedin, avatarUrl: l.avatarUrl, fontes: [] as string[], estado: ROTULO_STATUS_LEAD[l.status] })),
    ...candidatos.map(c => ({ ...c, chave: c.url, estado: executando
      ? ({ encontrado: "Aguardando conferência", verificando: "Conferindo perfil", analisando: "Analisando critérios" })[c.fase]
      : "Conferência não concluída" })),
  ];
  if (!pessoas.length && !contas.length) return null;
  return <section className="card p-5 mb-5" aria-labelledby="titulo-resultados-parciais">
    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
      <h2 id="titulo-resultados-parciais" className="text-lg font-bold">Resultados parciais</h2>
      <p className="text-xs text-muted" role="status">{[
        pessoas.length ? `${pessoas.length} ${pessoas.length === 1 ? "pessoa" : "pessoas"}` : null,
        contas.length ? `${contas.length} ${contas.length === 1 ? "empresa" : "empresas"}` : null,
      ].filter(Boolean).join(" · ")}</p>
    </div>
    <p className="text-sm text-muted mb-4">{executando
      ? "Os resultados aparecem conforme chegam. Cargo, empresa e aderência continuam sendo conferidos; a lista final pode mudar."
      : "Estes são os resultados preservados da pesquisa. Os candidatos com conferência pendente ainda não foram qualificados."}</p>
    {pessoas.length > 0 && <ul className="divide-y divide-line max-h-[420px] overflow-y-auto" aria-label="Pessoas encontradas até agora">
      {pessoas.map(p => <li key={p.chave} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 max-sm:flex-col">
        <div className="flex items-start gap-3 min-w-0">
          <AvatarPessoa nome={p.nome} url={p.avatarUrl} />
          <div className="min-w-0">
            <p className="font-semibold text-sm break-words">{p.nome}</p>
            <p className="text-sm text-muted break-words mt-1">{[p.cargo, p.empresa].filter(Boolean).join(" · ") || "Cargo e empresa ainda não identificados"}</p>
            {!!p.fontes.length && <p className="text-xs text-muted mt-1">{p.fontes.map(f => NOMES_FONTES[f] ?? f).join(" · ")}</p>}
            {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-ink hover:underline inline-block mt-2">Ver perfil</a>}
          </div>
        </div>
        <Chip nivel="neutral">{p.estado}</Chip>
      </li>)}
    </ul>}
    {!!contas.length && <div className={pessoas.length ? "mt-4 pt-4 border-t border-line" : ""}>
      <h3 className="text-sm font-semibold mb-2">Empresas encontradas</h3>
      <ul className="space-y-2 text-sm text-muted">{contas.map(c => <li key={c.id} className="break-words">{c.nome}{c.cidade ? ` · ${c.cidade}` : ""}</li>)}</ul>
    </div>}
  </section>;
}
