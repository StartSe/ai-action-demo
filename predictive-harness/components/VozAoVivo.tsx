"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Scribe, CommitStrategy, RealtimeEvents, type RealtimeConnection } from "@elevenlabs/client";
import type { Mensagem } from "@/lib/types";
import { ErrorBox, Icon, Modal, request } from "./ui";
type Fase = "conectando" | "ouvindo" | "pensando" | "falando" | "encerrada";
type Sessao = {
  encerrada: boolean; muda: boolean; processando: boolean; pendente: string;
  conexao?: RealtimeConnection; audio: AudioContext; som?: AudioBufferSourceNode;
  abort: AbortController; fala?: AbortController; timeout?: ReturnType<typeof setTimeout>;
};
function liberar(s: Sessao) {
  s.encerrada = true; clearTimeout(s.timeout); s.abort.abort(); s.fala?.abort();
  s.conexao?.close(); s.som?.stop(); s.som = undefined;
  void s.audio.close().catch(() => {});
}
export function VozAoVivo({ conversaId, fontes, onTurno, onClose }: {
  conversaId: string; fontes: number;
  onTurno: (texto: string, signal: AbortSignal) => Promise<Mensagem>;
  onClose: () => void;
}) {
  const [fase, setFase] = useState<Fase>("conectando");
  const [muda, setMuda] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [somBloqueado, setSomBloqueado] = useState(false);
  const ref = useRef<Sessao | null>(null);
  const turno = useEffectEvent(onTurno);
  useEffect(() => {
    let cancelada = false;
    function falhar(s: Sessao, mensagem: string) {
      if (s.encerrada) return;
      liberar(s); setFase("encerrada"); setErro(mensagem);
    }
    async function iniciar() {
      if (cancelada) return;
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
        setFase("encerrada"); setErro("Use um navegador atualizado em HTTPS e permita o acesso ao microfone."); return;
      }
      const s: Sessao = { encerrada: false, muda: false, processando: false, pendente: "", audio: new AudioContext(), abort: new AbortController() };
      ref.current = s;
      void s.audio.resume().then(() => { if (!s.encerrada) setSomBloqueado(s.audio.state !== "running"); }).catch(() => setSomBloqueado(true));
      // The prompt for microphone permission and provider handshake must not hang indefinitely.
      s.timeout = setTimeout(() => falhar(s, "A conexão demorou demais. Confira o microfone e tente novamente."), 30000);
      function interromper() {
        s.fala?.abort(); s.fala = undefined;
        s.som?.stop(); s.som = undefined;
      }
      async function responder() {
        if (s.processando || s.encerrada) return;
        s.processando = true;
        try {
          while (s.pendente && !s.encerrada) {
            const pergunta = s.pendente; s.pendente = "";
            setFase("pensando");
            const resposta = await turno(pergunta, s.abort.signal);
            if (s.encerrada || s.pendente) continue;
            s.fala = new AbortController();
            const fala = s.fala;
            try {
              const res = await fetch("/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagemId: resposta.id, conversaId }), signal: fala.signal });
              if (!res.ok) throw new Error((await res.json()).error || "Não foi possível ouvir a resposta.");
              const buffer = await s.audio.decodeAudioData(await res.arrayBuffer());
              if (s.encerrada || fala.signal.aborted || s.pendente) continue;
              if (s.audio.state !== "running") setSomBloqueado(true);
              const som = s.audio.createBufferSource(); som.buffer = buffer; som.connect(s.audio.destination); s.som = som;
              setTexto(resposta.texto); setFase("falando");
              som.onended = () => { if (s.som !== som) return; s.som = undefined; if (!s.encerrada && !s.processando) setFase("ouvindo"); };
              som.start();
            } catch(e) { if (!fala.signal.aborted) throw e; }
          }
        } catch(e) { if (!s.encerrada) falhar(s, (e as Error).message); }
        finally { s.processando = false; if (!s.encerrada && !s.som) setFase("ouvindo"); }
      }
      try {
        const { token } = await request<{ token: string }>("/api/voz", "POST", { tempoReal: true, conversaId }, { signal: s.abort.signal });
        if (s.encerrada) return;
        setSomBloqueado(s.audio.state !== "running");
        const c = Scribe.connect({ token, modelId: "scribe_v2_realtime", commitStrategy: CommitStrategy.VAD, languageCode: "pt", vadSilenceThresholdSecs: 1.5, microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        s.conexao = c;
        c.on(RealtimeEvents.SESSION_STARTED, () => { if (!s.encerrada) { clearTimeout(s.timeout); setFase("ouvindo"); } });
        c.on(RealtimeEvents.PARTIAL_TRANSCRIPT, ({ text }) => {
          if (s.encerrada || s.muda || !text.trim()) return;
          interromper(); setTexto(text); if (!s.processando) setFase("ouvindo");
        });
        c.on(RealtimeEvents.COMMITTED_TRANSCRIPT, ({ text }) => {
          if (s.encerrada || s.muda || !text.trim()) return;
          interromper(); setTexto(text);
          s.pendente = [s.pendente, text.trim()].filter(Boolean).join(" ");
          if (s.pendente.length > 2000) { falhar(s, "A pergunta ficou muito longa. Continue pelo chat com até 2.000 caracteres."); return; }
          void responder();
        });
        c.on(RealtimeEvents.ERROR, () => falhar(s, "Não foi possível manter a conversa por voz. Confira a permissão do microfone e a conexão da ElevenLabs."));
        const erros = [RealtimeEvents.AUTH_ERROR, RealtimeEvents.QUOTA_EXCEEDED, RealtimeEvents.TRANSCRIBER_ERROR, RealtimeEvents.UNACCEPTED_TERMS, RealtimeEvents.RATE_LIMITED, RealtimeEvents.INPUT_ERROR, RealtimeEvents.INVALID_REQUEST, RealtimeEvents.QUEUE_OVERFLOW, RealtimeEvents.RESOURCE_EXHAUSTED, RealtimeEvents.SESSION_TIME_LIMIT_EXCEEDED, RealtimeEvents.CHUNK_SIZE_EXCEEDED, RealtimeEvents.INSUFFICIENT_AUDIO_ACTIVITY];
        for (const evento of erros) c.on(evento, () => falhar(s, evento === RealtimeEvents.QUOTA_EXCEEDED ? "Os créditos de voz acabaram. Confira sua conta ElevenLabs." : evento === RealtimeEvents.UNACCEPTED_TERMS ? "Aceite os termos do Scribe na sua conta ElevenLabs para conversar por voz." : "A sessão de voz foi interrompida. Confira sua conexão e as permissões de Scribe Realtime na ElevenLabs."));
        c.on(RealtimeEvents.CLOSE, () => falhar(s, "A conexão de voz foi encerrada. Você pode iniciar uma nova conversa por voz."));
      } catch(e) { if (!s.encerrada) falhar(s, (e as Error).message); }
    }
    const timer = setTimeout(() => void iniciar(), 0);
    return () => { cancelada = true; clearTimeout(timer); if (ref.current && !ref.current.encerrada) liberar(ref.current); };
  }, [conversaId]);
  function encerrar() { if (ref.current && !ref.current.encerrada) liberar(ref.current); onClose(); }
  function silenciar() {
    const s = ref.current;
    if (!s?.conexao || s.encerrada) return;
    try { if (s.muda) s.conexao.unmute(); else s.conexao.mute(); s.muda = !s.muda; setMuda(s.muda); }
    catch { setErro("O microfone ainda está iniciando. Aguarde um instante."); }
  }
  const rotulo = fase === "conectando" ? "Conectando ao Jev…" : fase === "encerrada" ? "Conversa encerrada" : fase === "falando" ? "Jev está falando" : fase === "pensando" ? "Analisando seus dados…" : muda ? "Microfone pausado" : "Estou ouvindo";
  return <Modal title="Conversa por voz" onClose={encerrar}><div className="live-voice">
    <span className="voice-context"><Icon name="table" size={14} />{fontes} {fontes === 1 ? "fonte nesta conversa" : "fontes nesta conversa"}</span>
    <div className={`voice-orb ${fase}${muda ? " muted" : ""}`} aria-hidden="true"><span /><span /><Icon name="spark" size={48} /></div>
    <h3 role="status">{rotulo}</h3><p className="muted">{fase === "conectando" ? "Permita o microfone para começar." : fase === "encerrada" ? "Suas mensagens ficam no chat." : "Fale naturalmente. Você pode interromper o Jev."}</p>
    {texto && <div className="voice-transcript">{texto}</div>}
    <ErrorBox error={erro} />
    {somBloqueado && fase !== "encerrada" && <button className="secondary" onClick={() => void ref.current?.audio.resume().then(() => setSomBloqueado(false))}><Icon name="volume" size={18} />Ativar som</button>}
    <div className="voice-controls"><button className="secondary" disabled={fase === "conectando" || fase === "encerrada"} aria-pressed={muda} onClick={silenciar}><Icon name={muda ? "micOff" : "mic"} size={20} />{muda ? "Ativar microfone" : "Pausar microfone"}</button><button className="voice-end" onClick={encerrar}><Icon name="close" size={22} />Encerrar</button></div>
    <small>Áudio ao vivo pela ElevenLabs. O microfone é desligado ao encerrar.</small>
  </div></Modal>;
}
