"use client";
import Link from "next/link";
import { AvatarPessoa } from "./AvatarPessoa";
import { Chip, data, type Coluna } from "./ui";
import { sinalAntigo, sinalMaisRecente } from "@/lib/qualificacao";
import { ROTULO_FIT, ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import { nomeCurto, type LeadDaLista } from "@/lib/leads-lista";

export function LeadsTabela({ leads, selecionados, alternar }: { leads: LeadDaLista[]; selecionados: Set<string>; alternar: (id: string) => void }) {
  const colunas: Coluna<LeadDaLista>[] = [
    { chave: "nome", titulo: "Pessoa e empresa", papel: "titulo", largura: "32%", render: l => <div className="flex gap-3 items-start min-w-0">
      <input type="checkbox" className="w-4 h-4 mt-3 shrink-0 accent-accent" checked={selecionados.has(l.id)} onChange={() => alternar(l.id)} aria-label={`Selecionar ${l.nome}`} />
      <AvatarPessoa nome={l.nome} url={l.avatarUrl} />
      <div className="min-w-0"><Link href={`/leads/${l.id}`} className="font-semibold text-accent-ink hover:underline break-words">{l.nome}</Link>
        <p className="text-xs text-ink mt-1 line-clamp-2 break-words" title={[l.cargo, l.empresa].filter(Boolean).join(" · ")}>{[l.cargo, l.empresa].filter(Boolean).join(" · ") || "Cargo e empresa a confirmar"}</p>
        {l.cidade && <p className="text-xs text-muted mt-1 line-clamp-1">{l.cidade}</p>}
        {(l.demo || l.noCRM) && <div className="flex gap-1 mt-1">{l.demo && <Chip nivel="neutral">Exemplo</Chip>}{l.noCRM && <Chip nivel="positivo">No CRM</Chip>}</div>}
      </div></div> },
    { chave: "fit", titulo: "Aderência e sinais", papel: "chip", largura: "18%", render: l => { const sinal = sinalMaisRecente(l.sinais); return <div className="space-y-2">
      {l.fit ? <Chip nivel={l.fit === "alta" ? "positivo" : l.fit === "media" ? "media" : "neutral"}>{ROTULO_FIT[l.fit]}</Chip> : <span className="text-xs text-muted">A avaliar</span>}
      <p className="text-xs text-muted line-clamp-2" title={sinal?.descricao}>{sinal ? `${sinalAntigo(sinal) ? "Sinal antigo · " : ""}${sinal.descricao}` : "Sem sinal identificado"}</p>
    </div>; } },
    { chave: "prospeccao", titulo: "Prospecção", largura: "21%", render: l => <Link href={`/prospeccoes/${l.prospeccaoId}`} title={l.prospeccaoNome} className="text-xs text-muted hover:text-accent-ink hover:underline line-clamp-2 break-words max-w-[230px]">{nomeCurto(l.prospeccaoNome)}</Link> },
    { chave: "status", titulo: "Etapa", largura: "14%", render: l => <div className="space-y-2"><Chip nivel="neutral">{ROTULO_STATUS_LEAD[l.status]}</Chip>
      {l.pesquisadoEm && <p className="text-[11px] text-muted" title={`Dados conferidos em ${new Date(l.pesquisadoEm).toLocaleString("pt-BR")}`}>Dados de {data(l.pesquisadoEm)}</p>}</div> },
    { chave: "abordagem", titulo: "Próximo passo", largura: "15%", render: l => <div className="flex flex-col items-start gap-2">
      <Link href={`/leads/${l.id}/abordagem`} className="btn-link text-xs whitespace-nowrap">{l.temAbordagem ? "Ver abordagem" : "Criar abordagem"}</Link>
      <Link href={`/leads/${l.id}`} className="text-xs text-muted hover:underline">Abrir ficha</Link>
    </div> },
  ];
  return <>
    <table className="max-md:hidden w-full table-fixed border-collapse text-sm card shadow-none overflow-hidden">
      <thead><tr>{colunas.map(c => <th key={c.chave} style={{ width: c.largura }} className="text-left px-4 py-3 border-b border-line font-semibold text-xs text-muted bg-bg">{c.titulo}</th>)}</tr></thead>
      <tbody>{leads.map(l => <tr key={l.id} className="[&:last-child>td]:border-b-0 hover:bg-bg/50">{colunas.map(c => <td key={c.chave} className="px-4 py-3 border-b border-line align-top">{c.render(l)}</td>)}</tr>)}</tbody>
    </table>
    <ul className="md:hidden space-y-3" aria-label="Lista de leads">{leads.map(l => <li key={l.id} className="card shadow-none p-4 space-y-4">
      {colunas[0].render(l)}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">{colunas[1].render(l)}{colunas[3].render(l)}</div>
      <div><p className="text-[11px] font-semibold text-muted mb-1">Prospecção</p>{colunas[2].render(l)}</div>
      <div className="flex gap-4 items-center border-t border-line pt-3"><Link href={`/leads/${l.id}/abordagem`} className="btn-link text-sm">{l.temAbordagem ? "Ver abordagem" : "Criar abordagem"}</Link><Link href={`/leads/${l.id}`} className="text-sm text-muted hover:underline">Abrir ficha</Link></div>
    </li>)}</ul>
  </>;
}
