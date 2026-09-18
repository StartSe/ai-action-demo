"use client";
// A conversa do candidato (US-018, nível 2 do PRD): ele fala, a entrevistadora responde em voz alta.
//
// Substitui `components/Sala.tsx` no link público — aquela ficou sendo só a prévia do gestor, que
// digita as respostas e não precisa de nada disto. Três coisas moldaram esta tela:
//
//  1. **Mãos livres é o padrão.** O navegador escuta enquanto a pessoa fala e dois segundos de
//     silêncio encerram o turno; "Segurar para falar" existe para quem está num lugar barulhento, e é
//     o jeito natural de quem abriu no celular. A escuta é do navegador (Web Speech API) e a fala sai
//     da voz natural quando a empresa a conectou — a chave nunca vem para cá — ou da voz do próprio
//     navegador, que funciona em qualquer instalação, sem nada configurado.
//  2. **A conversa mora no servidor.** A cada turno vai só a última resposta; a transcrição fica em
//     `mensagens_entrevista`. Recarregar a página volta com as falas na tela e na pergunta em que
//     parou, e o parecer lê o que foi gravado, não o que este navegador lembrava.
//  3. **Nada aqui é um beco.** Navegador sem escuta, microfone negado, modelo que não respondeu:
//     todos terminam em algo que o CANDIDATO pode fazer — digitar, tentar de novo, encerrar. Ele não
//     configura nada e não recebe recado de quem administra o app.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Aviso, ErrorBox, lerErro, useConfirmacao, type ErroLido } from "./ui";
import type { CodigoErroIA } from "@/lib/ai";
import type { Troca } from "@/lib/types";

// A tipagem da escuta do navegador (`SpeechRecognition`) mora em lib/fala.d.ts, no escopo global: as
// boas-vindas usam a mesma, e duas declarações locais não convivem.

/** Silêncio que encerra o turno no modo mãos livres. */
const SILENCIO_FIM_DE_TURNO_MS = 2000;
/** Trava contra o laço de reinício quando o navegador corta a escuta sozinho, sem ter ouvido nada. */
const MINIMO_ENTRE_ESCUTAS_MS = 400;
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

type EstadoConversa = "parado" | "ouvindo" | "pensando" | "falando";
type ModoEscuta = "segurar" | "livre";

const ROTULO_ESTADO: Record<EstadoConversa, string> = {
  parado: "Sua vez de falar",
  ouvindo: "Ouvindo...",
  pensando: "Pensando...",
  falando: "Falando...",
};

/** O que cada turno devolve (lib/roteiro.ts). A transcrição vem junto porque a conversa é do servidor. */
type Turno = { pergunta: string; encerrar: boolean; indice: number; total: number; transcricao: Troca[] };

function escutaDoNavegador(): SpeechRecognitionConstrutor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/**
 * Esta tela tem toque? O celular começa em "segurar para falar" e o computador em mãos livres.
 *
 * Lido por `useSyncExternalStore` e não em `useState` + efeito: é o jeito do React de ler algo que só
 * existe no navegador sem quebrar a hidratação (o servidor escreveria "Segure o botão" e o navegador,
 * "Toque para falar").
 */
function assinarToque(avisar: () => void): () => void {
  const consulta = window.matchMedia("(pointer: coarse)");
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
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
  // `null` = ninguém escolheu ainda, então vale o jeito natural do aparelho (toque na tela ou não).
  const [escutaEscolhida, setEscutaEscolhida] = useState<ModoEscuta | null>(null);
  const [parcial, setParcial] = useState("");
  const [digitado, setDigitado] = useState("");
  const [indice, setIndice] = useState(0);
  const [total, setTotal] = useState(0);
  // Falha no meio da conversa: fica DENTRO da sala, com "Tentar de novo", para a entrevista retomar
  // exatamente do turno atual — sair da sala apagaria as falas já trocadas.
  const [falha, setFalha] = useState<ErroLido | null>(null);
  // A voz natural caiu (sem crédito, chave recusada, serviço fora): a conversa segue pela voz do
  // navegador e o aviso explica por quê, uma vez só.
  const [avisoVoz, setAvisoVoz] = useState<ErroLido | null>(null);
  const [motivoTexto, setMotivoTexto] = useState("");
  // Recarregou a página: o navegador só toca som depois de um gesto, então a conversa espera um toque.
  const [precisaToque, setPrecisaToque] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const { confirmar, Dialogo } = useConfirmacao();

  const toqueNaTela = useSyncExternalStore(
    assinarToque,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false
  );
  const escuta: ModoEscuta = escutaEscolhida ?? (toqueNaTela ? "segurar" : "livre");

  const chatRef = useRef<HTMLDivElement>(null);
  const escutaAtivaRef = useRef<SpeechRecognition | null>(null);
  const bufferRef = useRef("");
  const silencioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ultimoInicioRef = useRef(0);
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

  const limparSilencio = useCallback(() => {
    if (silencioRef.current) clearTimeout(silencioRef.current);
    silencioRef.current = null;
  }, []);

  const pararEscuta = useCallback(() => {
    limparSilencio();
    const atual = escutaAtivaRef.current;
    escutaAtivaRef.current = null;
    if (!atual) return;
    atual.onresult = null;
    atual.onerror = null;
    atual.onend = null;
    try {
      atual.abort();
    } catch (err) {
      console.error("Não foi possível encerrar a escuta do navegador", err);
    }
  }, [limparSilencio]);

  /** Navegador sem escuta ou microfone negado: a conversa continua por escrito, de onde parou. */
  const cairParaTexto = useCallback(
    (motivo: "navegador" | "microfone") => {
      pararEscuta();
      setMotivoTexto(
        motivo === "navegador"
          ? "Este navegador não consegue escutar a sua voz. Você pode responder digitando, ou abrir este mesmo endereço no Chrome para conversar falando."
          : "Sem o microfone, a conversa segue por escrito. Se preferir falar, libere o microfone nas permissões do navegador e recarregue a página."
      );
      modoRef.current = "texto";
      setModo("texto");
      guardarEstado("parado");
    },
    [pararEscuta]
  );

  /** Toca o áudio recebido do servidor e só devolve quando ele termina. */
  const tocar = useCallback((blob: Blob) => {
    return new Promise<void>((resolver) => {
      const endereco = URL.createObjectURL(blob);
      const audio = new Audio(endereco);
      audioRef.current = audio;
      const pronto = () => {
        URL.revokeObjectURL(endereco);
        if (audioRef.current === audio) audioRef.current = null;
        resolver();
      };
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
      if (!texto || !gestoRef.current) return;
      guardarEstado("falando");
      if (vozLigada && !vozDesistiuRef.current) {
        try {
          const r = await fetch(`/api/entrevista/candidato/${codigo}/voz?texto=${encodeURIComponent(texto)}`);
          if (r.ok) {
            await tocar(await r.blob());
            return;
          }
          vozDesistiuRef.current = true;
          setAvisoVoz(await lerErro(r));
        } catch (err) {
          vozDesistiuRef.current = true;
          setAvisoVoz(await lerErro(err));
        }
      }
      await sintetizar(texto);
    },
    [codigo, sintetizar, tocar, vozLigada]
  );

  const finalizar = useCallback(() => {
    fechandoRef.current = true;
    pararEscuta();
    window.speechSynthesis?.cancel();
    setEncerrando(true);
    onFinalizar(falasRef.current);
  }, [onFinalizar, pararEscuta]);

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
        const r = await fetch(`/api/entrevista/candidato/${codigo}/falar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        if (!r.ok) {
          setFalha(await lerErro(r));
          guardarEstado("parado");
          return;
        }
        const turno = (await r.json()) as Turno;
        guardarFalas(turno.transcricao.length ? turno.transcricao : [...falasRef.current, { papel: "entrevistadora", texto: turno.pergunta }]);
        setIndice(turno.indice);
        setTotal(turno.total);
        await dizer(turno.pergunta);
        if (turno.encerrar) {
          finalizar();
          return;
        }
        guardarEstado("parado");
        if (modoRef.current === "voz" && escutaModoRef.current === "livre") iniciarEscutaRef.current?.();
      } catch (err) {
        setFalha(await lerErro(err));
        guardarEstado("parado");
      }
    },
    [codigo, conversaNoNavegador, dizer, finalizar]
  );

  const responder = useCallback(
    (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || fechandoRef.current) return;
      const ordem = falasRef.current.filter((f) => f.papel === "candidato").length + 1;
      guardarFalas([...falasRef.current, { papel: "candidato", texto: limpo }]);
      void enviarTurno(limpo, ordem);
    },
    [enviarTurno]
  );

  const iniciarEscuta = useCallback(() => {
    if (fechandoRef.current || modoRef.current !== "voz") return;
    const Construtor = escutaDoNavegador();
    if (!Construtor) {
      cairParaTexto("navegador");
      return;
    }
    // Duas aberturas de escuta coladas uma na outra é o navegador cortando a escuta sozinho em laço.
    // A vez volta a ser do candidato (um toque no microfone recomeça) em vez de a tela ficar parada em
    // "Ouvindo..." sem microfone nenhum aberto do outro lado.
    if (Date.now() - ultimoInicioRef.current < MINIMO_ENTRE_ESCUTAS_MS) {
      guardarEstado("parado");
      return;
    }
    ultimoInicioRef.current = Date.now();

    pararEscuta();
    bufferRef.current = "";
    setParcial("");

    const maosLivres = escutaModoRef.current === "livre";
    const r = new Construtor();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = maosLivres;
    r.maxAlternatives = 1;

    r.onresult = (evento) => {
      let interino = "";
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        if (resultado.isFinal) bufferRef.current += `${resultado[0].transcript} `;
        else interino += resultado[0].transcript;
      }
      setParcial(`${bufferRef.current}${interino}`.trim());
      // Fim de turno por silêncio: cada pedaço reconhecido reinicia a contagem, e os 2 s sem nada novo
      // são o que separa "parei para pensar" de "terminei de responder".
      if (escutaModoRef.current === "livre") {
        limparSilencio();
        silencioRef.current = setTimeout(() => {
          if (bufferRef.current.trim()) {
            try {
              escutaAtivaRef.current?.stop();
            } catch (err) {
              console.error("Não foi possível fechar o turno da escuta", err);
            }
          }
        }, SILENCIO_FIM_DE_TURNO_MS);
      }
    };

    r.onerror = (evento) => {
      if (evento.error === "not-allowed" || evento.error === "service-not-allowed") {
        cairParaTexto("microfone");
        return;
      }
      // "no-speech" e "aborted" são o normal de quem parou de falar: não têm o que dizer ao candidato.
      if (evento.error !== "no-speech" && evento.error !== "aborted") {
        console.error("Escuta do navegador falhou", evento.error);
      }
    };

    r.onend = () => {
      limparSilencio();
      if (escutaAtivaRef.current !== r || fechandoRef.current) return;
      escutaAtivaRef.current = null;
      const dito = bufferRef.current.trim();
      bufferRef.current = "";
      if (dito) {
        responder(dito);
        return;
      }
      // O Chrome corta a escuta sozinho depois de um tempo em silêncio: em mãos livres ela volta, e no
      // "segurar para falar" a vez simplesmente continua sendo do candidato.
      if (escutaModoRef.current === "livre" && estadoRef.current === "ouvindo") iniciarEscutaRef.current?.();
      else guardarEstado("parado");
    };

    escutaAtivaRef.current = r;
    try {
      r.start();
      guardarEstado("ouvindo");
    } catch (err) {
      console.error("Não foi possível começar a escuta do navegador", err);
      guardarEstado("parado");
    }
  }, [cairParaTexto, limparSilencio, pararEscuta, responder]);

  /** Retoma a conversa de onde o servidor a deixou: fala a pergunta atual e devolve a vez. */
  const continuar = useCallback(
    async (atual: Turno | null) => {
      if (atual?.pergunta) {
        await dizer(atual.pergunta);
        if (atual.encerrar) {
          finalizar();
          return;
        }
        guardarEstado("parado");
        if (modoRef.current === "voz" && escutaModoRef.current === "livre") iniciarEscutaRef.current?.();
        return;
      }
      await enviarTurno("", falasRef.current.filter((f) => f.papel === "candidato").length);
    },
    [dizer, enviarTurno, finalizar]
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

  // A abertura: lê do servidor a conversa que já existe (quem recarregou a página volta com ela na
  // tela) e só então segue. Sem o áudio liberado por um gesto, a sala espera um toque em vez de falar
  // no vazio — os navegadores não tocam som numa página que a pessoa acabou de recarregar.
  useEffect(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    fetch(`/api/entrevista/candidato/${codigo}/conversa`)
      .then(async (r) => (r.ok ? ((await r.json()) as Turno) : null))
      .catch(() => null)
      .then((atual) => {
        atualRef.current = atual;
        if (atual?.transcricao.length) {
          guardarFalas(atual.transcricao);
          setIndice(atual.indice);
          setTotal(atual.total);
        }
        if (gestoRef.current) continuarRef.current?.(atual);
        else setPrecisaToque(true);
      });
  }, [codigo]);

  // Sair da tela no meio da conversa não pode deixar o microfone aberto nem uma voz falando sozinha.
  useEffect(() => {
    return () => {
      fechandoRef.current = true;
      const atual = escutaAtivaRef.current;
      if (atual) {
        atual.onresult = null;
        atual.onerror = null;
        atual.onend = null;
        try {
          atual.abort();
        } catch {
          // a escuta já tinha terminado
        }
      }
      if (silencioRef.current) clearTimeout(silencioRef.current);
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function alternarMicrofone() {
    if (estado === "ouvindo") {
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
    if (estado === "pensando" || estado === "falando" || encerrando) return;
    const texto = digitado.trim();
    if (!texto) return;
    setDigitado("");
    responder(texto);
  }

  function irParaTexto() {
    pararEscuta();
    modoRef.current = "texto";
    setModo("texto");
    setParcial("");
    if (estadoRef.current === "ouvindo") guardarEstado("parado");
  }

  function voltarParaVoz() {
    setMotivoTexto("");
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

  const podeFalarAgora = estado === "parado" || estado === "ouvindo";
  const segurando = escuta === "segurar";

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
          <button className="btn-ghost" type="button" onClick={onEncerrar} disabled={encerrando}>
            Encerrar entrevista
          </button>
        )}
      </div>

      {motivoTexto && <Aviso tom="warn">{motivoTexto}</Aviso>}
      {avisoVoz && <Aviso tom="warn">{avisoVoz.mensagem}</Aviso>}

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
            const ultimo = turnoRef.current;
            void enviarTurno(ultimo?.resposta ?? "", ultimo?.ordem ?? falasRef.current.filter((f) => f.papel === "candidato").length);
          }}
        />
      )}

      <div className="resposta">
        <div className="text-center text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted" aria-live="polite">
          {encerrando ? "Enviando as suas respostas..." : precisaToque ? "Entrevista em andamento" : ROTULO_ESTADO[estado]}
        </div>

        {precisaToque ? (
          <button type="button" className="btn-primary" onClick={retomar}>
            Continuar a conversa
          </button>
        ) : modo === "voz" ? (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              aria-label={estado === "ouvindo" ? "Parar de falar" : "Falar com a entrevistadora"}
              className={`w-[76px] h-[76px] rounded-full grid place-items-center text-white transition-transform disabled:opacity-45 ${estado === "ouvindo" ? "bg-danger scale-105" : "bg-accent"}`}
              disabled={!podeFalarAgora || encerrando}
              onClick={segurando ? undefined : alternarMicrofone}
              onPointerDown={segurando ? () => iniciarEscuta() : undefined}
              onPointerUp={segurando ? () => alternarMicrofone() : undefined}
              onPointerLeave={segurando && estado === "ouvindo" ? () => alternarMicrofone() : undefined}
            >
              <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
                <path d="M12 19v2" />
              </svg>
            </button>
            <p className="text-muted text-[12.5px] text-center">
              {segurando ? "Segure o botão enquanto fala e solte quando terminar." : "Toque para falar; quando você parar por 2 segundos, a entrevistadora responde."}
            </p>
            <button type="button" className="btn-ghost !w-auto text-[13px]" onClick={() => setEscutaEscolhida(segurando ? "livre" : "segurar")}>
              {segurando ? "Usar mãos livres" : "Usar segurar para falar"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <textarea
              className="input min-h-[60px] resize-y"
              rows={2}
              placeholder="Escreva a sua resposta..."
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviarDigitado();
                }
              }}
              disabled={estado === "pensando" || estado === "falando" || encerrando}
            />
            <button type="button" className="btn-primary !w-auto self-end" disabled={!digitado.trim() || estado === "pensando" || estado === "falando" || encerrando} onClick={enviarDigitado}>
              Responder
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
