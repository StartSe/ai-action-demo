"use client";
import { carregarConversaComRecuperacao } from "@/lib/carregar-conversa";
// A conversa do candidato (US-018, nível 2 do PRD): ele fala, a entrevistadora responde em voz alta.
//
// Substitui `components/Sala.tsx` no link público — aquela ficou sendo só a prévia do gestor, que
// digita as respostas e não precisa de nada disto. Três coisas moldaram esta tela:
//
//  1. Um toque começa a gravação e outro permite revisar antes de enviar. Mãos livres
//     é opcional; o candidato controla quando sua resposta está pronta.
//  2. **A conversa mora no servidor.** A cada turno vai só a última resposta; a transcrição fica em
//     `mensagens_entrevista`. Recarregar a página volta com as falas na tela e na pergunta em que
//     parou, e o parecer lê o que foi gravado, não o que este navegador lembrava.
//  3. **Nada aqui é um beco.** Navegador sem escuta, microfone negado, modelo que não respondeu:
//     todos terminam em algo que o CANDIDATO pode fazer — digitar, tentar de novo, encerrar. Ele não
//     configura nada e não recebe recado de quem administra o app.
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, ErrorBox, lerErro, useConfirmacao, type ErroLido } from "./ui";
import { criarPausaDespedida } from "@/lib/pausa-despedida";
import { criarEscuta, type SessaoEscuta } from "@/lib/escuta";
import type { CodigoErroIA } from "@/lib/ai";
import type { Troca } from "@/lib/types";

// A tipagem da escuta do navegador (`SpeechRecognition`) mora em lib/fala.d.ts, no escopo global: as
// boas-vindas usam a mesma, e duas declarações locais não convivem.

/** Tempo até conferir se o navegador realmente começou a falar; se não começou, não há o que esperar. */
const CONFERIR_SE_FALA_MS = 250;

/**
 * Rede de segurança do `speechSynthesis`, que às vezes não avisa que terminou: um teto proporcional
 * ao tamanho da fala (uma voz lenta faz ~11 caracteres por segundo), entre 3 e 20 segundos. Teto fixo
 * e generoso era pior — num aparelho sem voz instalada a sala ficava parada em "Falando...".
 */
function limiteDaFala(texto: string): number {
  return Math.min(20_000, Math.max(3_000, 1500 + texto.length * 90));
}

type EstadoConversa = "parado" | "iniciando" | "ouvindo" | "transcrevendo" | "pensando" | "falando";
type ModoEscuta = "toque" | "livre";

const ROTULO_ESTADO: Record<EstadoConversa, string> = {
  parado: "Sua vez de falar",
  iniciando: "Abrindo microfone...",
  ouvindo: "Ouvindo...",
  transcrevendo: "Preparando sua resposta...",
  pensando: "Pensando...",
  falando: "Falando...",
};

/** O que cada turno devolve (lib/roteiro.ts). A transcrição vem junto porque a conversa é do servidor. */
type Turno = { pergunta: string; encerrar: boolean; indice: number; total: number; transcricao: Troca[] };

function escutaDoNavegador(): SpeechRecognitionConstrutor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/** Uma voz em português do navegador, quando houver; sem ela a entrevistadora fala com a voz padrão. */
function vozPortuguesa(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis?.getVoices?.() ?? [];
  return vozes.find((v) => v.lang?.toLowerCase().startsWith("pt-br")) ?? vozes.find((v) => v.lang?.toLowerCase().startsWith("pt")) ?? null;
}

/**
 * Tudo o que esta sala precisa. Exportado porque a sala do agente conversacional
 * (components/SalaAgenteCandidato.tsx) o carrega inteiro: a queda para o nível 2 tem de ser imediata,
 * sem uma segunda volta ao servidor para descobrir com o que continuar a conversa.
 */
export type PropsSalaCandidato = {
  /** O código do link público: é ele que identifica esta conversa nas rotas. */
  codigo: string;
  tentativaAtual?: number;
  cargo: string;
  primeiroNome: string;
  /** A voz natural da entrevistadora está conectada; sem ela, quem fala é o próprio navegador. */
  vozLigada: boolean;
  /** O teste das boas-vindas passou: este navegador escuta e o microfone foi liberado. */
  porVoz: boolean;
  /** O áudio deste navegador já foi liberado por um gesto (o "Começar a entrevista"). */
  audioLiberado: boolean;
  /** Link antigo, sem entrevista guardada: a conversa viaja no corpo de cada turno. */
  conversaNoNavegador?: boolean;
  onFinalizar: (falas: Troca[]) => void;
};

export function SalaCandidato({
  codigo,
  tentativaAtual = 1,
  cargo,
  primeiroNome,
  vozLigada,
  porVoz,
  audioLiberado,
  conversaNoNavegador = false,
  onFinalizar,
}: PropsSalaCandidato) {
  const [falas, setFalas] = useState<Troca[]>([]);
  const [estado, setEstado] = useState<EstadoConversa>("pensando");
  const [modo, setModo] = useState<"voz" | "texto">(porVoz ? "voz" : "texto");
  const [escuta, setEscuta] = useState<ModoEscuta>("livre");
  const [aguardandoFim, setAguardandoFim] = useState(false);
  const pausaRef = useRef<ReturnType<typeof criarPausaDespedida> | null>(null);
  const pararFalaRef = useRef<(() => void) | null>(null);
  const geracaoFalaRef = useRef(0);
  const adiarFim = useCallback(() => { pausaRef.current?.cancelar(); setAguardandoFim(false); }, []);
  const [parcial, setParcial] = useState("");
  const [digitado, setDigitado] = useState("");
  const [indice, setIndice] = useState(0);
  const [total, setTotal] = useState(0);
  // Falha no meio da conversa: fica DENTRO da sala, com "Tentar de novo", para a entrevista retomar
  // exatamente do turno atual — sair da sala apagaria as falas já trocadas.
  const [falha, setFalha] = useState<ErroLido | null>(null);
  const [falhaAbertura, setFalhaAbertura] = useState(false);
  // A voz natural caiu (sem crédito, chave recusada, serviço fora): a conversa segue pela voz do
  // navegador e o aviso explica por quê, uma vez só.
  const [avisoVoz, setAvisoVoz] = useState<ErroLido | null>(null);
  const [motivoTexto, setMotivoTexto] = useState("");
  // Recarregou a página: o navegador só toca som depois de um gesto, então a conversa espera um toque.
  const [precisaToque, setPrecisaToque] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const { confirmar, Dialogo } = useConfirmacao();

  const chatRef = useRef<HTMLDivElement>(null);
  const escutaAtivaRef = useRef<SessaoEscuta | null>(null);
  const parcialRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Os manipuladores da escuta são criados uma vez por turno e vivem fora do React: eles precisam ler
  // o valor **atual** de cada coisa, não o que existia quando foram criados.
  const estadoRef = useRef<EstadoConversa>("pensando");
  const escutaModoRef = useRef<ModoEscuta>(escuta);
  const modoRef = useRef<"voz" | "texto">(porVoz ? "voz" : "texto");
  const falasRef = useRef<Troca[]>([]);
  const fechandoRef = useRef(false);
  const iniciouRef = useRef(false);
  const gestoRef = useRef(audioLiberado);
  // A voz natural desistiu nesta conversa: não adianta pedir de novo a cada pergunta.
  const vozDesistiuRef = useRef(false);
  // O último turno enviado, para "Tentar de novo" reenviar com a MESMA ordem — é a ordem que impede a
  // resposta de entrar duas vezes quando o que se perdeu foi a resposta do servidor.
  const turnoRef = useRef<{ resposta: string; ordem: number } | null>(null);
  const iniciarEscutaRef = useRef<(() => void) | null>(null);
  const continuarRef = useRef<((atual: Turno | null) => void) | null>(null);
  // A conversa lida na abertura, guardada para o toque de "Continuar a conversa" retomar do mesmo
  // ponto — inclusive quando o que estava guardado já era a despedida.
  const atualRef = useRef<Turno | null>(null);

  const respostas = falas.filter((f) => f.papel === "candidato").length;

  function guardarEstado(novo: EstadoConversa) {
    estadoRef.current = novo;
    setEstado(novo);
  }

  function guardarFalas(novas: Troca[]) {
    falasRef.current = novas;
    setFalas(novas);
  }

  const pararEscuta = useCallback(() => {
    escutaAtivaRef.current?.abort();
    escutaAtivaRef.current = null;
  }, []);

  /** Navegador sem escuta ou microfone negado: a conversa continua por escrito, de onde parou. */
  const cairParaTexto = useCallback(
    (motivo: "navegador" | "microfone" | "servico") => {
      pararEscuta();
      const reconhecido = parcialRef.current;
      parcialRef.current = "";
      if (reconhecido) setDigitado((anterior) => [anterior, reconhecido].filter(Boolean).join(" "));
      setParcial("");
      setMotivoTexto(
        motivo === "navegador"
          ? "Este navegador não consegue escutar a sua voz. Você pode responder digitando, ou abrir este mesmo endereço no Chrome para conversar falando."
          : motivo === "servico"
            ? "Não foi possível continuar o reconhecimento de voz. Revise o trecho reconhecido e complete sua resposta por escrito, ou tente falar novamente."
          : "Sem o microfone, a conversa segue por escrito. Se preferir falar, libere o microfone nas permissões do navegador e recarregue a página."
      );
      modoRef.current = "texto";
      setModo("texto");
      guardarEstado("parado");
    },
    [pararEscuta]
  );

  /** Toca o áudio recebido do servidor e só devolve quando ele termina. */
  const tocar = useCallback((blob: Blob, texto: string) => {
    return new Promise<void>((resolver) => {
      const endereco = URL.createObjectURL(blob);
      const audio = new Audio(endereco);
      audioRef.current = audio;
      let terminou = false;
      const pronto = () => {
        if (terminou) return;
        terminou = true;
        clearTimeout(prazo);
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        URL.revokeObjectURL(endereco);
        if (audioRef.current === audio) audioRef.current = null;
        resolver();
      };
      const prazo = setTimeout(pronto, limiteDaFala(texto));
      pararFalaRef.current = pronto;
      audio.onended = pronto;
      audio.onerror = pronto;
      audio.play().catch((err) => {
        console.error("O áudio da entrevistadora não pôde ser tocado", err);
        pronto();
      });
    });
  }, []);

  /** A voz do próprio navegador: o caminho padrão, que não exige nada conectado. */
  const sintetizar = useCallback((texto: string) => {
    return new Promise<void>((resolver) => {
      const sintese = window.speechSynthesis;
      if (!sintese) {
        resolver();
        return;
      }
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      const vozEscolhida = vozPortuguesa();
      if (vozEscolhida) fala.voice = vozEscolhida;
      let respondido = false;
      const pronto = () => {
        if (respondido) return;
        respondido = true;
        clearTimeout(prazo);
        clearTimeout(conferencia);
        resolver();
      };
      const prazo = setTimeout(pronto, limiteDaFala(texto));
      pararFalaRef.current = pronto;
      fala.onend = pronto;
      fala.onerror = pronto;
      sintese.cancel();
      sintese.speak(fala);
      // Aparelho sem nenhuma voz instalada aceita o pedido e não fala nada — e também não avisa. Sem
      // esta conferência, a vez do candidato só voltaria quando o prazo acima estourasse.
      const conferencia = setTimeout(() => {
        if (!sintese.speaking && !sintese.pending) pronto();
      }, CONFERIR_SE_FALA_MS);
    });
  }, []);

  const dizer = useCallback(
    async (texto: string) => {
      if (!texto || !gestoRef.current || fechandoRef.current || modoRef.current === "texto") return;
      const geracao = geracaoFalaRef.current;
      pararEscuta();
      guardarEstado("falando");
      if (vozLigada && !vozDesistiuRef.current) {
        try {
          const r = await fetch(`/api/entrevista/candidato/${codigo}/voz?texto=${encodeURIComponent(texto)}`, { signal: AbortSignal.timeout(10000) });
          if (fechandoRef.current || geracao !== geracaoFalaRef.current) return;
          if (r.ok) {
            const blob = await r.blob();
            if (fechandoRef.current || geracao !== geracaoFalaRef.current) return;
            await tocar(blob, texto);
            return;
          }
          vozDesistiuRef.current = true;
          setAvisoVoz(await lerErro(r));
        } catch (err) {
          vozDesistiuRef.current = true;
          setAvisoVoz(await lerErro(err));
        }
      }
      if (!fechandoRef.current && geracao === geracaoFalaRef.current) await sintetizar(texto);
    },
    [codigo, sintetizar, tocar, vozLigada, pararEscuta]
  );

  const finalizar = useCallback(() => {
    if (fechandoRef.current) return;
    fechandoRef.current = true;
    pausaRef.current?.cancelar();
    pararEscuta();
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    setEncerrando(true);
    onFinalizar(falasRef.current);
  }, [onFinalizar, pararEscuta]);

  useEffect(() => {
    const pausa = criarPausaDespedida(finalizar);
    pausaRef.current = pausa;
    return () => pausa.cancelar();
  }, [finalizar]);

  const aguardarDespedida = useCallback(() => {
    guardarEstado("parado");
    setAguardandoFim(true);
    pausaRef.current?.aguardar();
    if (modoRef.current === "voz" && escutaModoRef.current === "livre") iniciarEscutaRef.current?.();
  }, []);

  /**
   * Um turno: manda a última resposta e recebe a fala seguinte.
   *
   * `ordem` viaja junto e é calculada ANTES de a resposta entrar na tela — é ela que diz "esta é a
   * minha resposta de número N", e o servidor usa isso para não gravar a mesma resposta duas vezes
   * quando "Tentar de novo" reenvia o turno inteiro.
   */
  const enviarTurno = useCallback(
    async (resposta: string, ordem: number) => {
      guardarEstado("pensando");
      setFalha(null);
      setParcial("");
      turnoRef.current = { resposta, ordem };
      try {
        const corpo = {
          resposta,
          ordem,
          nivel: modoRef.current === "voz" ? "navegador" : "texto",
          // Só os links antigos precisam disto: eles não têm entrevista guardada no servidor.
          historico: conversaNoNavegador ? falasRef.current : undefined,
        };
        const r = await fetch(`/api/entrevista/candidato/${codigo}/falar`, { method: "POST", headers: { "Content-Type": "application/json", "X-Entrevista-Tentativa": String(tentativaAtual) }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(45000) });
        if (!r.ok) {
          setFalha(await lerErro(r));
          guardarEstado("parado");
          return;
        }
        const turno = (await r.json()) as Turno;
        if (fechandoRef.current) return;
        guardarFalas(turno.transcricao.length ? turno.transcricao : [...falasRef.current, { papel: "entrevistadora", texto: turno.pergunta }]);
        setIndice(turno.indice);
        setTotal(turno.total);
        const geracao = geracaoFalaRef.current;
        await dizer(turno.pergunta);
        if (fechandoRef.current || geracao !== geracaoFalaRef.current) return;
        if (turno.encerrar) {
          aguardarDespedida();
          return;
        }
        guardarEstado("parado");
        if (modoRef.current === "voz" && escutaModoRef.current === "livre") iniciarEscutaRef.current?.();
      } catch (err) {
        if (fechandoRef.current) return;
        setFalha(err instanceof Error && err.name === "TimeoutError"
          ? { mensagem: "A preparação demorou mais que o esperado. Tente novamente; sua conversa será retomada sem apagar as respostas." }
          : await lerErro(err));
        guardarEstado("parado");
      }
    },
    [codigo, tentativaAtual, conversaNoNavegador, dizer, aguardarDespedida]
  );

  const responder = useCallback(
    (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || fechandoRef.current) return;
      adiarFim();
      const ordem = falasRef.current.filter((f) => f.papel === "candidato").length + 1;
      guardarFalas([...falasRef.current, { papel: "candidato", texto: limpo }]);
      void enviarTurno(limpo, ordem);
    },
    [enviarTurno, adiarFim]
  );

  const iniciarEscuta = useCallback(() => {
    if (fechandoRef.current || modoRef.current !== "voz" || estadoRef.current !== "parado") return;
    const Construtor = escutaDoNavegador();
    if (!Construtor) {
      cairParaTexto("navegador");
      return;
    }
    pararEscuta();
    parcialRef.current = "";
    setParcial("");
    setMotivoTexto("");
    escutaAtivaRef.current = criarEscuta({
      reconhecimento: new Construtor(),
      automatico: escutaModoRef.current === "livre",
      onEstado: guardarEstado,
      onTexto: (texto) => {
        if (texto.trim()) adiarFim();
        parcialRef.current = texto;
        setParcial(texto);
      },
      onFim: (dito) => {
        if (fechandoRef.current) return;
        parcialRef.current = "";
        setParcial("");
        guardarEstado("parado");
        if (!dito) {
          setMotivoTexto("Não identificamos uma fala. Toque no microfone para tentar novamente ou digite sua resposta.");
        } else if (escutaModoRef.current === "livre") responder(dito);
        else setDigitado((anterior) => [anterior, dito].filter(Boolean).join(" "));
      },
      onFalha: (erro, texto) => {
        parcialRef.current = texto;
        cairParaTexto(erro === "not-allowed" || erro === "service-not-allowed" ? "microfone" : "servico");
      },
    });
  }, [cairParaTexto, pararEscuta, responder, adiarFim]);

  /** Retoma a conversa de onde o servidor a deixou: fala a pergunta atual e devolve a vez. */
  const continuar = useCallback(
    async (atual: Turno | null) => {
      if (atual?.pergunta) {
        const geracao = geracaoFalaRef.current;
        await dizer(atual.pergunta);
        if (fechandoRef.current || geracao !== geracaoFalaRef.current) return;
        if (atual.encerrar) {
          aguardarDespedida();
          return;
        }
        guardarEstado("parado");
        if (modoRef.current === "voz" && escutaModoRef.current === "livre") iniciarEscutaRef.current?.();
        return;
      }
      await enviarTurno("", falasRef.current.filter((f) => f.papel === "candidato").length);
    },
    [dizer, enviarTurno, aguardarDespedida]
  );

  // Os caminhos que se chamam de dentro de um manipulador da escuta viajam por referência, atualizada
  // em efeito: escrever em `ref.current` durante a renderização é erro de lint (`react-hooks/refs`) e
  // esconderia o laço — `iniciarEscuta` chama `responder`, que volta a `iniciarEscuta`.
  useEffect(() => {
    iniciarEscutaRef.current = iniciarEscuta;
  }, [iniciarEscuta]);

  useEffect(() => {
    continuarRef.current = (atual) => void continuar(atual);
  }, [continuar]);

  useEffect(() => {
    escutaModoRef.current = escuta;
  }, [escuta]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [falas]);

  const carregarConversa = useCallback(async () => {
    guardarEstado("pensando");
    setFalha(null);
    setFalhaAbertura(false);
    try {
      const r = await carregarConversaComRecuperacao(`/api/entrevista/candidato/${codigo}/conversa`);
      if (!r.ok) throw r;
      const atual = (await r.json()) as Turno;
      if (fechandoRef.current) return;
      atualRef.current = atual;
      guardarFalas(atual.transcricao);
      setIndice(atual.indice);
      setTotal(atual.total);
      if (gestoRef.current) continuarRef.current?.(atual);
      else setPrecisaToque(true);
    } catch (erro) {
      if (fechandoRef.current) return;
      setFalha(await lerErro(erro));
      setFalhaAbertura(true);
      guardarEstado("parado");
    }
  }, [codigo]);

  // Falhar ao retomar não equivale a uma conversa vazia: pede nova leitura antes de avançar.
  useEffect(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    void carregarConversa();
  }, [carregarConversa]);

  // Sair da tela no meio da conversa não pode deixar o microfone aberto nem uma voz falando sozinha.
  useEffect(() => {
    fechandoRef.current = false;
    return () => {
      fechandoRef.current = true;
      pausaRef.current?.cancelar();
      pararFalaRef.current?.();
      escutaAtivaRef.current?.abort();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function alternarMicrofone() {
    adiarFim();
    if (estadoRef.current === "falando") {
      geracaoFalaRef.current++;
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      pararFalaRef.current?.();
      guardarEstado("parado");
      iniciarEscuta();
      return;
    }
    if (estadoRef.current === "ouvindo") {
      try {
        escutaAtivaRef.current?.stop();
      } catch (err) {
        console.error("Não foi possível fechar o turno da escuta", err);
      }
      return;
    }
    if (estado === "parado") iniciarEscuta();
  }

  function enviarDigitado() {
    if (estadoRef.current !== "parado" || encerrando || falha) return;
    const texto = digitado.trim();
    if (!texto) return;
    setDigitado("");
    setParcial("");
    responder(texto);
  }

  function irParaTexto() {
    adiarFim();
    const reconhecido = parcialRef.current;
    if (reconhecido) setDigitado((anterior) => [anterior, reconhecido].filter(Boolean).join(" "));
    parcialRef.current = "";
    pararEscuta();
    modoRef.current = "texto";
    setModo("texto");
    setParcial("");
    if (["iniciando", "ouvindo", "transcrevendo"].includes(estadoRef.current)) guardarEstado("parado");
  }

  function voltarParaVoz() {
    adiarFim();
    setMotivoTexto("");
    setEscuta("livre");
    modoRef.current = "voz";
    setModo("voz");
  }

  /** O toque que libera o áudio de quem recarregou a página e retoma a conversa. */
  function retomar() {
    gestoRef.current = true;
    setPrecisaToque(false);
    void continuar(atualRef.current);
  }

  async function onEncerrar() {
    if (encerrando) return;
    const confirmado = await confirmar("Quer encerrar a entrevista agora? As respostas que você já deu são enviadas do mesmo jeito.", {
      confirmarRotulo: "Encerrar",
      cancelarRotulo: "Continuar a conversa",
    });
    if (!confirmado) return;
    finalizar();
  }

  const podeFalarAgora = estado === "parado" || estado === "ouvindo" || estado === "falando";
  const manual = escuta === "toque";

  return (
    <div className="room reveal">
      {Dialogo}
      <div className="room-head">
        <div className={`avatar${estado === "falando" ? " falando" : ""}`}>
          <span>E</span>
        </div>
        <div className="room-head-text">
          <h2>Entrevistadora</h2>
          <div className="who">
            {cargo}
            {total > 0 && <span> · Pergunta {Math.min(indice, total)} de {total}</span>}
          </div>
        </div>
        {respostas >= 2 && (
          <button className="btn-ghost" type="button" onClick={onEncerrar} disabled={encerrando || estado !== "parado" || !!digitado.trim() || !!falha} title={digitado.trim() ? "Envie ou apague o rascunho antes de encerrar" : undefined}>
            Encerrar entrevista
          </button>
        )}
      </div>

      {motivoTexto && <Aviso tom="warn">{motivoTexto}</Aviso>}
      {avisoVoz && <Aviso tom="warn">{avisoVoz.mensagem}</Aviso>}

      {estado === "pensando" && !falas.length && !falha && <p className="text-sm text-muted text-center" role="status">Estamos preparando a primeira pergunta. Isso pode levar alguns segundos. Se não conseguirmos concluir, você poderá tentar novamente aqui.</p>}

      <div className="chat" ref={chatRef} aria-live="polite">
        {falas.map((f, i) => (
          <div key={i} className={`bubble ${f.papel}`}>
            <span className="bubble-autor">{f.papel === "entrevistadora" ? "Entrevistadora" : primeiroNome}</span>
            <p>{f.texto}</p>
          </div>
        ))}
        {parcial && (
          <div className="bubble candidato opacity-60">
            <span className="bubble-autor">{primeiroNome}</span>
            <p>{parcial}</p>
          </div>
        )}
      </div>

      {falha && (
        <ErrorBox
          mensagem={falha.mensagem}
          codigo={falha.codigo as CodigoErroIA | undefined}
          onTentarNovamente={() => {
            if (falhaAbertura) {
              void carregarConversa();
              return;
            }
            const ultimo = turnoRef.current;
            void enviarTurno(ultimo?.resposta ?? "", ultimo?.ordem ?? falasRef.current.filter((f) => f.papel === "candidato").length);
          }}
        />
      )}

      <div className="resposta">
        {aguardandoFim && <p role="status" className="text-sm text-muted text-center">Vamos encerrar em alguns segundos. Se ainda tiver uma dúvida, pode falar ou digitar.</p>}
        <div className="text-center text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted" aria-live="polite">
          {encerrando ? "Enviando as suas respostas..." : precisaToque ? "Entrevista em andamento" : estado === "pensando" && !falas.length ? "Preparando sua entrevista..." : ROTULO_ESTADO[estado]}
        </div>

        {precisaToque ? (
          <button type="button" className="btn-primary" onClick={retomar}>
            Continuar a conversa
          </button>
        ) : modo === "voz" ? (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              aria-label={estado === "falando" ? "Interromper e falar" : estado === "ouvindo" ? "Parar gravação" : "Começar gravação"}
              aria-pressed={estado === "ouvindo"}
              className={`w-[76px] h-[76px] rounded-full grid place-items-center text-white transition-transform disabled:opacity-45 ${estado === "ouvindo" ? "bg-danger scale-105" : "bg-accent"}`}
              disabled={!podeFalarAgora || encerrando || !!falha}
              onClick={alternarMicrofone}
            >
              <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
                <path d="M12 19v2" />
              </svg>
            </button>
            <p className="text-muted text-[12.5px] text-center">
              {estado === "falando" ? "Microfone pausado durante a fala. Toque para interromper e falar." : manual ? (estado === "ouvindo" ? "Gravando. Toque novamente para parar e revisar sua resposta." : "Toque para gravar, sem segurar. Revise o texto antes de enviar.") : "Mãos livres: alguns segundos de silêncio enviam a resposta. Precisa pensar? Diga \"só um momento\". Não ouviu? Peça para repetir."}
            </p>
            <button type="button" className="btn-ghost !w-auto text-[13px]" disabled={estado !== "parado" || !!digitado.trim()} onClick={() => setEscuta(manual ? "livre" : "toque")}>
              {manual ? "Usar envio automático por silêncio" : "Revisar antes de enviar"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted text-center">Escreva sua resposta abaixo.</p>
        )}

        {!precisaToque && (modo === "texto" || (manual && digitado)) && (
          <div className="flex flex-col gap-2">
            <label htmlFor="resposta-candidato" className="text-sm font-semibold">{modo === "voz" ? "Revise sua resposta" : "Sua resposta"}</label>
            <textarea
              id="resposta-candidato"
              className="input min-h-[60px] resize-y"
              rows={2}
              placeholder="Escreva a sua resposta..."
              value={digitado}
              onChange={(e) => { adiarFim(); setDigitado(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviarDigitado();
                }
              }}
              disabled={estado !== "parado" || encerrando || !!falha}
            />
            <button type="button" className="btn-primary !w-auto self-end" disabled={!digitado.trim() || estado !== "parado" || encerrando || !!falha} onClick={enviarDigitado}>
              Enviar resposta
            </button>
          </div>
        )}

        {!precisaToque && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {modo === "voz" ? (
              <button type="button" className="btn-link text-[13px]" onClick={irParaTexto}>
                Prefiro digitar
              </button>
            ) : (
              escutaDoNavegador() && (
                <button type="button" className="btn-link text-[13px]" onClick={voltarParaVoz}>
                  Voltar a falar
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
