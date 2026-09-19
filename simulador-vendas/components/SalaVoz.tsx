"use client";
import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { DicaConversa } from "@/components/DicaConversa";
import { OrbeVoz } from "@/components/OrbeVoz";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { ConversaRegistrada, FeedbackVendedor, type Tentativas } from "@/components/FeedbackVendedor";
import { Aviso, lerErro } from "@/components/ui";
import { frasePerfil } from "@/lib/personas";
import type { Conversa } from "@/lib/types";
import type { AvaliacaoSessao } from "@/lib/avaliacao";
import type { Meta } from "@/lib/ai";

type Papel = "vendedor" | "cliente";
export type Fala = { papel: Papel; texto: string };
type EstadoConversa = "parado" | "conectando" | "ouvindo" | "pensando" | "falando";
type Resposta = {
  demo: boolean;
  conversa: Conversa;
  avaliacao: AvaliacaoSessao;
  meta: Meta;
  id?: string;
  titulo: string;
  /** Emoji + nome do tipo de cliente, revelado só agora que a conversa acabou (US-017). */
  tipoDeCliente?: string;
  comportamento?: string;
  /** Os adjetivos do perfil ("apressado e exigente"), que viram a linha da revelação com o nome daqui. */
  perfil?: string;
  /** Quantas conversas ele já teve neste treino e se ainda pode ter outra (US-019). */
  tentativas?: Tentativas;
  sessaoId?: string;
};
type Fim = { resultado?: Resposta; semConversa?: boolean; semFeedback?: boolean; tentativas?: Tentativas };

export type PropsSalaVoz = {
  codigo: string;
  marca: string;
  nome: string;
  titulo: string;
  cliente: { nome: string; cargo: string; empresa: string };
  objetivo: string;
  duracaoMin: number;
  iniciadaEm: string;
  falasIniciais: Fala[];
  /** O gestor permitiu treinar falando. */
  porVoz: boolean;
  /** O gestor permitiu digitar. */
  porTexto: boolean;
  /** Existe voz própria no servidor; sem isso a fala do cliente sai do próprio navegador. */
  vozDoServidor: boolean;
  /**
   * Como este cliente fala, quando quem fala é o navegador (US-028): ritmo e altura da voz, já
   * calculados no servidor. São dois números e nada mais — o tipo de cliente continua escondido de
   * quem treina até o feedback (D2), e daqui não dá para deduzi-lo.
   */
  voz: { rate: number; pitch: number };
};

const ROTULO_ESTADO: Record<EstadoConversa, string> = {
  parado: "Microfone pausado", conectando: "Conectando microfone…", ouvindo: "Estou ouvindo você",
  pensando: "O cliente está pensando…", falando: "O cliente está falando",
};
function relogio(segundos: number) { return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`; }

export function SalaVoz({ codigo, marca, nome, titulo, cliente, objetivo, duracaoMin, iniciadaEm, falasIniciais, porVoz, porTexto, vozDoServidor, voz }: PropsSalaVoz) {
  const [falas, setFalas] = useState<Fala[]>(falasIniciais);
  const [estado, setEstado] = useState<EstadoConversa>("parado");
  const [modo, setModo] = useState<"voz" | "texto">(porVoz ? "voz" : "texto");
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState("");
  const [erroTurno, setErroTurno] = useState(false);
  const [motivoTexto, setMotivoTexto] = useState("");
  const [fim, setFim] = useState<Fim | null>(null);
  const [encerrando, setEncerrando] = useState(false);
  const [falaPronta, setFalaPronta] = useState(false);
  const [ativa, setAtiva] = useState(false);
  const { transcript, resetTranscript, listening, browserSupportsSpeechRecognition, browserSupportsContinuousListening, isMicrophoneAvailable } = useSpeechRecognition();
  const estadoRef = useRef<EstadoConversa>("parado");
  const ativaRef = useRef(false);
  const finalizarRef = useRef(false);
  const fechandoRef = useRef(false);
  const montadaRef = useRef(true);
  const turnoRef = useRef(false);
  const microfoneRef = useRef(false);
  const paradaRef = useRef<Promise<void> | null>(null);
  const enviandoFalaRef = useRef(false);
  const transcriptRef = useRef("");
  const cancelarAudioRef = useRef<(() => void) | null>(null);
  const audioPedidoRef = useRef<AbortController | null>(null);
  const audioGeracaoRef = useRef(0);
  const iniciarRef = useRef<(() => Promise<void>) | null>(null);
  const ultimaDoCliente = [...falas].reverse().find(f => f.papel === "cliente")?.texto ?? "";
  const jaFalou = falas.some(f => f.papel === "vendedor");
  const totalSeg = Math.max(1, duracaoMin) * 60;
  const restante = useSyncExternalStore(
    useCallback((avisar) => { const t = setInterval(avisar, 1000); return () => clearInterval(t); }, []),
    () => Math.max(0, totalSeg - Math.floor((Date.now() - new Date(iniciadaEm).getTime()) / 1000)), () => totalSeg,
  );
  function guardarEstado(novo: EstadoConversa) { estadoRef.current = novo; if (montadaRef.current) setEstado(novo); }
  function pararAudio() {
    audioGeracaoRef.current++;
    audioPedidoRef.current?.abort();
    cancelarAudioRef.current?.();
    cancelarAudioRef.current = null;
    window.speechSynthesis?.cancel();
  }
  function pararMicrofone(finalizar = false): Promise<void> {
    if (paradaRef.current) return paradaRef.current;
    if (!microfoneRef.current) return Promise.resolve();
    microfoneRef.current = false;
    // A biblioteca espera onend mesmo quando o microfone já parou. Compartilhar uma única
    // parada evita promessas penduradas e preserva o resultado final ao clicar rapidamente.
    const parada = finalizar ? SpeechRecognition.stopListening() : SpeechRecognition.abortListening();
    const pronta = parada.finally(() => { if (paradaRef.current === pronta) paradaRef.current = null; });
    paradaRef.current = pronta;
    return pronta;
  }
  function pausar() {
    ativaRef.current = false;
    setAtiva(false);
    if (transcriptRef.current.trim()) setDigitado(transcriptRef.current.trim());
    void pararMicrofone();
    pararAudio();
    if (!turnoRef.current) guardarEstado("parado");
  }
  function usarTexto(motivo = "") {
    pausar();
    setModo("texto");
    setMotivoTexto(motivo);
  }
  async function iniciarEscuta() {
    if (fechandoRef.current || turnoRef.current || estadoRef.current === "conectando" || !montadaRef.current) return;
    if (!browserSupportsSpeechRecognition || !isMicrophoneAvailable) {
      usarTexto(!browserSupportsSpeechRecognition ? "Este navegador não reconhece fala. Continue por texto ou abra este link no Chrome." : "Libere o microfone nas permissões do navegador para falar. Você também pode continuar por texto.");
      return;
    }
    pararAudio();
    setErro("");
    ativaRef.current = true;
    setAtiva(true);
    guardarEstado("conectando");
    await paradaRef.current;
    if (!ativaRef.current || fechandoRef.current || !montadaRef.current) return;
    transcriptRef.current = "";
    resetTranscript();
    try {
      await SpeechRecognition.startListening({ continuous: browserSupportsContinuousListening, language: "pt-BR" });
      if (!ativaRef.current || fechandoRef.current || !montadaRef.current) { await SpeechRecognition.abortListening(); return; }
      microfoneRef.current = true;
      guardarEstado("ouvindo");
    } catch {
      usarTexto("Não foi possível abrir o microfone. Confira a permissão ou continue por texto.");
    }
  }
  useEffect(() => { iniciarRef.current = iniciarEscuta; });

  async function dizer(texto: string) {
    if (!ativaRef.current || !montadaRef.current) return;
    guardarEstado("falando");
    const geracao = audioGeracaoRef.current;
    const vale = () => geracao === audioGeracaoRef.current && ativaRef.current && montadaRef.current;
    if (vozDoServidor) {
      const controller = new AbortController();
      audioPedidoRef.current = controller;
      try {
        const r = await fetch(`/api/salas/${codigo}/voz`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }), signal: controller.signal });
        if (r.ok) {
          const blob = await r.blob();
          if (!vale()) return;
          await new Promise<void>((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            const prazo = setTimeout(() => pronto(new Error("Áudio indisponível")), 120000);
            function pronto(error?: unknown) {
              clearTimeout(prazo); audio.pause(); audio.onended = null; audio.onerror = null;
              URL.revokeObjectURL(url); cancelarAudioRef.current = null;
              if (error) reject(error); else resolve();
            }
            cancelarAudioRef.current = () => pronto();
            audio.onended = () => pronto(); audio.onerror = () => pronto(new Error("Áudio indisponível"));
            audio.play().catch(pronto);
          });
          return;
        }
      } catch { if (!vale()) return; }
    }
    if (!vale()) return;
    await new Promise<void>((resolve) => {
      const sintese = window.speechSynthesis;
      if (!sintese) { setMotivoTexto("Áudio indisponível. A resposta está na conversa abaixo."); resolve(); return; }
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR"; fala.rate = voz.rate; fala.pitch = voz.pitch;
      const escolhida = sintese.getVoices().find(v => v.lang.toLowerCase().startsWith("pt"));
      if (escolhida) fala.voice = escolhida;
      const prazo = setTimeout(() => { sintese.cancel(); pronto(); }, Math.max(15000, texto.length * 160 / voz.rate));
      function pronto() { clearTimeout(prazo); fala.onend = null; fala.onerror = null; cancelarAudioRef.current = null; resolve(); }
      cancelarAudioRef.current = pronto;
      fala.onend = pronto;
      fala.onerror = () => { setMotivoTexto("Não foi possível tocar a voz. Leia a resposta na conversa."); pronto(); };
      sintese.speak(fala);
    });
  }

  async function pedirResultado() {
    if (fechandoRef.current || turnoRef.current) return;
    fechandoRef.current = true;
    pausar();
    setEncerrando(true); setErro("");
    try {
      const r = await fetch(`/api/salas/${codigo}/encerrar`, { method: "POST" });
      const corpo = await r.json() as Resposta & { error?: string; semConversa?: boolean; semFeedback?: boolean };
      if (!r.ok) throw new Error(corpo.error || "Não foi possível fechar a conversa.");
      if (!montadaRef.current) return;
      if (corpo.semConversa) setFim({ semConversa: true, tentativas: corpo.tentativas });
      else if (corpo.semFeedback) setFim({ semFeedback: true, tentativas: corpo.tentativas });
      else setFim({ resultado: corpo, tentativas: corpo.tentativas });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível fechar a conversa.");
      setEncerrando(false); fechandoRef.current = false; finalizarRef.current = false;
    }
  }

  async function conversar(texto: string, retomar = false) {
    if (turnoRef.current || fechandoRef.current || !montadaRef.current) return;
    turnoRef.current = true;
    guardarEstado("pensando"); setErro(""); setErroTurno(false);
    await pararMicrofone();
    transcriptRef.current = ""; resetTranscript();
    if (!retomar) setFalas(atuais => [...atuais, { papel: "vendedor", texto }]);
    let encerrar = false;
    let sucesso = false;
    try {
      const r = await fetch(`/api/salas/${codigo}/conversar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retomar ? { retomar: true } : { fala: texto, segundo: Math.floor((Date.now() - new Date(iniciadaEm).getTime()) / 1000) }),
      });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      const resposta = await r.json() as { texto: string; encerrada?: boolean };
      if (!montadaRef.current || fechandoRef.current) return;
      setFalas(atuais => [...atuais, { papel: "cliente", texto: resposta.texto }]);
      await dizer(resposta.texto);
      encerrar = Boolean(resposta.encerrada); sucesso = true;
    } catch (err) {
      setErro((await lerErro(err)).mensagem); setErroTurno(true);
      ativaRef.current = false; setAtiva(false);
    } finally { turnoRef.current = false; guardarEstado("parado"); }
    if (!montadaRef.current) return;
    if (finalizarRef.current || encerrar || Date.now() - new Date(iniciadaEm).getTime() >= totalSeg * 1000) { await pedirResultado(); return; }
    if (sucesso && ativaRef.current) await iniciarRef.current?.();
  }

  async function enviarFala() {
    if (enviandoFalaRef.current || turnoRef.current || !ativaRef.current || fechandoRef.current) return;
    enviandoFalaRef.current = true;
    // stopListening aguarda o resultado final antes de enviar; abort descarta a fala em andamento.
    await pararMicrofone(true);
    if (!ativaRef.current || fechandoRef.current) { enviandoFalaRef.current = false; return; }
    // O último onresult e onend podem chegar no mesmo evento. Enviar no próximo efeito
    // garante que o React já recebeu a transcrição final, sem cortar as últimas palavras.
    setFalaPronta(true);
  }
  const consumirFala = useEffectEvent(() => {
    setFalaPronta(false);
    enviandoFalaRef.current = false;
    if (!ativaRef.current || fechandoRef.current) return;
    const texto = transcript.trim();
    if (texto) void conversar(texto);
    else { ativaRef.current = false; setAtiva(false); guardarEstado("parado"); }
  });
  useEffect(() => {
    if (!falaPronta) return;
    const timer = setTimeout(consumirFala, 0);
    return () => clearTimeout(timer);
  }, [falaPronta]);
  useEffect(() => { if (!listening && estadoRef.current === "ouvindo") microfoneRef.current = false; }, [listening]);
  const aoTranscrever = useEffectEvent(() => { transcriptRef.current = transcript; });
  useEffect(() => { aoTranscrever(); }, [transcript]);
  const aoTerminarFala = useEffectEvent(() => { void enviarFala(); });
  useEffect(() => {
    if (estado !== "ouvindo" || !transcript.trim()) return;
    const timer = setTimeout(aoTerminarFala, listening ? 1400 : 150);
    return () => clearTimeout(timer);
  }, [transcript, listening, estado]);
  const aoPerderMicrofone = useEffectEvent(() => usarTexto("O microfone não está disponível. Libere a permissão para falar ou continue por texto."));
  useEffect(() => { if (isMicrophoneAvailable) return; const timer = setTimeout(aoPerderMicrofone, 0); return () => clearTimeout(timer); }, [isMicrophoneAvailable]);
  const aoPararSemFala = useEffectEvent(() => {
    if (!turnoRef.current && !enviandoFalaRef.current) { ativaRef.current = false; setAtiva(false); guardarEstado("parado"); }
  });
  useEffect(() => {
    if (listening || transcript || estado !== "ouvindo") return;
    const timer = setTimeout(aoPararSemFala, 1000);
    return () => clearTimeout(timer);
  }, [listening, transcript, estado]);
  const aoExpirar = useEffectEvent(() => { if (!fim && !fechandoRef.current && !turnoRef.current) void pedirResultado(); });
  useEffect(() => { if (restante === 0) aoExpirar(); }, [restante]);
  useEffect(() => {
    montadaRef.current = true;
    return () => {
      montadaRef.current = false; ativaRef.current = false;
      void SpeechRecognition.abortListening();
      audioPedidoRef.current?.abort(); cancelarAudioRef.current?.(); window.speechSynthesis?.cancel();
    };
  }, []);
  function enviarDigitado() {
    if (!digitado.trim() || turnoRef.current || fechandoRef.current || erroTurno) return;
    const texto = digitado.trim(); setDigitado(""); void conversar(texto);
  }
  function encerrarConversa() {
    if (encerrando) return;
    finalizarRef.current = true;
    pausar();
    setEncerrando(true);
    if (!turnoRef.current) void pedirResultado();
  }
  function interromper() {
    pararAudio();
    // A resposta já está gravada. A continuação do turno retoma a escuta após cancelar o áudio.
  }
  if (fim) {
    // Enquanto o balanço não chega (uma resposta antiga em cache, um erro de leitura), o caminho
    // seguro é deixar "Treinar novamente" à mão: a tela do treino confere o limite de novo antes de
    // abrir qualquer conversa, então o pior caso é um clique que explica por que não dá.
    const tentativas: Tentativas = fim.tentativas ?? { podeTreinar: true, tentativas: 0, maxTentativas: null };
    return (
      <Moldura marca={marca} nome={nome} largo={Boolean(fim.resultado)}>
        {fim.resultado ? (
          <FeedbackVendedor
            codigo={codigo}
            // Quem era o cliente: a revelação só acontece aqui, depois da conversa. Antes dela, nem a
            // tela nem as rotas dizem com que tipo de pessoa o vendedor ia falar.
            cliente={
              fim.resultado.tipoDeCliente
                ? {
                    tipoDeCliente: fim.resultado.tipoDeCliente,
                    comportamento: fim.resultado.comportamento,
                    // O nome do personagem é daqui, não da rota: esta tela acabou de mostrá-lo durante
                    // a conversa inteira.
                    perfil: fim.resultado.perfil ? frasePerfil(cliente.nome, fim.resultado.perfil) : undefined,
                  }
                : null
            }
            resultado={fim.resultado}
            tentativas={tentativas}
            demoTexto="Exemplo fixo: as notas abaixo não são um julgamento da conversa que você acabou de ter."
          />
        ) : (
          <ConversaRegistrada
            codigo={codigo}
            titulo="Conversa registrada"
            descricao={
              fim.semConversa
                ? "Você encerrou antes de falar com o cliente, então não há o que avaliar desta vez."
                : "Seu gestor vai comentar com você."
            }
            tentativas={tentativas}
          />
        )}
      </Moldura>
    );
  }

  return (
    <main className="max-w-[760px] mx-auto px-5 py-6 min-h-[100svh] flex flex-col gap-4" style={{ colorScheme: "light" }}>
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent text-white grid place-items-center font-bold">{marca}</div>
        <h1 className="font-bold flex-1 truncate">{titulo}</h1>
        <span className={`tabular-nums text-sm ${restante <= 120 ? "text-danger" : "text-muted"}`} aria-label="Tempo restante">{relogio(restante)}</span>
      </header>
      <section className={`card p-6 max-md:p-4 flex flex-col gap-5 ${modo === "voz" ? "sala-conversacional" : ""}`}>
        <div className={modo === "voz" ? "text-center" : "flex items-center gap-3"}>
          {modo === "texto" && <div className="w-12 h-12 rounded-full bg-accent/10 text-accent grid place-items-center font-bold" aria-hidden="true">{cliente.nome.slice(0, 1)}</div>}
          <div><h2 className="font-bold text-lg">{cliente.nome}</h2><p className="text-muted text-sm">{cliente.cargo} · {cliente.empresa}</p></div>
        </div>
        {modo === "voz" ? (
          <details className="text-sm text-muted text-center"><summary className="cursor-pointer w-fit mx-auto rounded-lg focus-visible:outline-2 focus-visible:outline-accent">Objetivo da conversa</summary><p className="mt-2 max-w-lg mx-auto">{objetivo}</p></details>
        ) : <p className="text-sm text-muted">Seu objetivo: {objetivo}</p>}
        {modo === "voz" && <OrbeVoz estado={estado} encerrando={encerrando} />}
        <p role="status" className="text-center text-sm font-semibold">{encerrando ? "Preparando seu resultado…" : modo === "texto" && estado === "parado" ? "Sua vez de escrever" : ROTULO_ESTADO[estado]}</p>
        <div className={modo === "voz" ? "text-center px-2 max-w-xl mx-auto flex flex-col items-center gap-2" : "rounded-2xl bg-bg p-5 min-h-32 flex flex-col justify-center gap-3"}>
          <p className={modo === "voz" ? "text-base leading-relaxed whitespace-pre-wrap text-ink-2" : "text-lg leading-relaxed whitespace-pre-wrap"} aria-live="polite">{ultimaDoCliente || "Quando estiver pronto, apresente-se e comece a conversa."}</p>
          {estado === "falando" && <button className="btn-link text-sm min-h-11" onClick={interromper}>Interromper e falar</button>}
        </div>
        {!encerrando && <DicaConversa codigo={codigo} turno={falas.length} ultimaFala={ultimaDoCliente} aguardando={falas.at(-1)?.papel === "vendedor"} />}
        {motivoTexto && <p className="text-sm text-muted">{motivoTexto}</p>}
        {erro && <Aviso tom="danger" acao={erroTurno ? { rotulo: "Tentar resposta novamente", onClick: () => { if (!turnoRef.current) void conversar("", true); } } : undefined}>{erro}</Aviso>}
        {modo === "voz" ? (
          <div className="flex flex-col items-center gap-3">
            <p className="min-h-6 text-sm text-muted italic text-center" aria-live="polite">{estado === "ouvindo" ? transcript || "Fale naturalmente. A resposta vem após uma breve pausa." : ativa ? "A conversa continua automaticamente." : "Toque uma vez para conversar, sem precisar segurar."}</p>
            <button type="button" className="btn-primary !w-auto min-h-14 !rounded-full !px-7 touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-4"
              aria-pressed={ativa} disabled={encerrando || erroTurno || (!ativa && estado === "pensando")}
              onClick={() => ativa ? pausar() : void iniciarEscuta()}>
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {ativa ? <><path d="M9 5v14M15 5v14" /></> : <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>}
              </svg>
              {ativa ? "Pausar microfone" : "Iniciar microfone"}
            </button>
            {estado === "ouvindo" && transcript.trim() && <button type="button" className="btn-ghost !w-auto min-h-11" onClick={() => void enviarFala()}>Enviar fala agora</button>}
            {digitado && !ativa && <p className="text-xs text-muted">Sua fala pausada está salva no campo de texto.</p>}
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); enviarDigitado(); }}>
            <label htmlFor="fala-digitada" className="block font-semibold text-sm mb-2">Sua mensagem</label>
            <textarea id="fala-digitada" className="input min-h-24" rows={3} maxLength={2000} value={digitado} onChange={e => setDigitado(e.target.value)} placeholder="Escreva sua fala…" disabled={encerrando}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviarDigitado(); } }} aria-describedby="ajuda-mensagem" />
            <div className="flex items-center justify-between gap-3 mt-2"><p id="ajuda-mensagem" className="text-xs text-muted">Enter envia. Shift + Enter cria uma nova linha.</p><button className="btn-primary !w-auto min-h-11" disabled={!digitado.trim() || estado !== "parado" || encerrando || erroTurno}>Enviar</button></div>
          </form>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-3">
          {modo === "voz" && porTexto ? <button className="btn-ghost !w-auto min-h-11" disabled={encerrando} onClick={() => usarTexto()}>Prefiro digitar</button> : modo === "texto" && porVoz ? <button className="btn-ghost !w-auto min-h-11" disabled={encerrando || estado !== "parado"} onClick={() => { setModo("voz"); setMotivoTexto(""); }}>Voltar à voz</button> : <span />}
          <button className="btn-ghost !w-auto min-h-11" disabled={encerrando} onClick={encerrarConversa}>{jaFalou ? "Encerrar e ver resultado" : "Encerrar"}</button>
        </div>
      </section>
      {falas.length > 0 && <details className="card p-4"><summary className="cursor-pointer font-semibold text-sm min-h-8">Conversa completa ({falas.length})</summary><ol className="space-y-3 mt-3 max-h-72 overflow-auto" aria-label="Conversa completa">{falas.map((fala, i) => <li key={i} className={`p-3 rounded-xl text-sm whitespace-pre-wrap ${fala.papel === "vendedor" ? "bg-accent/10 ml-6" : "bg-bg mr-6"}`}><span className="block text-xs font-semibold text-muted mb-1">{fala.papel === "vendedor" ? "Você" : cliente.nome}</span>{fala.texto}</li>)}</ol></details>}
    </main>
  );
}

/** Mesma marca e mesmo cartão das outras telas do vendedor (US-013/US-014), sem menu de gestor. */
function Moldura({ marca, nome, largo, children }: { marca: string; nome: string; largo: boolean; children: React.ReactNode }) {
  return (
    <div className={largo ? "max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10" : "max-w-[520px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8"} style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>
      {children}
    </div>
  );
}
