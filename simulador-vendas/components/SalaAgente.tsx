"use client";
// A sala com o agente conversacional (US-016, nível 1): o vendedor fala como numa ligação de verdade,
// podendo interromper o cliente no meio da frase.
//
// Três coisas separam esta sala da do nível 2 (`components/SalaVoz.tsx`):
//
// 1. **Quem conduz a conversa é o agente**, dentro do widget da ElevenLabs. O app entrega a ele quem é
//    o cliente (as instruções do personagem) e some do caminho — não há turno passando pelo servidor.
// 2. **A transcrição chega depois**, pelo aviso de pós-conversa, não pela tela. Por isso o fim aqui é
//    "encerrei, agora espero": a sala sonda o próprio resultado até ele ficar pronto.
// 3. **Ela é opcional.** Se o widget não carregar em 10 segundos — rede bloqueando o script, conta com
//    problema, agente removido —, a sala cai sozinha para o nível 2, que funciona sem nada configurado.
//    Quem treina não escolhe nada e não fica sabendo: ele só vê a conversa começar. O widget também
//    pode carregar e mesmo assim não conectar (agente apagado do outro lado, configuração recusada):
//    esse caso o app não tem como detectar, então a saída fica visível — "Prefiro conversar por aqui"
//    leva ao nível 2 sem perder a sessão, e nenhum vendedor fica preso numa tela que não responde.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui";
import { SalaVoz, type PropsSalaVoz } from "@/components/SalaVoz";

const SCRIPT_ID = "elevenlabs-convai-script";
const SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";
/** Depois disto a sala desiste do widget e entrega a conversa do navegador, sem perguntar nada. */
const ESPERA_WIDGET_MS = 10_000;
/** Quanto a sala espera a avaliação da conversa antes de assumir que ela não vem (90 s). */
const ESPERA_MAXIMA_MS = 90_000;
/** De quanto em quanto tempo a sala pergunta se a avaliação da conversa dela já ficou pronta. */
const INTERVALO_SONDAGEM_MS = 5000;

type Fase = "carregando" | "agente" | "navegador";

type Props = {
  agente: string;
  /** As variáveis da **sessão** que o agente recebe a cada conversa (quem é o cliente, quem treina). */
  variaveis: Record<string, string>;
  /** Tudo o que a sala do navegador precisa, para a queda para o nível 2 ser imediata. */
  navegador: PropsSalaVoz;
};

function relogio(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SalaAgente({ agente, variaveis, navegador }: Props) {
  const { codigo, marca, nome, titulo, cliente, objetivo, duracaoMin, iniciadaEm } = navegador;
  const totalSeg = Math.max(1, duracaoMin) * 60;

  const [fase, setFase] = useState<Fase>("carregando");
  const [aguardando, setAguardando] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const router = useRouter();

  // Mesmo espelho do relógio do servidor da sala do nível 2, e pelo mesmo motivo: o valor só existe no
  // navegador, e lê-lo em `useState` + efeito quebraria a hidratação.
  const restante = useSyncExternalStore(
    (avisar) => {
      const tique = setInterval(avisar, 1000);
      return () => clearInterval(tique);
    },
    () => Math.max(0, totalSeg - Math.floor((Date.now() - new Date(iniciadaEm).getTime()) / 1000)),
    () => totalSeg,
  );

  useEffect(() => {
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    let cancelado = false;
    let prazo: ReturnType<typeof setTimeout> | null = null;
    const esperar = new Promise<"tempo">((resolver) => {
      prazo = setTimeout(() => resolver("tempo"), ESPERA_WIDGET_MS);
    });

    // `whenDefined(...).then(...)` cobre os dois casos com a mesma forma de código (script recém-criado
    // ou já presente) e mantém o `setState` fora do corpo do efeito.
    Promise.race([customElements.whenDefined("elevenlabs-convai").then(() => "pronto" as const), esperar]).then((resultado) => {
      if (cancelado) return;
      if (resultado === "pronto") {
        setFase("agente");
        // O modo da conversa passa a ser o do agente, que é o que o painel do gestor e a contagem de
        // conversas sem avaliação leem depois. Só é gravado quando o widget realmente carregou.
        fetch(`/api/salas/${codigo}/sessao`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "voz-agente" }) }).catch((err) => {
          console.error("Não foi possível registrar o modo da conversa", err);
        });
        return;
      }
      console.error(`O assistente de voz não carregou em ${ESPERA_WIDGET_MS / 1000} s; a conversa segue pelo navegador.`);
      setFase("navegador");
    });

    return () => {
      cancelado = true;
      if (prazo) clearTimeout(prazo);
    };
  }, [codigo]);

  useEffect(() => {
    if (!aguardando) return;
    const intervalo = setInterval(async () => {
      try {
        const r = await fetch(`/api/salas/${codigo}/ultima`);
        const d = (await r.json()) as { pronto?: boolean; id?: string | null; sessao?: string | null };
        if (d.pronto && d.id) {
          clearInterval(intervalo);
          // O feedback de quem treina mora dentro do link do treino; `/r/<id>` é a tela do gestor e
          // pediria uma conta que o vendedor não tem. Sem conversa própria (link de antes do modelo de
          // hoje), o caminho antigo continua valendo.
          router.push(d.sessao ? `/simular/${codigo}/meus-resultados/${d.sessao}` : `/r/${d.id}`);
        }
      } catch (err) {
        console.error("A avaliação ainda não pôde ser consultada", err);
      }
    }, INTERVALO_SONDAGEM_MS);
    // Sem o aviso de pós-conversa configurado do outro lado, a avaliação nunca chega: passado o prazo
    // a sala para de dizer "aguarde" e explica o que fazer, em vez de girar para sempre.
    const prazo = setTimeout(() => setDemorou(true), ESPERA_MAXIMA_MS);
    return () => {
      clearInterval(intervalo);
      clearTimeout(prazo);
    };
  }, [aguardando, codigo, router]);

  /** A saída manual para o nível 2: o modo da sessão volta a ser o do navegador e a conversa continua. */
  const conversarPorAqui = useCallback(() => {
    setFase("navegador");
    fetch(`/api/salas/${codigo}/sessao`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "voz-navegador" }) }).catch((err) => {
      console.error("Não foi possível registrar o modo da conversa", err);
    });
  }, [codigo]);

  /** Fecha a conversa no app antes de começar a esperar: ela existe para o gestor mesmo se nada voltar. */
  const encerrar = useCallback(() => {
    setAguardando(true);
    fetch(`/api/salas/${codigo}/ligacao`, { method: "POST" }).catch((err) => {
      console.error("Não foi possível registrar o fim da conversa", err);
    });
  }, [codigo]);

  if (fase === "navegador") return <SalaVoz {...navegador} />;

  return (
    <div className="min-h-[100svh] flex flex-col justify-center max-md:justify-start max-w-[560px] mx-auto px-8 py-7 max-md:px-4 max-md:py-4" style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="shrink-0 w-[30px] h-[30px] rounded-[8px] bg-accent text-white grid place-items-center font-extrabold text-[14px] tracking-tight">{marca}</div>
        <div className="font-bold text-[14px] flex-1 truncate">{titulo || nome}</div>
        <div className={`text-[14px] font-bold tabular-nums ${restante === 0 ? "text-danger" : "text-muted"}`} aria-label="Tempo restante">
          {relogio(restante)}
        </div>
      </div>

      <div className="card p-5 max-md:p-4 flex flex-col gap-3">
        <div>
          <div className="text-[17px] font-extrabold tracking-[-0.01em]">{cliente.nome}</div>
          <div className="text-muted text-[13px]">{`${cliente.cargo} · ${cliente.empresa}`}</div>
        </div>

        {restante === 0 && <Aviso tom="warn">O tempo acabou. Encerre a conversa para ver o seu resultado.</Aviso>}

        {fase === "carregando" ? (
          <p className="text-muted text-[14px] text-center py-6">Preparando a conversa por voz...</p>
        ) : (
          <>
            <p className="text-muted text-[13.5px]">{`Seu objetivo: ${objetivo}`}</p>
            <elevenlabs-convai agent-id={agente} dynamic-variables={JSON.stringify(variaveis)} />
          </>
        )}

        {aguardando &&
          (demorou ? (
            <Aviso tom="warn">Sua conversa foi registrada, mas a avaliação ainda não chegou. Avise quem enviou o link.</Aviso>
          ) : (
            <p className="text-muted text-[14px] text-center">Preparando o seu resultado. Isso leva alguns segundos...</p>
          ))}
      </div>

      {/* As duas saídas não cabem lado a lado numa tela de 390 px: `flex-wrap` deixa a segunda descer
          em vez de empurrar a tela para a direita. */}
      <div className="flex items-center justify-between gap-3 pt-3 flex-wrap">
        {fase === "agente" && !aguardando ? (
          <button type="button" className="btn-ghost !w-auto text-[13px]" onClick={conversarPorAqui}>
            Prefiro conversar por aqui
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-ghost !w-auto text-[13px]" disabled={aguardando} onClick={encerrar}>
          Encerrar e ver meu resultado
        </button>
      </div>
    </div>
  );
}
