"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Status } from "./ui";
import type { Troca, Vaga } from "@/lib/types";

// Tipagem mínima da Web Speech API (não coberta pelo lib.dom.d.ts do TypeScript).
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: { 0: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const RESPOSTAS_EXEMPLO = [
  "Trabalho há quatro anos com atendimento a clientes B2B e hoje lidero o time de suporte sênior em uma empresa de SaaS de médio porte. Me candidatei porque quero atuar mais perto do sucesso do cliente, não só do suporte reativo.",
  "Tive um cliente grande que ameaçou cancelar por causa de um bug recorrente. Assumi o caso, montei um plano de acompanhamento semanal com o time de produto e consegui reverter o cancelamento em três semanas.",
  "Uso o HubSpot no dia a dia, desde a criação de pipelines até relatórios de saúde de conta. Já migrei uma base de 200 contas de uma planilha para o CRM sem perder histórico.",
  "Já viajei a trabalho algumas vezes para visitas a clientes estratégicos, sem problema com a frequência que a vaga pede.",
  "Acho que o que mais me motiva é ver um cliente que estava insatisfeito virar um defensor da marca. Foi o que mais me deu orgulho no último ano.",
];

export function Sala({
  vaga,
  status,
  modoExemplo,
  onFinalizar,
  onErro,
}: {
  vaga: Vaga;
  status: Status | null;
  modoExemplo: boolean;
  onFinalizar: (historico: Troca[]) => void;
  onErro: (mensagem: string) => void;
}) {
  const [historico, setHistorico] = useState<Troca[]>([]);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [suportaVoz] = useState(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  const chatRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mudoRef = useRef(false);
  const iniciouRef = useRef(false);
  const gestoRef = useRef(false);
  const pendenteRef = useRef<string | null>(null);

  useEffect(() => {
    mudoRef.current = mudo;
    if (mudo) pararVoz();
  }, [mudo]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [historico]);

  useEffect(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    proximaPergunta([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A voz só toca depois do primeiro gesto do usuário (clique ou tecla) dentro da sala,
  // para respeitar a política de autoplay dos navegadores: a primeira pergunta fica pendente
  // e é falada assim que o gesto acontece.
  useEffect(() => {
    function ativar() {
      if (gestoRef.current) return;
      gestoRef.current = true;
      if (pendenteRef.current) {
        falarTexto(pendenteRef.current);
        pendenteRef.current = null;
      }
    }
    window.addEventListener("pointerdown", ativar);
    window.addEventListener("keydown", ativar);
    return () => {
      window.removeEventListener("pointerdown", ativar);
      window.removeEventListener("keydown", ativar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function falarTexto(texto: string) {
    if (mudoRef.current) return;
    if (!gestoRef.current) {
      pendenteRef.current = texto;
      return;
    }
    if (status?.integrations?.tts) {
      const audio = new Audio(`/api/tts?texto=${encodeURIComponent(texto)}`);
      audioRef.current = audio;
      setFalando(true);
      audio.addEventListener("ended", () => setFalando(false));
      audio.addEventListener("error", () => setFalando(false));
      audio.play().catch(() => setFalando(false));
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(texto);
      utter.lang = "pt-BR";
      setFalando(true);
      utter.onend = () => setFalando(false);
      utter.onerror = () => setFalando(false);
      window.speechSynthesis.speak(utter);
    }
  }

  function pararVoz() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setFalando(false);
  }

  async function proximaPergunta(hist: Troca[]) {
    try {
      const r = await fetch("/api/entrevista/proxima", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaga, historico: hist }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar a próxima pergunta.");
      const novoHist: Troca[] = [...hist, { papel: "entrevistadora", texto: data.pergunta }];
      setHistorico(novoHist);
      if (!modoExemplo) falarTexto(data.pergunta);
      if (data.encerrar) {
        await finalizarEntrevista(novoHist);
      } else if (modoExemplo) {
        await responderExemplo(novoHist);
      }
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Não foi possível continuar a entrevista.");
    }
  }

  async function responderExemplo(hist: Troca[]) {
    await new Promise((r) => setTimeout(r, 500));
    const idx = hist.filter((h) => h.papel === "candidato").length;
    const texto = RESPOSTAS_EXEMPLO[idx % RESPOSTAS_EXEMPLO.length];
    const novoHist: Troca[] = [...hist, { papel: "candidato", texto }];
    setHistorico(novoHist);
    await proximaPergunta(novoHist);
  }

  async function finalizarEntrevista(hist: Troca[]) {
    await new Promise((r) => setTimeout(r, 900));
    onFinalizar(hist);
  }

  async function onResponder(e: FormEvent) {
    e.preventDefault();
    const texto = resposta.trim();
    if (!texto) return;
    setResposta("");
    const novoHist: Troca[] = [...historico, { papel: "candidato", texto }];
    setHistorico(novoHist);
    setEnviando(true);
    await proximaPergunta(novoHist);
    setEnviando(false);
  }

  function onFalar() {
    const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Reconhecimento) return;
    const rec = new Reconhecimento();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    setOuvindo(true);
    rec.onresult = (ev) => setResposta(ev.results[0][0].transcript);
    rec.onerror = () => {};
    rec.onend = () => setOuvindo(false);
    rec.start();
  }

  function alternarMudo() {
    setMudo((m) => !m);
  }

  async function onEncerrar() {
    if (encerrando || !historico.some((h) => h.papel === "candidato")) return;
    setEncerrando(true);
    await finalizarEntrevista(historico);
  }

  return (
    <div className="room reveal">
      <div className="room-head">
        <div className={`avatar${falando ? " falando" : ""}`}>
          <span>E</span>
        </div>
        <div className="room-head-text">
          <h2>Entrevistadora IA</h2>
          <div className="who">
            Conversando com {vaga.candidato} · {vaga.titulo}
            {falando && <span className="text-accent-ink font-semibold"> · Falando</span>}
          </div>
        </div>
        <button className="btn-ghost" type="button" onClick={alternarMudo}>
          {mudo ? "Ativar voz" : "Silenciar voz"}
        </button>
        <button
          className="btn-ghost"
          type="button"
          onClick={onEncerrar}
          disabled={encerrando || !historico.some((h) => h.papel === "candidato")}
        >
          Encerrar entrevista
        </button>
      </div>

      <div className="chat" ref={chatRef} aria-live="polite">
        {historico.map((h, i) => (
          <div key={i} className={`bubble ${h.papel}`}>
            <span className="bubble-autor">{h.papel === "entrevistadora" ? "Entrevistadora" : vaga.candidato}</span>
            <p>{h.texto}</p>
          </div>
        ))}
      </div>

      <form className="resposta" onSubmit={onResponder}>
        <textarea
          className="input min-h-[60px] resize-y"
          rows={2}
          placeholder="Digite a resposta do candidato..."
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          disabled={modoExemplo}
        />
        <div className="resposta-actions">
          {suportaVoz && !modoExemplo && (
            <button className="btn-ghost" type="button" onClick={onFalar} disabled={ouvindo}>
              {ouvindo ? "Ouvindo..." : "Falar"}
            </button>
          )}
          <button className="btn-primary w-auto" type="submit" disabled={modoExemplo || enviando}>
            Responder
          </button>
        </div>
      </form>
    </div>
  );
}
