"use client";
// Painel "Métricas" do workspace: visitas do link público em 7 ou 30 dias (três destaques, barras por dia em CSS
// puro, de onde vieram) e "O que o agente sugere" (três sugestões com Aplicar → manda a instrução ao chat).
import { useEffect, useState } from "react";
import { Aviso, lerErro } from "./ui";

type Resumo = { dias: number; total: number; porDia: { dia: string; visitas: number }[]; celular: number; computador: number; origens: { origem: string; visitas: number }[]; comparadoAoPeriodoAnterior: number | null; totalAnterior: number };
type Sugestao = { titulo: string; motivo: string; instrucao: string };
type Sugestoes = { sugestoes: Sugestao[]; versao: number; demo: boolean; geradoEm: string };

function diaCurto(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

function Destaque({ valor, rotulo, tom = "neutro" }: { valor: string; rotulo: string; tom?: "ok" | "warn" | "neutro" }) {
  const cor = tom === "ok" ? "text-ok" : tom === "warn" ? "text-warn" : "text-accent-ink";
  return (
    <div className="min-w-0">
      <div className={`text-[26px] leading-none font-extrabold tracking-[-0.02em] ${cor}`}>{valor}</div>
      <div className="text-[12px] font-semibold text-muted mt-1">{rotulo}</div>
    </div>
  );
}

export function PainelMetricas({ projetoId, publicado, versaoAtual, aoAplicar, extra }: {
  projetoId: string;
  publicado: boolean;
  /** Muda a cada versão nova: as sugestões são por versão. */
  versaoAtual: number;
  aoAplicar: (instrucao: string) => void;
  /** Conteúdo adicional no rodapé do painel (ex.: "Receber este resumo toda semana", US-010). */
  extra?: React.ReactNode;
}) {
  const [dias, setDias] = useState<7 | 30>(7);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [erroSugestoes, setErroSugestoes] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [abrirSugestoes, setAbrirSugestoes] = useState(false);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projetoId}/metricas?dias=${dias}`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) { setResumo(d); setErro(null); } })
      .catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    return () => { ativo = false; };
  }, [projetoId, dias, versaoAtual]);

  async function carregarSugestoes(forcar = false) {
    setPedindo(true);
    setErroSugestoes(null);
    try {
      const r = await fetch(`/api/sites/${projetoId}/sugestoes${forcar ? "?forcar=1" : ""}`);
      if (!r.ok) { setErroSugestoes((await lerErro(r)).mensagem); return; }
      setSugestoes(await r.json());
    } catch (e) {
      setErroSugestoes((await lerErro(e)).mensagem);
    } finally {
      setPedindo(false);
    }
  }

  useEffect(() => {
    if (!abrirSugestoes) return;
    let ativo = true;
    fetch(`/api/sites/${projetoId}/sugestoes`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) setSugestoes(d); })
      .catch(async (e) => { if (ativo) setErroSugestoes((await lerErro(e)).mensagem); });
    return () => { ativo = false; };
  }, [projetoId, abrirSugestoes, versaoAtual]);

  const maximo = resumo ? Math.max(1, ...resumo.porDia.map((d) => d.visitas)) : 1;
  const pctCelular = resumo && resumo.total ? Math.round((resumo.celular / resumo.total) * 100) : 0;
  const variacao = resumo?.comparadoAoPeriodoAnterior;

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Métricas do site">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-[14px]">Métricas</h3>
        <div role="group" aria-label="Período" className="inline-flex gap-1 p-0.5 border border-line rounded-lg bg-surface">
          {([7, 30] as const).map((n) => (
            <button key={n} type="button" aria-pressed={dias === n} className={`px-2.5 py-1 rounded-md text-[12.5px] font-bold cursor-pointer ${dias === n ? "bg-accent text-white" : "text-ink hover:bg-bg"}`} onClick={() => setDias(n)}>{n} dias</button>
          ))}
        </div>
      </div>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      {!resumo && !erro && <p className="text-muted text-[13px]">Carregando...</p>}
      {resumo && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Destaque valor={String(resumo.total)} rotulo="Visitas" />
            <Destaque valor={resumo.total ? `${pctCelular}%` : "–"} rotulo="No celular" />
            <Destaque
              valor={variacao === null || variacao === undefined ? "–" : `${variacao >= 0 ? "+" : ""}${variacao}%`}
              rotulo={`Contra os ${resumo.dias} dias antes`}
              tom={variacao === null || variacao === undefined ? "neutro" : variacao >= 0 ? "ok" : "warn"}
            />
          </div>
          {resumo.total === 0 ? (
            <p className="text-muted text-[13px]">{publicado ? "Ninguém abriu o link ainda. Compartilhe o endereço do site." : "As visitas começam a contar quando o site estiver no ar."}</p>
          ) : (
            <>
              <div className="flex items-end gap-[3px] h-16" role="img" aria-label={`Visitas por dia: ${resumo.porDia.map((d) => `${diaCurto(d.dia)} ${d.visitas}`).join(", ")}`}>
                {resumo.porDia.map((d) => (
                  <div key={d.dia} className="flex-1 min-w-0 flex flex-col justify-end h-full" title={`${diaCurto(d.dia)}: ${d.visitas}`}>
                    <div className="w-full rounded-t-[3px] bg-accent" style={{ height: `${Math.max(d.visitas ? 8 : 2, Math.round((d.visitas / maximo) * 100))}%`, opacity: d.visitas ? 1 : 0.25 }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-muted"><span>{diaCurto(resumo.porDia[0].dia)}</span><span>{diaCurto(resumo.porDia[resumo.porDia.length - 1].dia)}</span></div>
              <div>
                <p className="text-[12.5px] font-semibold mb-1">De onde vieram</p>
                <ul className="text-[13px] flex flex-col gap-0.5">
                  {resumo.origens.map((o) => (
                    <li key={o.origem} className="flex justify-between gap-3"><span className="truncate">{o.origem}</span><span className="text-muted shrink-0">{o.visitas}</span></li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}

      <div className="border-t border-line pt-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-bold text-[13.5px]">O que o agente sugere</h4>
          {sugestoes && <button type="button" className="btn-link text-[12.5px]" disabled={pedindo} onClick={() => carregarSugestoes(true)}>{pedindo ? "Pensando..." : "Pedir novas sugestões"}</button>}
        </div>
        {!abrirSugestoes && !sugestoes && (
          <button type="button" className="btn-ghost !py-2 !text-[13.5px] self-start" onClick={() => setAbrirSugestoes(true)}>Ver as sugestões</button>
        )}
        {abrirSugestoes && !sugestoes && !erroSugestoes && <p className="text-muted text-[13px]">Analisando o site...</p>}
        {erroSugestoes && <Aviso tom="danger" acao={{ rotulo: "Tentar de novo", onClick: () => carregarSugestoes(true) }}>{erroSugestoes}</Aviso>}
        {sugestoes && (
          <>
            {sugestoes.demo && <p className="text-muted text-[12.5px]">Sugestões de exemplo: conecte a inteligência artificial para receber as do seu site.</p>}
            <ul className="flex flex-col gap-2">
              {sugestoes.sugestoes.map((s) => (
                <li key={s.titulo} className="rounded-[12px] border border-line bg-surface p-3 flex flex-col gap-1.5">
                  <p className="font-bold text-[13.5px]">{s.titulo}</p>
                  <p className="text-ink-2 text-[12.5px]">{s.motivo}</p>
                  <div><button type="button" className="btn-ghost !py-1.5 !px-3 !text-[12.5px]" onClick={() => aoAplicar(s.instrucao)}>Aplicar</button></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {extra}
    </section>
  );
}
