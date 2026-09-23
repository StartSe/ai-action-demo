"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function construtor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}
const inscrever = () => () => {};
const cancelado = () => new DOMException("Escuta cancelada", "AbortError");

function mensagemErro(codigo: string) {
  switch (codigo) {
    case "not-allowed": return "O microfone não está disponível. Libere a permissão no navegador e tente novamente, ou continue por texto.";
    case "audio-capture": return "Não foi possível captar áudio. Confira o microfone selecionado no navegador ou continue por texto.";
    case "network": return "O serviço de reconhecimento de fala perdeu a conexão. Confira sua internet e tente novamente, ou continue por texto.";
    case "service-not-allowed": return "O serviço de reconhecimento de fala está indisponível neste navegador. Tente abrir o link em outra janela do Chrome ou continue por texto.";
    case "language-not-supported": return "O navegador não conseguiu reconhecer fala em português. Continue por texto.";
    default: return "O reconhecimento de fala parou. Tente iniciar o microfone novamente ou continue por texto.";
  }
}

type Escuta = { pronta: Promise<void>; parar: (finalizar: boolean) => Promise<void> };

/** Uma instância por escuta: erros e permissões anteriores não inutilizam a próxima tentativa. */
export function useReconhecimentoVoz(aoErro: (mensagem: string) => void) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const suporta = useSyncExternalStore(inscrever, () => Boolean(construtor()), () => false);
  const escuta = useRef<Escuta | null>(null);
  const montada = useRef(true);
  const erroRef = useRef(aoErro);
  useEffect(() => { erroRef.current = aoErro; });

  useEffect(() => {
    montada.current = true;
    return () => { montada.current = false; void escuta.current?.parar(false); };
  }, []);

  function iniciar(): Promise<void> {
    if (escuta.current) return escuta.current.pronta;
    const Reconhecimento = construtor();
    if (!Reconhecimento) return Promise.reject(new Error("Este navegador não reconhece fala. Continue por texto ou abra este link no Chrome."));
    const rec = new Reconhecimento();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = !/android/i.test(navigator.userAgent);
    let iniciou = false;
    let terminou = false;
    let parando = false;
    let resolverInicio!: () => void;
    let rejeitarInicio!: (e: Error) => void;
    let resolverFim!: () => void;
    let prazoParada: ReturnType<typeof setTimeout> | undefined;
    const pronta = new Promise<void>((resolve, reject) => { resolverInicio = resolve; rejeitarInicio = reject; });
    const fim = new Promise<void>(resolve => { resolverFim = resolve; });
    const prazoInicio = setTimeout(() => falhar(new Error("O serviço de reconhecimento de fala não iniciou. Tente novamente ou continue por texto.")), 10000);

    function concluir(erro: Error = cancelado()) {
      if (terminou) return;
      terminou = true;
      clearTimeout(prazoInicio); clearTimeout(prazoParada);
      rec.onstart = null; rec.onresult = null; rec.onerror = null; rec.onend = null;
      if (escuta.current === atual) escuta.current = null;
      if (montada.current) setListening(false);
      if (!iniciou) rejeitarInicio(erro);
      resolverFim();
    }
    function falhar(erro: Error) {
      if (terminou) return;
      const avisar = iniciou && !parando;
      concluir(erro);
      try { rec.abort(); } catch { /* O navegador pode já ter fechado a captura. */ }
      if (avisar && montada.current) erroRef.current(erro.message);
    }
    const atual: Escuta = {
      pronta,
      parar(finalizar) {
        if (terminou || parando) return fim;
        parando = true;
        clearTimeout(prazoInicio);
        // onend pode não chegar após revogar a permissão ou desconectar o dispositivo.
        prazoParada = setTimeout(() => {
          concluir();
          try { rec.abort(); } catch { /* Captura já encerrada. */ }
        }, 1500);
        try { if (finalizar) rec.stop(); else rec.abort(); } catch { concluir(); }
        return fim;
      },
    };
    escuta.current = atual;
    setTranscript("");
    rec.onstart = () => {
      if (parando || terminou) return;
      iniciou = true;
      clearTimeout(prazoInicio);
      if (montada.current) setListening(true);
      resolverInicio();
    };
    rec.onresult = event => {
      // A lista é cumulativa na escuta contínua. Recompô-la preserva resultados finais
      // consecutivos e revisões de trechos provisórios sem duplicar palavras.
      const partes = Array.from(event.results, resultado => resultado[0]?.transcript.trim() || "");
      if (montada.current) setTranscript(partes.filter(Boolean).join(" "));
    };
    rec.onerror = event => {
      if (parando || event.error === "aborted" || event.error === "no-speech") { concluir(); return; }
      falhar(new Error(mensagemErro(event.error)));
    };
    rec.onend = () => concluir(new Error("O reconhecimento de fala não iniciou. Tente novamente ou continue por texto."));
    try { rec.start(); } catch (err) { falhar(err instanceof Error ? err : new Error(mensagemErro(""))); }
    return pronta;
  }

  return {
    transcript, listening, suporta, iniciar,
    resetTranscript: () => setTranscript(""),
    parar: (finalizar = false) => escuta.current?.parar(finalizar) ?? Promise.resolve(),
  };
}
