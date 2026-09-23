"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { SessaoVoz, type EstadoVoz } from "./SessaoVoz";
import { VozIcone } from "./RadarMarca";
export function VozRadar({ resultadoId, aoPerguntar, aoFechar }: { resultadoId: string; aoPerguntar: (texto: string, signal: AbortSignal) => Promise<string>; aoFechar: () => void }) {
  const [fase, setFase] = useState<EstadoVoz>("conectando");
  const [mudo, setMudo] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [legenda, setLegenda] = useState("");
  const [erro, setErro] = useState("");
  const sessao = useRef<SessaoVoz | null>(null);
  const ferramenta = useEffectEvent(async (nome: string, params: Record<string, unknown>, signal: AbortSignal) => {
    if (nome !== "consultar_radar" || typeof params.pergunta !== "string" || !params.pergunta.trim() || params.pergunta.length > 4000) throw new Error("Reformule sua pergunta sobre o radar.");
    setCalculando(true);
    try { return await aoPerguntar(params.pergunta, signal); } finally { if (!signal.aborted) setCalculando(false); }
  });
  useEffect(() => {
    const s = new SessaoVoz({ estado: setFase, texto: (_, t) => setLegenda(t), erro: setErro, ferramenta: (nome, params, signal) => ferramenta(nome, params, signal) });
    sessao.current = s;
    const t = setTimeout(() => void s.iniciar(resultadoId), 0);
    return () => { clearTimeout(t); s.fechar(); };
  }, [resultadoId]);
  return <div className="radar-voice" aria-label="Conversa por voz"><div className={`radar-voice-orb ${fase}`} aria-hidden="true"><VozIcone /></div><h3 role="status">{fase === "conectando" ? "Conectando à analista…" : fase === "encerrada" ? "Conversa encerrada" : calculando ? "Consultando seu radar…" : mudo ? "Microfone pausado" : fase === "falando" ? "A analista está falando" : "Estou ouvindo"}</h3><p className="radar-voice-caption">{legenda || "Explore seus sinais em uma conversa natural."}</p>{erro && <p role="alert">{erro} <a className="btn-link" href="/setup#voz">Revisar conexão</a></p>}<div className="radar-voice-controls"><button className="btn-ghost" aria-pressed={mudo} disabled={fase === "conectando" || fase === "encerrada"} onClick={() => { sessao.current?.silenciar(!mudo); setMudo(!mudo); }}>{mudo ? "Ativar microfone" : "Pausar microfone"}</button><button className="btn-primary !w-auto" onClick={() => { sessao.current?.fechar(); aoFechar(); }}>{fase === "encerrada" ? "Voltar ao chat" : "Encerrar voz"}</button></div>{fase !== "encerrada" && <button className="btn-link text-xs mt-3" onClick={() => void sessao.current?.ativarSom().catch(() => setErro("Não foi possível ativar o som."))}>Ativar som</button>}<p className="field-help mt-4">As análises desta conversa ficam salvas no chat.</p></div>;
}
