"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, ParticipantKind, type RemoteParticipant } from "livekit-client";
import type { Troca } from "@/lib/types";

export function SalaLiveKit({ codigo, tentativaAtual = 1, cargo, onFinalizar, onTexto }: { codigo: string; tentativaAtual?: number; cargo: string; onFinalizar: (falas: Troca[]) => Promise<void>; onTexto: () => void }) {
  const sala = useRef<Room | null>(null);
  const falas = useRef<Troca[]>([]);
  const finalizar = useRef(onFinalizar);
  useEffect(() => { finalizar.current = onFinalizar; }, [onFinalizar]);
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState("Conectando sua entrevista");
  const [erro, setErro] = useState("");
  const [conectado, setConectado] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [microfoneOcupado, setMicrofoneOcupado] = useState(false);
  const [fala, setFala] = useState("");
  const [legenda, setLegenda] = useState("");
  const [historico, setHistorico] = useState<Troca[]>([]);
  const [progresso, setProgresso] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [precisaAudio, setPrecisaAudio] = useState(false);

  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();
    const room = new Room({ adaptiveStream: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    sala.current = room;
    const audios = new Set<HTMLMediaElement>();
    const prazo = setTimeout(() => { if (ativo) { setErro("A conexão está demorando. Reconecte ou continue por texto; as respostas já enviadas estão salvas."); void room.disconnect(); } }, 30000);
    function agente(participant?: RemoteParticipant) {
      if (!ativo || participant?.kind !== ParticipantKind.AGENT) return;
      const status = participant.attributes["lk.agent.state"];
      if (status && status !== "initializing") { clearTimeout(prazo); setConectado(true); setErro(""); }
      setEstado(status === "speaking" ? "A entrevistadora está falando" : status === "thinking" ? "Preparando a próxima pergunta" : status === "listening" ? "Pode falar. Estou ouvindo" : "Preparando o áudio");
    }
    room.on(RoomEvent.ParticipantConnected, agente);
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (ativo && participant.kind === ParticipantKind.AGENT) {
        setConectado(false); setErro("A entrevistadora perdeu a conexão. Reconecte para continuar com suas respostas salvas.");
      }
    });
    room.on(RoomEvent.ParticipantAttributesChanged, (_attrs, participant) => { if (participant instanceof Object && participant.isLocal === false) agente(participant as RemoteParticipant); });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) { const audio = track.attach(); audios.add(audio); audio.hidden = true; document.body.appendChild(audio); audio.autoplay = true; void audio.play().catch(() => { if (ativo) setPrecisaAudio(true); }); }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((audio) => { audios.delete(audio); audio.remove(); }); });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (ativo) setPrecisaAudio(!room.canPlaybackAudio); });
    room.on(RoomEvent.Reconnecting, () => { if (ativo) { setEstado("Reconectando sem perder suas respostas"); setConectado(false); } });
    room.on(RoomEvent.Reconnected, () => { if (ativo) { room.remoteParticipants.forEach(agente); } });
    room.on(RoomEvent.Disconnected, () => { if (ativo) { clearTimeout(prazo); setConectado(false); setErro("A conexão foi interrompida. Reconecte para continuar de onde parou."); } });
    room.on(RoomEvent.DataReceived, (data, participant, _kind, topic) => {
      if (!ativo || topic !== "entrevista" || participant?.kind !== ParticipantKind.AGENT) return;
      try {
        const evento = JSON.parse(new TextDecoder().decode(data));
        if (evento.tipo === "turno" && Array.isArray(evento.transcricao)) {
          falas.current = evento.transcricao; setHistorico(evento.transcricao); setFala(evento.pergunta); setLegenda(""); setProgresso(`Pergunta ${evento.indice} de ${evento.total}`);
        } else if (evento.tipo === "concluida") { void finalizar.current(falas.current); }
        else if (evento.tipo === "erro") { setErro(evento.mensagem); setConectado(false); }
      } catch { /* Pacote incompleto não altera a conversa salva. */ }
    });
    room.registerTextStreamHandler("lk.transcription", async (reader, participant) => {
      const text = await reader.readAll();
      if (ativo && participant.identity === room.localParticipant.identity) setLegenda(text);
    });
    async function conectar() {
      try {
        const response = await fetch(`/api/entrevista/candidato/${codigo}/livekit`, { method: "POST", headers: { "X-Entrevista-Tentativa": String(tentativaAtual) }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível conectar a voz.");
        if (!ativo) return;
        await room.connect(body.url, body.token, { peerConnectionTimeout: 15000, websocketTimeout: 10000 });
        if (!ativo) { await room.disconnect(); return; }
        await room.startAudio().catch(() => { if (ativo) setPrecisaAudio(true); });
        await room.localParticipant.setMicrophoneEnabled(true);
        if (ativo) { setMudo(false); room.remoteParticipants.forEach(agente); }
      } catch (e) { if (ativo) { clearTimeout(prazo); setErro(e instanceof Error ? e.message : "Não foi possível conectar."); setConectado(false); void room.disconnect(); } }
    }
    void conectar();
    return () => { ativo = false; controller.abort(); clearTimeout(prazo); void room.disconnect(); audios.forEach((audio) => { audio.pause(); audio.remove(); }); if (sala.current === room) sala.current = null; };
  }, [codigo, tentativa, tentativaAtual]);

  async function alternarMicrofone() {
    setMicrofoneOcupado(true);
    try { await sala.current?.localParticipant.setMicrophoneEnabled(mudo); setMudo(!mudo); }
    catch { setErro("Não conseguimos acessar o microfone. Confira a permissão ou continue por texto."); }
    finally { setMicrofoneOcupado(false); }
  }
  async function enviarTexto() {
    if (!texto.trim() || !sala.current || enviando) return;
    setEnviando(true);
    try { await sala.current.localParticipant.sendText(texto.trim(), { topic: "lk.chat" }); setTexto(""); }
    catch { setErro("Não foi possível enviar. Seu texto continua aqui para tentar de novo."); }
    finally { setEnviando(false); }
  }
  return <section className="card !p-0 overflow-hidden" aria-label="Conversa com a entrevistadora">
    <header className="px-6 pt-6 flex justify-between gap-4 items-start"><div><h1 className="font-bold text-lg">Sua entrevista</h1><p className="text-sm text-muted">{cargo}</p></div><span className="text-xs text-muted">{progresso}</span></header>
    <div className="px-6 py-8 text-center">
      <div aria-hidden="true" className={`mx-auto size-28 rounded-full bg-gradient-to-br from-violet-300 via-purple-600 to-indigo-900 shadow-[0_0_55px_12px_rgba(139,92,246,0.25)] ${conectado && !mudo ? "motion-safe:animate-pulse" : ""}`} />
      <p role="status" className="font-semibold mt-7">{erro ? "Vamos retomar sua conversa" : estado}</p>
      <p className="text-sm text-muted mt-2">{mudo ? "Microfone pausado" : "Converse no seu ritmo. Você pode interromper a entrevistadora."}</p>
      {precisaAudio && <button className="btn-ghost mt-3" onClick={() => void sala.current?.startAudio().then(() => setPrecisaAudio(false))}>Ativar áudio</button>}
    </div>
    <div className="px-6 pb-6">
      {erro && <div role="alert" className="rounded-xl bg-amber-50 text-amber-950 p-4 mb-5"><p>{erro}</p><div className="flex gap-3 flex-wrap mt-3"><button className="btn-ghost" onClick={() => { setErro(""); setEstado("Reconectando sua entrevista"); setTentativa((n) => n + 1); }}>Reconectar</button><button className="btn-ghost" onClick={() => { void sala.current?.disconnect().then(onTexto); }}>Continuar por texto</button></div></div>}
      {fala && <div className="rounded-2xl bg-accent-soft p-5"><p className="text-xs text-accent font-semibold mb-2">Entrevistadora</p><p className="leading-relaxed">{fala}</p></div>}
      {legenda && <p className="text-sm text-muted mt-4" aria-live="polite">Você: {legenda}</p>}
      {historico.length > 1 && <details className="mt-5"><summary className="cursor-pointer text-sm text-accent font-semibold">Ver conversa anterior</summary><ol className="mt-3 space-y-3 max-h-60 overflow-auto">{historico.slice(0, -1).map((item, i) => <li key={i} className="text-sm"><strong>{item.papel === "candidato" ? "Você" : "Entrevistadora"}: </strong>{item.texto}</li>)}</ol></details>}
    </div>
    <footer className="border-t border-line p-5 space-y-4">
      <div className="flex items-center justify-center gap-3 flex-wrap"><button type="button" className="btn-primary !w-auto" aria-pressed={mudo} disabled={!conectado || microfoneOcupado} onClick={() => void alternarMicrofone()}>{mudo ? "Ativar microfone" : "Pausar microfone"}</button><button className="btn-ghost" disabled={!historico.some((f) => f.papel === "candidato")} onClick={() => void onFinalizar(falas.current)}>Encerrar entrevista</button></div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void enviarTexto(); }}><input className="input min-w-0" aria-label="Responder por texto" placeholder="Se preferir, escreva sua resposta" value={texto} maxLength={5000} onChange={(e) => setTexto(e.target.value)} /><button className="btn-ghost" disabled={!conectado || enviando || !texto.trim()}>Enviar</button></form>
    </footer>
  </section>;
}
