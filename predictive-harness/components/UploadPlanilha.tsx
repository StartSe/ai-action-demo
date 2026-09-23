"use client";
import { useRef, useState } from "react";
import type { Planilha } from "@/lib/types";
import { ErrorBox, Icon, request } from "./ui";
export function UploadPlanilha({ onImportar }: { onImportar: (p: Planilha) => Promise<void> }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState<string[]>([]);
  const [aba, setAba] = useState("");
  const [busy, setBusy] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function enviar(file: File, abaEscolhida?: string) {
    if (busy) return;
    setErro(""); setSucesso("");
    if (file.size > 20 * 1024 * 1024) { setErro("O arquivo passa de 20 MB. Envie um recorte menor."); return; }
    if (!/\.(xlsx|csv|tsv|txt|json)$/i.test(file.name)) { setErro("Escolha um arquivo XLSX ou CSV."); return; }
    setBusy(true);
    try {
      const form = new FormData(); form.set("arquivo", file);
      if (abaEscolhida) form.set("aba", abaEscolhida);
      const res = await request<{ planilha?: Planilha; abas?: string[] }>("/api/planilhas", "POST", form);
      if (res.abas) { setArquivo(file); setAbas(res.abas); setAba(res.abas[0]); }
      if (res.planilha) {
        await onImportar(res.planilha); setArquivo(null); setAbas([]);
        setSucesso(`“${res.planilha.nome}” importada. Revise o mapeamento e selecione a fonte para analisar.`);
      }
    } catch(e) { setErro((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <section className="importacao" aria-label="Importar planilha">
    <div className={"dropzone" + (arrastando ? " arrastando" : "")} onDragOver={e => { e.preventDefault(); if (!busy) setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={e => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length !== 1) setErro("Envie um arquivo por vez."); else if (!busy) void enviar(e.dataTransfer.files[0]); }}>
      <span className="upload-symbol"><Icon name="upload" size={24} /></span>
      <div><h3>{busy ? "Preparando sua planilha…" : "Traga os dados para a conversa"}</h3><p>Arraste uma planilha ou escolha no seu computador.</p><small>XLSX ou CSV · até 20 MB por arquivo · 200 mil linhas</small></div>
      <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? <><span className="spinner" /> Importando…</> : "Escolher arquivo"}</button>
      <input ref={input} hidden type="file" accept=".xlsx,.csv,.tsv,.json,.txt" aria-label="Arquivo da planilha" onChange={e => { if (e.target.files?.[0]) void enviar(e.target.files[0]); }} />
    </div>
    {arquivo && <div className="escolher-aba"><div><strong>{arquivo.name}</strong><p>Qual aba você quer importar? Você pode repetir o envio para adicionar outras abas. Usamos os valores salvos no Excel; fórmulas não são recalculadas.</p></div><label>Aba do Excel<select value={aba} onChange={e => setAba(e.target.value)} disabled={busy}>{abas.map(a => <option key={a}>{a}</option>)}</select></label><div className="acoes"><button className="secondary" disabled={busy} onClick={() => { setArquivo(null); setAbas([]); }}>Cancelar</button><button className="primary" disabled={busy || !aba} onClick={() => void enviar(arquivo, aba)}>Importar aba</button></div></div>}
    <ErrorBox error={erro} />{sucesso && <p className="success" role="status">{sucesso}</p>}
  </section>;
}
