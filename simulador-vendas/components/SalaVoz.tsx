"use client";
// A conversa do vendedor com o cliente simulado (US-015): ele abre o link, fala, e o cliente responde
// em voz alta — sem o gestor precisar configurar nada de voz.
//
// Duas coisas moldaram esta tela:
//
// 1. **A escuta e a fala são do navegador.** `SpeechRecognition` transcreve o que o vendedor diz e
//    `speechSynthesis` dá voz ao cliente. É o nível 2 do PRD e o padrão do app: funciona no Chrome de
//    qualquer celular, sem chave nenhuma. Quando o gestor conectou uma voz melhor, o áudio é gerado no
//    servidor (a chave nunca vem para cá) e a tela só toca o que recebe.
// 2. **A conversa mora no servidor.** A cada turno vai só a última fala; a transcrição fica em
//    `mensagens_sessao`. Recarregar a página não apaga a conversa, e a avaliação lê o que foi gravado,
//    não o que o navegador lembrava.
//
// Todo caminho que não dá certo — navegador sem escuta, microfone negado, modelo que não respondeu —
// termina em algo que o **vendedor** pode fazer: digitar, tentar de novo, ou encerrar e ver o
// resultado. Ele não configura nada e não recebe recado de gestor.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ResultadoSessao } from "@/app/page";
import { Aviso, lerErro } from "@/components/ui";
import type { Conversa } from "@/lib/types";
import type { AvaliacaoSessao } from "@/lib/avaliacao";
import type { Meta } from "@/lib/ai";

/** Silêncio que encerra o turno no modo mãos livres. */
const SILENCIO_FIM_DE_TURNO_MS = 2000;
/** A partir daqui a tela avisa que o tempo está acabando. */
const AVISO_TEMPO_SEG = 120;
/** Trava contra o laço de reinício quando o navegador corta a escuta sozinho, sem ter ouvido nada. */
const MINIMO_ENTRE_ESCUTAS_MS = 400;
/**
 * Rede de segurança do `speechSynthesis`, que às vezes não avisa que terminou: um teto proporcional ao
 * tamanho da fala (uma voz lenta faz ~11 caracteres por segundo), entre 3 e 15 segundos. Teto fixo e
 * generoso era pior — numa máquina sem voz instalada a sala ficava parada em "Falando..." sem som.
 */
function limiteDaFala(texto: string): number {
  return Math.min(15_000, Math.max(3_000, 1500 + texto.length * 90));
}

/** Tempo até conferir se o navegador realmente começou a falar; se não começou, não há o que esperar. */
const CONFERIR_SE_FALA_MS = 250;

type Papel = "vendedor" | "cliente";
export type Fala = { papel: Papel; texto: string };
type EstadoConversa = "parado" | "ouvindo" | "pensando" | "falando";
type ModoEscuta = "segurar" | "livre";
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
  sessaoId?: string;
};
type Fim = { resultado?: Resposta; semConversa?: boolean; semFeedback?: boolean };

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
};

const ROTULO_ESTADO: Record<EstadoConversa, string> = {
  parado: "Sua vez de falar",
  ouvindo: "Ouvindo...",
  pensando: "Pensando...",
  falando: "Falando...",
};

function relogio(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escutaDoNavegador(): SpeechRecognitionConstrutor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/**
 * Duas coisas desta tela o servidor não tem como saber: se quem abriu tem tela de toque (o celular
 * começa em "segurar para falar", o computador em mãos livres) e quanto tempo já passou da conversa.
 *
 * As duas são lidas com `useSyncExternalStore`, e não em `useState` + efeito, porque este é o jeito do
 * React de ler algo que **só existe no navegador** sem quebrar a hidratação: o `getServerSnapshot`
 * (o último argumento) é o que vale no HTML do servidor, e o valor do navegador entra depois, sem
 * divergência de texto. Feito com `useState(() => window...)` a tela acusava erro de hidratação no
 * celular, porque o servidor escrevia "Toque para falar" e o navegador, "Segure o botão".
 */
function assinarToque(avisar: () => void): () => void {
  const consulta = window.matchMedia("(pointer: coarse)");
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

/** Uma voz em português do navegador, quando houver; sem ela o cliente fala com a voz padrão. */
function vozPortuguesa(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis?.getVoices?.() ?? [];
  return vozes.find((v) => v.lang?.toLowerCase().startsWith("pt-br")) ?? vozes.find((v) => v.lang?.toLowerCase().startsWith("pt")) ?? null;
}

export function SalaVoz({ codigo, marca, nome, titulo, cliente, objetivo, duracaoMin, iniciadaEm, falasIniciais, porVoz, porTexto, vozDoServidor }: PropsSalaVoz) {
  const totalSeg = Math.max(1, duracaoMin) * 60;
  /** Segundo da conversa em que a fala aconteceu — é o que a avaliação usa para citar momentos. */
  const decorrido = useCallback(() => Math.floor((Date.now() - new Date(iniciadaEm).getTime()) / 1000), [iniciadaEm]);

  const [falas, setFalas] = useState<Fala[]>(falasIniciais);
  const [estado, setEstado] = useState<EstadoConversa>("parado");
  const [modo, setModo] = useState<"voz" | "texto">(porVoz ? "voz" : "texto");
  // `null` = ninguém escolheu ainda, então vale o jeito natural do aparelho (toque na tela ou não).
  const [escutaEscolhida, setEscutaEscolhida] = useState<ModoEscuta | null>(null);
  const [parcial, setParcial] = useState("");
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState("");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [fim, setFim] = useState<Fim | null>(null);
  const [encerrando, setEncerrando] = useState(false);

  const toqueNaTela = useSyncExternalStore(
    assinarToque,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
  const escuta: ModoEscuta = escutaEscolhida ?? (toqueNaTela ? "segurar" : "livre");

  // O cronômetro da tela é um espelho do relógio do servidor, que é quem decide o fim de verdade.
  const restante = useSyncExternalStore(
    (avisar) => {
      const tique = setInterval(avisar, 1000);
      return () => clearInterval(tique);
    },
    () => Math.max(0, totalSeg - Math.floor((Date.now() - new Date(iniciadaEm).getTime()) / 1000)),
    () => totalSeg,
  );

  const escutaAtivaRef = useRef<SpeechRecognition | null>(null);
  const bufferRef = useRef("");
  const silencioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ultimoInicioRef = useRef(0);
  // Os manipuladores da escuta são criados uma vez por turno e vivem fora do React: eles precisam ler
  // o valor **atual** de cada coisa, não o que existia quando foram criados.
  const estadoRef = useRef<EstadoConversa>("parado");
  const escutaModoRef = useRef<ModoEscuta>(escuta);
  const fechandoRef = useRef(false);
  const encerrandoRef = useRef(false);
  const fimPorTempoRef = useRef<(() => void) | null>(null);

  const ultimaDoCliente = [...falas].reverse().find((f) => f.papel === "cliente")?.texto ?? "";
  const jaFalou = falas.some((f) => f.papel === "vendedor");

  function guardarEstado(novo: EstadoConversa) {
    estadoRef.current = novo;
    setEstado(novo);
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

  /**
   * Navegador sem escuta ou microfone negado: a conversa continua por escrito, de onde parou.
   *
   * Vale **mesmo num treino que o gestor marcou como só por voz**. É de propósito: ele configurou o
   * treino sem saber em que navegador cada vendedor ia abrir o link, e deixar alguém com a conversa
   * já começada num beco sem saída é pior que aceitar uma conversa escrita. A frase abaixo convida a
   * abrir no Chrome, que é o caminho que o gestor pediu.
   */
  const cairParaTexto = useCallback(
    (motivo: "navegador" | "microfone") => {
      pararEscuta();
      setMotivoTexto(
        motivo === "navegador"
          ? "Este navegador não transcreve fala. Você pode digitar aqui, ou abrir este mesmo link no Chrome para conversar falando."
          : "Sem acesso ao microfone, a conversa segue por escrito. Se preferir falar, libere o microfone nas permissões do navegador e recarregue a página.",
      );
      setModo("texto");
      guardarEstado("parado");
    },
    [pararEscuta],
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
        console.error("O áudio do cliente não pôde ser tocado", err);
        pronto();
      });
    });
  }, []);

  /** A voz do próprio navegador, o caminho padrão do app (não exige nada configurado). */
  const sintetizar = useCallback((texto: string) => {
    return new Promise<void>((resolver) => {
      const sintese = window.speechSynthesis;
      if (!sintese) {
        resolver();
        return;
      }
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      const voz = vozPortuguesa();
      if (voz) fala.voice = voz;
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
      // Navegador sem nenhuma voz de fala instalada aceita o pedido e não fala nada — e também não
      // avisa. Sem esta conferência, a vez do vendedor só voltaria quando o prazo acima estourasse,
      // com a tela parada em "Falando..." e nenhum som saindo.
      const conferencia = setTimeout(() => {
        if (!sintese.speaking && !sintese.pending) pronto();
      }, CONFERIR_SE_FALA_MS);
    });
  }, []);

  const dizer = useCallback(
    async (texto: string) => {
      guardarEstado("falando");
      if (vozDoServidor) {
        try {
          const r = await fetch(`/api/salas/${codigo}/voz`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
          if (r.ok) {
            await tocar(await r.blob());
            return;
          }
        } catch (err) {
          console.error("A voz do servidor não respondeu; usando a do navegador", err);
        }
      }
      await sintetizar(texto);
    },
    [codigo, sintetizar, tocar, vozDoServidor],
  );

  /** Pede o resultado da conversa. Serve tanto para o botão de encerrar quanto para o fim do tempo. */
  const pedirResultado = useCallback(async () => {
    if (encerrandoRef.current) return;
    encerrandoRef.current = true;
    fechandoRef.current = true;
    pararEscuta();
    window.speechSynthesis?.cancel();
    setEncerrando(true);
    setErro("");
    try {
      const r = await fetch(`/api/salas/${codigo}/encerrar`, { method: "POST" });
      const corpo = (await r.json()) as Resposta & { error?: string; semConversa?: boolean; semFeedback?: boolean };
      if (!r.ok) throw new Error(corpo.error || "Não foi possível fechar a sua conversa agora.");
      if (corpo.semConversa) setFim({ semConversa: true });
      else if (corpo.semFeedback) setFim({ semFeedback: true });
      else setFim({ resultado: corpo });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível fechar a sua conversa agora.");
      setEncerrando(false);
      encerrandoRef.current = false;
      fechandoRef.current = false;
    }
  }, [codigo, pararEscuta]);

  // Declarada antes da escuta porque é ela que fecha cada turno; `iniciarEscuta` a chama de volta no
  // modo mãos livres, e as duas se encontram por referência para nenhuma depender da outra na criação.
  const iniciarEscutaRef = useRef<(() => void) | null>(null);

  /**
   * Manda a fala do vendedor e recebe a do cliente. `retomar` é o "Tentar de novo": a fala já está
   * gravada no servidor, então repeti-la duplicaria a conversa — o que se pede de novo é só a resposta.
   */
  const conversar = useCallback(
    async (texto: string, { retomar = false }: { retomar?: boolean } = {}) => {
      guardarEstado("pensando");
      setErro("");
      setParcial("");
      if (!retomar) setFalas((atuais) => [...atuais, { papel: "vendedor", texto }]);
      try {
        const corpoPedido = retomar ? { retomar: true } : { fala: texto, segundo: decorrido() };
        const r = await fetch(`/api/salas/${codigo}/conversar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoPedido) });
        if (!r.ok) {
          setErro((await lerErro(r)).mensagem);
          guardarEstado("parado");
          return;
        }
        const resposta = (await r.json()) as { texto: string; encerrada?: boolean };
        setFalas((atuais) => [...atuais, { papel: "cliente", texto: resposta.texto }]);
        await dizer(resposta.texto);
        if (resposta.encerrada) {
          await pedirResultado();
          return;
        }
        guardarEstado("parado");
        if (escutaModoRef.current === "livre" && modo === "voz") iniciarEscutaRef.current?.();
      } catch (err) {
        setErro((await lerErro(err)).mensagem);
        guardarEstado("parado");
      }
    },
    [codigo, decorrido, dizer, modo, pedirResultado],
  );

  const iniciarEscuta = useCallback(() => {
    if (fechandoRef.current) return;
    const Construtor = escutaDoNavegador();
    if (!Construtor) {
      cairParaTexto("navegador");
      return;
    }
    if (Date.now() - ultimoInicioRef.current < MINIMO_ENTRE_ESCUTAS_MS) return;
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
      // são o que separa "pausei para pensar" de "terminei de falar".
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
      // "no-speech" e "aborted" são o normal de quem parou de falar; não têm o que dizer ao vendedor.
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
        void conversar(dito);
        return;
      }
      // O Chrome corta a escuta sozinho depois de um tempo em silêncio: em mãos livres ela volta, e no
      // "segurar para falar" a vez simplesmente continua sendo do vendedor.
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
  }, [cairParaTexto, conversar, limparSilencio, pararEscuta]);

  /**
   * Fim do tempo: o cliente se despede em uma fala e a conversa fecha sozinha.
   *
   * A trava é levantada **na primeira linha**, não lá dentro em `pedirResultado`: entre a despedida e o
   * pedido do resultado há duas esperas (o modelo e a voz), e duas chamadas quase simultâneas passariam
   * as duas pela mesma porta — a segunda encontraria a conversa já avaliada e, em vez do feedback, o
   * vendedor veria "esta conversa já foi encerrada" na tela do treino que ele acabou de completar.
   */
  const fimPorTempo = useCallback(async () => {
    if (fechandoRef.current) return;
    fechandoRef.current = true;
    pararEscuta();
    guardarEstado("pensando");
    try {
      const r = await fetch(`/api/salas/${codigo}/conversar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tempoAcabou: true }) });
      if (r.ok) {
        const resposta = (await r.json()) as { texto: string };
        setFalas((atuais) => [...atuais, { papel: "cliente", texto: resposta.texto }]);
        await dizer(resposta.texto);
      }
    } catch (err) {
      console.error("A despedida do cliente não chegou", err);
    }
    await pedirResultado();
  }, [codigo, dizer, pararEscuta, pedirResultado]);

  // Os dois caminhos que se chamam de dentro de um manipulador da escuta ou do cronômetro viajam por
  // referência, atualizada em efeito: escrever em `ref.current` durante a renderização é erro de lint
  // (`react-hooks/refs`) e, aqui, também esconderia um laço — `iniciarEscuta` chama `conversar`, que
  // chama `iniciarEscuta` de volta no modo mãos livres.
  useEffect(() => {
    iniciarEscutaRef.current = iniciarEscuta;
  }, [iniciarEscuta]);

  useEffect(() => {
    fimPorTempoRef.current = fimPorTempo;
  }, [fimPorTempo]);

  // Zerou: o cliente se despede e a conversa fecha. Vai por referência de propósito — é a mesma razão
  // do bloco acima, e é o que impede o efeito de depender de tudo o que a despedida usa.
  useEffect(() => {
    if (restante === 0) fimPorTempoRef.current?.();
  }, [restante]);

  useEffect(() => {
    escutaModoRef.current = escuta;
  }, [escuta]);

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
    const texto = digitado.trim();
    if (!texto || estado === "pensando" || estado === "falando") return;
    setDigitado("");
    void conversar(texto);
  }

  function voltarParaVoz() {
    setMotivoTexto("");
    setModo("voz");
  }

  // ---------------------------------------------------------------------------
  // Depois da conversa
  // ---------------------------------------------------------------------------

  if (fim) {
    return (
      <Moldura marca={marca} nome={nome} largo={Boolean(fim.resultado)}>
        {fim.resultado ? (
          <>
            {/* Quem era o cliente: a revelação só acontece aqui, depois da conversa. Antes dela, nem a
                tela nem as rotas dizem com que tipo de pessoa o vendedor ia falar. */}
            {fim.resultado.tipoDeCliente && (
              <div className="card p-5 max-md:p-4 mb-5">
                <div className="text-muted text-[12.5px] font-semibold uppercase tracking-[0.04em] mb-1">O cliente com quem você falou</div>
                <div className="text-[17px] font-extrabold tracking-[-0.01em]">{fim.resultado.tipoDeCliente}</div>
                {fim.resultado.comportamento && <p className="text-muted text-[13.5px] mt-1">{fim.resultado.comportamento}</p>}
              </div>
            )}

            <ResultadoSessao
              conversa={fim.resultado.conversa}
              avaliacao={fim.resultado.avaliacao}
              meta={fim.resultado.meta}
              id={fim.resultado.id}
              titulo={fim.resultado.titulo}
              entregar={false}
              demoTexto="Exemplo fixo: as notas abaixo não são um julgamento da conversa que você acabou de ter."
            />

            <p className="mt-6 text-center">
              <a className="btn-link text-[13.5px]" href={`/simular/${codigo}/meus-resultados`}>
                Ver minhas conversas
              </a>
            </p>
          </>
        ) : (
          <div className="card p-7 max-md:p-[22px]">
            <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">Conversa registrada</h1>
            <p className="text-muted mb-5">
              {fim.semConversa
                ? "Você encerrou antes de falar com o cliente, então não há o que avaliar desta vez."
                : "Seu gestor vai comentar com você."}
            </p>
            <a className="btn-link text-[13.5px]" href={`/simular/${codigo}/meus-resultados`}>
              Ver minhas conversas
            </a>
          </div>
        )}
      </Moldura>
    );
  }

  // ---------------------------------------------------------------------------
  // A conversa
  // ---------------------------------------------------------------------------

  const podeFalarAgora = estado === "parado" || estado === "ouvindo";
  const segurando = escuta === "segurar";

  return (
    <div className="min-h-[100svh] flex flex-col justify-center max-md:justify-start max-w-[560px] mx-auto px-8 py-7 max-md:px-4 max-md:py-4" style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="shrink-0 w-[30px] h-[30px] rounded-[8px] bg-accent text-white grid place-items-center font-extrabold text-[14px] tracking-tight">{marca}</div>
        <div className="font-bold text-[14px] flex-1 truncate">{titulo}</div>
        <div className={`text-[14px] font-bold tabular-nums ${restante <= AVISO_TEMPO_SEG ? "text-danger" : "text-muted"}`} aria-label="Tempo restante">
          {relogio(restante)}
        </div>
      </div>

      <div className="card p-5 max-md:p-4 max-md:flex-1 flex flex-col gap-3 min-h-0">
        <div>
          <div className="text-[17px] font-extrabold tracking-[-0.01em]">{cliente.nome}</div>
          <div className="text-muted text-[13px]">{`${cliente.cargo} · ${cliente.empresa}`}</div>
        </div>

        {restante <= AVISO_TEMPO_SEG && restante > 0 && (
          <Aviso tom="warn">Faltam menos de 2 minutos. Vá para o próximo passo com o cliente.</Aviso>
        )}
        {motivoTexto && <Aviso tom="warn">{motivoTexto}</Aviso>}

        <div className="flex-1 min-h-[120px] grid place-items-center text-center py-2">
          {ultimaDoCliente ? (
            <p className="text-[19px] leading-[1.35] max-md:text-[17px]">{ultimaDoCliente}</p>
          ) : (
            <p className="text-muted text-[14px]">{`Você tem ${duracaoMin} minutos. Seu objetivo: ${objetivo}`}</p>
          )}
        </div>

        {parcial && <p className="text-muted text-[13.5px] italic text-center">{parcial}</p>}

        <div className="text-center text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted" aria-live="polite">
          {encerrando ? "Fechando a conversa..." : ROTULO_ESTADO[estado]}
        </div>

        {erro && (
          <Aviso tom="danger" acao={{ rotulo: "Tentar de novo", onClick: () => void conversar("", { retomar: true }) }}>
            {erro}
          </Aviso>
        )}

        {modo === "voz" ? (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              aria-label={estado === "ouvindo" ? "Parar de falar" : "Falar com o cliente"}
              className={`w-[76px] h-[76px] rounded-full grid place-items-center text-white text-[26px] transition-transform disabled:opacity-45 ${estado === "ouvindo" ? "bg-danger scale-105" : "bg-accent"}`}
              disabled={!podeFalarAgora}
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
              {segurando ? "Segure o botão enquanto fala e solte quando terminar." : "Toque para falar; quando você parar por 2 segundos, o cliente responde."}
            </p>
            <button type="button" className="btn-ghost !w-auto text-[13px]" onClick={() => setEscutaEscolhida(segurando ? "livre" : "segurar")}>
              {segurando ? "Usar mãos livres" : "Usar segurar para falar"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Escreva sua fala..."
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enviarDigitado();
                }
              }}
              disabled={estado === "pensando" || estado === "falando" || encerrando}
            />
            <button type="button" className="btn-primary !w-auto" disabled={!digitado.trim() || estado === "pensando" || estado === "falando"} onClick={enviarDigitado}>
              Enviar
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-3">
        {porTexto && modo === "voz" ? (
          <button type="button" className="btn-ghost !w-auto text-[13px]" onClick={() => setModo("texto")}>
            Prefiro digitar
          </button>
        ) : porVoz && modo === "texto" && escutaDoNavegador() ? (
          <button type="button" className="btn-ghost !w-auto text-[13px]" onClick={voltarParaVoz}>
            Voltar a falar
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-ghost !w-auto text-[13px]" disabled={encerrando} onClick={() => void pedirResultado()}>
          {jaFalou ? "Encerrar e ver meu resultado" : "Encerrar"}
        </button>
      </div>
    </div>
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
