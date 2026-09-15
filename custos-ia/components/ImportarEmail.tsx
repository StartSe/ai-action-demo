"use client";
// Resumo de uma importação das notas do e-mail (Gmail/Outlook, US-021/US-034), mostrado no Stage depois que POST
// /api/faturas/importar termina: quantas mensagens foram lidas, quantas viraram fatura (já gravadas,
// origem "email") e por que as outras foram ignoradas. O disparo fica em app/page.tsx (botão "Ler as
// notas do e-mail", que usa o mesmo período escolhido para o gasto).
import { Chip, Section, numero } from "@/components/ui";
import { NOME_PROVEDOR, type Fatura, type ResultadoImportacao } from "@/lib/types";

const SIMBOLO: Record<Fatura["moeda"], string> = { BRL: "R$", USD: "US$", EUR: "€" };

function Contador({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-card border border-line p-3.5 min-w-0">
      <div className="text-[26px] leading-none font-extrabold tracking-[-0.02em] text-ink">{valor}</div>
      <div className="text-[12.5px] text-muted mt-1.5">{rotulo}</div>
    </div>
  );
}

export function ResumoImportacao({ resultado, onVerGasto }: { resultado: ResultadoImportacao; onVerGasto: () => void }) {
  const r = resultado;
  const periodo = r.dias === 30 ? "últimos 30 dias" : r.dias === 90 ? "últimos 90 dias" : "último ano";
  const caixas = (r.caixas ?? []).map((c) => NOME_PROVEDOR[c]).join(" e ");
  const onde = caixas ? ` no ${caixas}` : "";

  return (
    <article className="reveal">
      <header className="mb-5">
        <h2 className="text-[22px] font-bold text-ink leading-tight">Notas lidas do e-mail</h2>
        <p className="text-muted text-sm mt-1">
          {r.lidas === 0
            ? `Nenhuma mensagem com jeito de cobrança${onde} nos ${periodo}.`
            : r.reconhecidas === 0
              ? `Nenhuma das ${r.lidas} mensagens era uma nota de ferramenta de IA.`
              : `${r.reconhecidas} ${r.reconhecidas === 1 ? "nota lançada" : "notas lançadas"} a partir dos ${periodo}${onde}. As faturas já entraram no gasto do período.`}
        </p>
        {r.truncado && <p className="text-warn text-[12.5px] mt-1">Havia mais mensagens do que dá para ler de uma vez. Clique de novo em Ler as notas do e-mail para continuar de onde parou.</p>}
      </header>

      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3 mb-5">
        <Contador valor={r.lidas} rotulo="mensagens lidas" />
        <Contador valor={r.reconhecidas} rotulo="notas reconhecidas e lançadas" />
        <Contador valor={r.ignoradas} rotulo="ignoradas" />
      </div>

      {r.faturas.length > 0 && (
        <Section titulo="Faturas lançadas">
          <ul className="flex flex-col gap-2.5">
            {r.faturas.map((f) => (
              <li key={f.id} className="rounded-card border border-line p-3.5 flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1 max-md:basis-full">
                  <div className="font-bold text-ink text-[14.5px] break-words">{f.fornecedor} <span className="text-muted font-normal">· {f.ferramenta}</span></div>
                  <div className="text-muted text-[12.5px] mt-0.5">{f.data.split("-").reverse().join("/")}</div>
                </div>
                <Chip nivel="baixa">{SIMBOLO[f.moeda]} {numero(f.valor, 2)}</Chip>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.motivos.length > 0 && (
        <Section titulo="Por que as outras foram ignoradas">
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {r.motivos.map((m) => (
              <li key={m.motivo} className="flex items-baseline gap-2">
                <span className="font-semibold text-ink shrink-0">{m.quantidade}</span>
                <span className="text-muted">{m.motivo}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-muted text-[12.5px] mb-4">O conteúdo dos e-mails não foi guardado: só fornecedor, ferramenta, valor e data de cada nota reconhecida.</p>

      <button type="button" className="btn-primary !w-auto" onClick={onVerGasto}>Ver gasto do período</button>
    </article>
  );
}
