"use client";
// A sala com o agente conversacional (US-019, nível 1 da D3): o candidato fala como numa ligação de
// verdade e pode até interromper a entrevistadora no meio da frase.
//
// Três coisas separam esta sala da do nível 2 (`components/SalaCandidato.tsx`):
//
//  1. **Quem conduz a conversa é o agente**, dentro do widget da ElevenLabs. O app entrega a ele o
//     roteiro daquela entrevista e sai do caminho — nenhum turno passa pelo servidor.
//  2. **A conversa chega depois**, pelo aviso de pós-conversa, não pela tela. Por isso o fim aqui é
//     "encerrei, agora espero": a sala pergunta ao servidor se a conversa já chegou.
//  3. **Ela é opcional.** Se o widget não carregar em 10 segundos — rede bloqueando o script, conta
//     com problema, agente removido —, a sala cai sozinha para o nível 2, que funciona sem nada
//     configurado. O candidato não escolhe nada e nem fica sabendo: ele só vê a conversa começar. O
//     widget também pode carregar e mesmo assim não conectar (agente apagado do outro lado), e isso o
//     app não tem como detectar — por isso a saída fica visível: "Prefiro conversar por aqui" leva ao
//     nível 2 a qualquer momento, sem perder a entrevista.
import { useCallback, useEffect, useRef, useState } from "react";
import { SalaCandidato, type PropsSalaCandidato } from "./SalaCandidato";
import { useConfirmacao } from "./ui";
import { AVISO_ENCERRAMENTO } from "@/lib/avisos-entrevista";

const SCRIPT_ID = "elevenlabs-convai-script";
const SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";
/** Depois disto a sala desiste do widget e entrega a conversa ao navegador, sem perguntar nada. */
const ESPERA_WIDGET_MS = 10_000;
/** Quanto a sala espera a conversa voltar antes de agradecer assim mesmo (90 s). */
const ESPERA_MAXIMA_MS = 90_000;
/** De quanto em quanto tempo a sala pergunta se a conversa dela já chegou. */
const INTERVALO_SONDAGEM_MS = 5000;

type Fase = "carregando" | "agente" | "navegador";

export function SalaAgenteCandidato({
  agente,
  variaveis,
  navegador,
  onConcluida,
}: {
  /** O agente conversacional escolhido em Configurações. */
  agente: string;
  /** As variáveis desta entrevista, entregues ao agente no começo da conversa. */
  variaveis: Record<string, string>;
  /** Tudo o que a sala do navegador precisa, para a queda para o nível 2 ser imediata. */
  navegador: PropsSalaCandidato;
  /** A entrevista terminou: a tela de agradecimento é de quem chamou. */
  onConcluida: () => void;
}) {
  const { codigo, cargo, primeiroNome } = navegador;

  const [fase, setFase] = useState<Fase>("carregando");
  const [aguardando, setAguardando] = useState(false);

  // A função de encerrar vem do pai e pode ser outra a cada render dele; guardá-la numa referência é
  // o que impede a sondagem de recomeçar (e o prazo de 90 s de reiniciar) a cada render.
  const aoConcluir = useRef(onConcluida);
  useEffect(() => {
    aoConcluir.current = onConcluida;
  });

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
    // ou já presente) e mantém a mudança de estado fora do corpo do efeito.
    Promise.race([customElements.whenDefined("elevenlabs-convai").then(() => "pronto" as const), esperar]).then((resultado) => {
      if (cancelado) return;
      if (resultado === "pronto") {
        setFase("agente");
        return;
      }
      console.error(`A conversa por agente não carregou em ${ESPERA_WIDGET_MS / 1000} s; a entrevista segue pelo navegador.`);
      setFase("navegador");
    });

    return () => {
      cancelado = true;
      if (prazo) clearTimeout(prazo);
    };
  }, []);

  useEffect(() => {
    if (!aguardando) return;
    const intervalo = setInterval(async () => {
      try {
        const r = await fetch(`/api/entrevista/candidato/${codigo}/estado`);
        const d = (await r.json()) as { recebida?: boolean };
        if (d.recebida) aoConcluir.current();
      } catch (err) {
        console.error("A conversa ainda não pôde ser consultada", err);
      }
    }, INTERVALO_SONDAGEM_MS);
    // Sem o aviso de pós-conversa configurado do outro lado, a conversa nunca chega. Passado o prazo,
    // o candidato lê o agradecimento assim mesmo: ele fez a parte dele, e deixar a tela girando para
    // sempre por causa de um ajuste que não é dele seria castigá-lo por isso.
    const prazo = setTimeout(() => aoConcluir.current(), ESPERA_MAXIMA_MS);
    return () => {
      clearInterval(intervalo);
      clearTimeout(prazo);
    };
  }, [aguardando, codigo]);

  const conversarPorAqui = useCallback(() => setFase("navegador"), []);
  const { confirmar, Dialogo } = useConfirmacao();
  async function encerrar() {
    if (await confirmar(AVISO_ENCERRAMENTO, { confirmarRotulo: "Encerrar", cancelarRotulo: "Continuar a conversa" })) setAguardando(true);
  }

  if (fase === "navegador") return <SalaCandidato {...navegador} />;

  return (
    <div className="room reveal">
      {Dialogo}
      <div className="room-head">
        <div className="avatar">
          <span>E</span>
        </div>
        <div className="room-head-text">
          <h2>Entrevistadora</h2>
          <div className="who">{cargo}</div>
        </div>
      </div>

      {fase === "carregando" ? (
        <p className="text-muted text-[14px] text-center py-8">Preparando a sua conversa por voz...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted text-[13.5px]">
            {primeiroNome}, toque no botão abaixo para começar. Você pode falar naturalmente e até interromper — é uma conversa, não um formulário.
          </p>
          <elevenlabs-convai agent-id={agente} dynamic-variables={JSON.stringify(variaveis)} />
        </div>
      )}

      {aguardando && <p className="text-muted text-[14px] text-center">Recebendo a sua conversa. Isso leva alguns segundos...</p>}

      {/* As duas saídas não cabem lado a lado numa tela de 390 px: `flex-wrap` deixa a segunda descer
          em vez de empurrar a tela para a direita. */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-4">
        {fase === "agente" && !aguardando ? (
          <button type="button" className="btn-ghost !w-auto text-[13px]" onClick={conversarPorAqui}>
            Prefiro conversar por aqui
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-ghost !w-auto text-[13px]" disabled={aguardando} onClick={encerrar}>
          Encerrar entrevista
        </button>
      </div>
    </div>
  );
}
