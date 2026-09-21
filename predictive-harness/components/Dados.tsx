"use client";
import { useRef, useState } from "react";
import type { Planilha } from "@/lib/types";
import { ROTULO_SEMANTICO } from "@/lib/types";
import { Icon, ErrorBox, request, fmtPct, fmtMs, fmtUsd } from "./ui";
export type PlanilhaComSugestoes = Planilha & { sugestoes: string[] };
const ICONE: Record<string, string> = { data: "calendar", moeda: "coins", quantidade: "hash", percentual: "percent", categoria: "tag", identificador: "hash", geografia: "pin", texto_livre: "text" };
export function Dados({ planilhas, ativa, jevDisponivel, onSelecionar, onAtualizar }: { planilhas: PlanilhaComSugestoes[]; ativa: PlanilhaComSugestoes | null; jevDisponivel: boolean; onSelecionar: (id: string) => void; onAtualizar: (lista: PlanilhaComSugestoes[], selecionar?: string) => void }) {
  const [busy, setBusy] = useState<"envio" | "classificar" | "remover" | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function enviar(arquivo: File) {
    setBusy("envio");
    setError("");
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const r = await request<{ planilha: PlanilhaComSugestoes }>("/api/planilhas", "POST", form);
      onAtualizar([r.planilha, ...planilhas], r.planilha.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }
  async function classificar() {
    if (!ativa) return;
    setBusy("classificar");
    setError("");
    try {
      const r = await request<{ planilha: PlanilhaComSugestoes }>(`/api/planilhas/${ativa.id}/classificar`, "POST", {});
      onAtualizar(planilhas.map((p) => (p.id === r.planilha.id ? r.planilha : p)), r.planilha.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function remover() {
    if (!ativa || !window.confirm(`Remover "${ativa.nome}" e a conversa dela?`)) return;
    setBusy("remover");
    try {
      await request(`/api/planilhas/${ativa.id}`, "DELETE");
      const resto = planilhas.filter((p) => p.id !== ativa.id);
      onAtualizar(resto, resto[0]?.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <label className="upload">
        {busy === "envio" ? <span className="spinner" /> : <Icon name="upload" size={18} />}
        {busy === "envio" ? "Lendo a planilha…" : "Enviar planilha (CSV ou JSON, até 20 MB)"}
        <input ref={input} type="file" accept=".csv,.json,.txt,.tsv,text/csv,application/json" disabled={!!busy} onChange={(e) => e.target.files?.[0] && void enviar(e.target.files[0])} />
      </label>
      <ErrorBox error={error} />
      <div className="lista-planilhas" style={{ marginTop: 12 }}>
        {planilhas.map((p) => (
          <button key={p.id} className={"planilha-item" + (ativa?.id === p.id ? " ativa" : "")} onClick={() => onSelecionar(p.id)}>
            <strong>{p.nome}</strong>
            <small>
              {p.linhas.toLocaleString("pt-BR")} linhas · {p.colunas.length} colunas
              {p.demo && <span className="chip warn">exemplo</span>}
            </small>
          </button>
        ))}
      </div>
      {ativa && (
        <>
          <div className="perfil-cabecalho">
            <div className="linha">
              {ativa.periodo && <span className="chip neutral"><Icon name="calendar" size={12} /> {ativa.periodo.inicio.slice(0, 7)} a {ativa.periodo.fim.slice(0, 7)}</span>}
              <span className={"chip " + (ativa.classificacao === "jev" ? "ok" : "neutral")}>
                {ativa.classificacao === "jev" ? "colunas classificadas pelo Jev" : ativa.classificacao === "exemplo" ? "classificação de exemplo" : "classificação local"}
              </span>
            </div>
            {ativa.harness && <small className="muted">Jev: {ativa.harness.colunas} colunas em {fmtMs(ativa.harness.latenciaMs)}, {fmtUsd(ativa.harness.custoUsd)}</small>}
            {ativa.aviso && <small className="muted">{ativa.aviso}</small>}
            <div className="perfil-acoes">
              {jevDisponivel && (
                <button className="text-button" disabled={!!busy} onClick={() => void classificar()}>
                  {busy === "classificar" ? <span className="spinner" /> : <Icon name="spark" size={14} />}
                  {ativa.classificacao === "jev" ? "Classificar de novo com o Jev" : "Classificar colunas com o Jev"}
                </button>
              )}
              {!ativa.demo && (
                <button className="text-button" style={{ color: "var(--bad)" }} disabled={!!busy} onClick={() => void remover()}>
                  <Icon name="trash" size={14} /> Remover
                </button>
              )}
            </div>
          </div>
          <div className="colunas">
            {ativa.colunas.map((c) => (
              <div className="coluna-item" key={c.nome}>
                <span className="ic"><Icon name={ICONE[c.semantico] || "text"} size={16} /></span>
                <strong title={c.nome}>{c.nome}</strong>
                <span className="conf">{c.origem === "jev" && c.confianca !== null ? fmtPct(c.confianca) : ""}</span>
                <span className="tipo">
                  {ROTULO_SEMANTICO[c.semantico]}
                  {c.distintos > 0 && c.tipo !== "numero" && <span>· {c.distintos} distintos</span>}
                  {c.nulos > 0 && <span>· {c.nulos} vazios</span>}
                  {(c.alvoPrevisao ?? 0) >= 0.6 && <span className="chip">alvo de previsão</span>}
                  {(c.dadoPessoal ?? 0) >= 0.5 && <span className="chip bad">dado pessoal</span>}
                </span>
                <span className="exemplos">{c.tipo === "numero" && c.min !== undefined ? `de ${Number(c.min).toLocaleString("pt-BR")} a ${Number(c.max).toLocaleString("pt-BR")}` : c.exemplos.join(" · ")}</span>
              </div>
            ))}
          </div>
          {ativa.qualidade.avisos.length > 0 && <div className="aviso-qualidade">{ativa.qualidade.avisos.join(" ")}</div>}
        </>
      )}
    </>
  );
}
