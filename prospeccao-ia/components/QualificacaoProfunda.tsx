"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aviso } from "./ui";
import { ETAPAS_QUALIFICACAO, type QualificacaoProfunda as Pesquisa } from "@/lib/qualificacao-profunda-tipos";
import type { StatusLead } from "@/lib/types";

export function QualificacaoProfunda({ leadId, status, aoQualificar, aoDadosAtualizados }: { aoDadosAtualizados?: () => void; leadId: string; status: StatusLead; aoQualificar: () => Promise<void> }) {
  const aoAtualizar = useRef(aoDadosAtualizados);
  const ultimaAtualizacao = useRef("");
  useEffect(() => { aoAtualizar.current = aoDadosAtualizados; }, [aoDadosAtualizados]);
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [revisao, setRevisao] = useState(0);
  useEffect(() => {
    let ativo = true; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function consultar() {
      try {
        const r = await fetch(`/api/leads/${leadId}/qualificacao`, { signal: controller.signal });
        if (!r.ok) throw new Error("Não foi possível carregar a pesquisa complementar.");
        const dados = await r.json();
        if (ativo) {
          if (dados.qualificacao && dados.qualificacao.estado !== "executando" && ultimaAtualizacao.current !== dados.qualificacao.atualizadoEm) {
            ultimaAtualizacao.current = dados.qualificacao.atualizadoEm; aoAtualizar.current?.();
          }
          setPesquisa(dados.qualificacao); setCarregando(false); setErro(null);
          // Continua acompanhando também quando outro fluxo marca o lead como qualificado.
          timer = setTimeout(consultar, dados.qualificacao?.estado === "executando" ? 1500 : 8000);
        }
      } catch {
        if (ativo) { setCarregando(false); setErro("Não foi possível atualizar a pesquisa. Tentaremos novamente em alguns segundos."); timer = setTimeout(consultar, 5000); }
      }
    }
    void consultar();
    return () => { ativo = false; clearTimeout(timer); controller.abort(); };
  }, [leadId, status, revisao]);
  async function iniciar() {
    setIniciando(true); setErro(null);
    try {
      const r = await fetch(`/api/leads/${leadId}/qualificacao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instagram, repetir: true }) });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Não foi possível iniciar a pesquisa.");
      setPesquisa(dados.qualificacao); setRevisao(v => v + 1);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível iniciar a pesquisa."); }
    finally { setIniciando(false); }
  }
  const executando = pesquisa?.estado === "executando";
  const resultado = pesquisa?.resultado;
  const atual = ETAPAS_QUALIFICACAO.findIndex(e => e.id === pesquisa?.etapa);
  return <section className="rounded-xl border border-line bg-bg p-4 md:p-5" aria-labelledby={`qualificacao-${leadId}`}>
    <div className="flex justify-between items-start gap-4">
      <div><h2 id={`qualificacao-${leadId}`} className="font-semibold text-base">Qualificação aprofundada</h2><p className="text-sm text-muted mt-1">Perfis e publicações públicas comparados ao seu cliente ideal e ao produto.</p></div>
      {resultado?.pontuacao != null && <div className="shrink-0 text-right"><p className="text-3xl font-bold text-accent-ink">{resultado.pontuacao}<span className="text-sm font-normal text-muted">/100</span></p><p className="text-xs text-muted">Aderência sugerida</p></div>}
    </div>
    {carregando && <p role="status" className="text-sm text-muted mt-3">Carregando pesquisa…</p>}
    {executando && <div className="mt-4" aria-busy="true">
      <ol className="space-y-2">{ETAPAS_QUALIFICACAO.map((e, i) => <li key={e.id} aria-current={i === atual ? "step" : undefined} className={`flex gap-2 text-sm ${i === atual ? "font-semibold text-accent-ink" : "text-muted"}`}><span aria-hidden="true">{i < atual ? "✓" : i === atual ? "◉" : "○"}</span>{e.titulo}</li>)}</ol>
      <p role="status" className="text-xs text-muted mt-3">{ETAPAS_QUALIFICACAO[atual]?.titulo}. Você pode sair desta página; a pesquisa continua em segundo plano.</p>
    </div>}
    {resultado && <div className="mt-4">
      <p className="text-sm text-muted">{resultado.pontuacao === null ? "Ainda não há evidências suficientes para sugerir uma nota." : `${resultado.cobertura}% dos critérios ponderados foram verificados. Critérios sem evidência não somam pontos.`}</p>
      <p className="text-xs text-muted mt-1">{executando || pesquisa?.estado === "falhou" ? "Última avaliação concluída" : "Avaliação"}: {new Date(resultado.calculadoEm).toLocaleString("pt-BR")} · A nota não é uma probabilidade de compra.</p>
      <details className="mt-3"><summary className="text-sm font-semibold text-accent-ink cursor-pointer">Entender a pontuação e as evidências</summary>
        <p className="text-xs text-muted my-3">Perfil ideal: 60 pontos. Necessidade relacionada ao produto: 40 pontos. Você decide se o lead deve ser qualificado.</p>
        <ul className="space-y-3">{resultado.criterios.map((c, i) => <li key={i} className="border-t border-line pt-3 text-sm break-words"><div className="flex justify-between gap-3"><p className="font-semibold">{c.criterio}</p><span className="whitespace-nowrap text-muted">{c.resultado === "atende" ? Math.round(c.peso * 10) / 10 : 0}/{Math.round(c.peso * 10) / 10}</span></div><p className="text-xs text-muted mt-1">{c.resultado === "atende" ? "Compatível com o critério" : c.resultado === "nao_atende" ? "Contradição encontrada" : "Não verificado"}</p>{c.trecho && <blockquote className="mt-2 pl-3 border-l-2 border-line text-muted">“{c.trecho}”</blockquote>}{c.fonte && <a href={c.fonte} target="_blank" rel="noreferrer" className="btn-link text-xs mt-1 inline-block">Ver fonte da evidência ↗</a>}</li>)}</ul>
      </details>
    </div>}
    {!!pesquisa?.fontes.length && <details className="mt-3"><summary className="text-sm font-semibold text-accent-ink cursor-pointer">Fontes coletadas ({pesquisa.fontes.length})</summary><ul className="mt-2 space-y-2">{pesquisa.fontes.map(f => <li key={f.url} className="text-xs"><a href={f.url} target="_blank" rel="noreferrer" className="btn-link">{f.titulo} ↗</a><span className="text-muted block">Consultada em {new Date(f.consultadoEm).toLocaleString("pt-BR")}</span></li>)}</ul></details>}
    {!!pesquisa?.avisos.length && <details className="mt-3"><summary className="text-sm text-muted cursor-pointer">Lacunas da pesquisa ({pesquisa.avisos.length})</summary><ul className="text-xs text-muted list-disc pl-4 mt-2 space-y-2">{pesquisa.avisos.map(a => <li key={a}>{a}</li>)}</ul></details>}
    {pesquisa?.erro && <div role="alert" className="mt-3"><Aviso tom="warn">{pesquisa.erro}</Aviso><Link href="/setup" className="btn-link text-sm mt-2 inline-block">Conferir conexões</Link></div>}
    {erro && <div role="alert" className="mt-3"><Aviso tom="danger">{erro}</Aviso></div>}
    {!executando && !carregando && <>
      <details className="mt-4"><summary className="text-xs text-muted cursor-pointer">Informar Instagram confirmado (opcional)</summary><label className="text-xs block mt-2" htmlFor={`instagram-${leadId}`}>Perfil público desta pessoa</label><input id={`instagram-${leadId}`} type="url" className="input mt-1 w-full" placeholder="https://www.instagram.com/perfil/" value={instagram} onChange={e => setInstagram(e.target.value)} /><p className="text-xs text-muted mt-1">Sem esse endereço, só consultamos um Instagram vinculado no perfil do LinkedIn.</p></details>
      <div className="flex flex-wrap gap-3 mt-4">
        <button type="button" className="btn-secundario !w-auto max-sm:!w-full" disabled={iniciando} onClick={iniciar}>{iniciando ? "Iniciando pesquisa…" : pesquisa ? "Atualizar pesquisa e pontuação" : "Pesquisar e sugerir pontuação"}</button>
        {resultado?.pontuacao != null && ["novo", "pesquisado"].includes(status) && <button type="button" className="btn-primary !w-auto max-sm:!w-full" disabled={confirmando} onClick={async () => { setConfirmando(true); try { await aoQualificar(); } finally { setConfirmando(false); } }}>{confirmando ? "Confirmando…" : "Confirmar como qualificado"}</button>}
      </div>
      <p className="text-xs text-muted mt-2">A pesquisa usa as fontes conectadas e consome a cota dessas contas.</p>
    </>}
  </section>;
}
