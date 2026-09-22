"use client";
import { useEffect, useState } from "react";
import { pedidoJSON } from "@/lib/pedido-json";
import type { statusVoz, Voz } from "@/lib/voz";
import { VozIcone } from "./RadarMarca";
type Status = ReturnType<typeof statusVoz> & { vozes?: Voz[] };
export function VozConfiguracao() {
  const [status, setStatus] = useState<Status>();
  const [chave, setChave] = useState("");
  const [vozId, setVozId] = useState("");
  const [vozes, setVozes] = useState<Voz[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { let ativo = true; pedidoJSON<Status>("/api/voz").then(s => { if (ativo) { setStatus(s); setVozId(s.vozId); } }).catch(e => { if (ativo) setErro(e.message); }); return () => { ativo = false; }; }, []);
  async function acao(tipo: "salvar" | "vozes" | "verificar" | "desconectar") {
    setOcupado(true); setErro("");
    try {
      if (tipo === "vozes") { const s = await pedidoJSON<Status>("/api/voz?vozes=1"); setVozes(s.vozes || []); return; }
      const s = await pedidoJSON<Status>("/api/voz", { method: tipo === "verificar" ? "POST" : "PUT", body: JSON.stringify(tipo === "desconectar" ? { desconectar: true } : { chave, vozId }) });
      setStatus(s); setChave(""); setVozId(s.vozId);
      if (tipo === "salvar" && !s.vozId) { const lista = await pedidoJSON<Status>("/api/voz?vozes=1"); setVozes(lista.vozes || []); }
    } catch(e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
  const chaveNoServidor = status?.gerenciadaPeloServidor;
  return <section id="voz" className="card p-5 self-start"><h2 className="font-bold flex items-center gap-2"><VozIcone /> Conversa por voz</h2><p className="text-sm text-muted mt-2">Converse com a analista em tempo real, no balão do radar, com ElevenLabs.</p><form onSubmit={e => { e.preventDefault(); void acao("salvar"); }} className="space-y-4 mt-4"><label className="radar-field">Chave da ElevenLabs<input type="password" autoComplete="off" className="input" value={chave} onChange={e => setChave(e.target.value)} placeholder={status?.mascarado || "Cole sua chave"} disabled={ocupado || chaveNoServidor} /></label>{chaveNoServidor && <p className="field-help">Chave definida no servidor.</p>}{status?.conectado && <><div className="flex justify-between gap-2"><label htmlFor="voz-padrao" className="text-sm font-semibold">Voz em português</label><button type="button" className="btn-link text-sm" disabled={ocupado} onClick={() => acao("vozes")}>Carregar vozes</button></div><select id="voz-padrao" className="input" value={vozId} onChange={e => setVozId(e.target.value)}><option value="">Selecione uma voz</option>{status.vozId && !vozes.some(v => v.id === status.vozId) && <option value={status.vozId}>{status.vozNome || "Voz atual"}</option>}{vozes.map(v => <option value={v.id} key={v.id}>{v.nome}{v.brasileira ? " · Brasil" : ""}</option>)}</select></>}<button className="btn-primary !w-auto" disabled={ocupado || (!chave && !vozId)}>{ocupado ? "Aguarde…" : "Salvar conexão de voz"}</button></form>
    {status?.conectado && <div className="flex flex-wrap gap-4 mt-4"><button className="btn-link text-sm" disabled={ocupado || !status.vozId} onClick={() => acao("verificar")}>Verificar conversa por voz</button><button className="btn-link text-sm" disabled={ocupado || chaveNoServidor} onClick={() => acao("desconectar")}>Desconectar voz</button></div>}
    {status?.conversa.estado === "pronta" && <p className="text-sm text-ok mt-3" role="status">Conversa por voz pronta.</p>}{(erro || status?.conversa.mensagem) && <p role="alert" className="text-sm mt-3">{erro || status?.conversa.mensagem}</p>}<p className="field-help mt-4">A chave precisa de leitura de vozes e acesso de leitura e escrita a ElevenLabs Agents. <a className="underline" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">Obter chave ↗</a></p><p className="field-help mt-2">Ao iniciar, o áudio e o contexto deste radar são enviados à ElevenLabs. As perguntas e análises ficam na memória do radar.</p>
  </section>;
}
