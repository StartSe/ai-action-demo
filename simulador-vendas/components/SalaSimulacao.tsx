"use client";
// Sala de simulação pública (app/simular/[código]): sem a ElevenLabs conectada, conversa por texto com
// a IA fazendo o papel do cliente (lib/simulacao.ts, askText multi-turno; em demo, um roteiro fixo);
// com a ElevenLabs conectada, mostra o widget oficial de voz. Ao final dos dois caminhos, mostra o
// mesmo Resultado das telas de resultado (components/Resultado.tsx).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Resultado } from "@/components/Resultado";
import { Aviso, lerErro } from "@/components/ui";
import type { Analise, Cenario, Conversa, LinhaTranscricao } from "@/lib/types";
import type { Meta } from "@/lib/ai";

const SCRIPT_ID = "elevenlabs-convai-script";
/** Quanto a sala espera a análise da ligação por voz antes de assumir que ela não vem (90 s). */
const ESPERA_MAXIMA_MS = 90_000;
const SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";

type Props = {
  codigo: string;
  marca: string;
  nome: string;
  cenario: Cenario | null;
  vendedorId?: string;
  comVoz: boolean;
  agentId?: string;
};

function briefing(cenario: Cenario | null): string {
  if (!cenario) return "Converse com o cliente simulado e, ao final, veja sua análise.";
  return `Você vai ligar para ${cenario.cliente.nome}, ${cenario.cliente.cargo} da ${cenario.cliente.empresa}. Objetivo: ${cenario.objetivo}`;
}

type Resposta = { demo: boolean; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string };

export function SalaSimulacao({ codigo, marca, nome, cenario, vendedorId, comVoz, agentId }: Props) {
  const [resultado, setResultado] = useState<Resposta | null>(null);

  return (
    <div className={resultado ? "max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10" : "max-w-[640px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8"}>
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>

      {resultado ? (
        <Resultado conversa={resultado.conversa} analise={resultado.analise} meta={resultado.meta} id={resultado.id} titulo={resultado.titulo} demoTexto="Exemplo fixo: a avaliação abaixo não é sobre a conversa que você acabou de ter." />
      ) : (
        <>
          <p className="text-muted mb-5">{briefing(cenario)}</p>
          {comVoz && agentId ? (
            <SalaVoz codigo={codigo} cenario={cenario} vendedorId={vendedorId} agentId={agentId} />
          ) : (
            <SalaTexto codigo={codigo} onConcluir={setResultado} />
          )}
        </>
      )}
    </div>
  );
}

type FaseTexto = "conversando" | "enviando" | "analisando" | "erro";

function SalaTexto({ codigo, onConcluir }: { codigo: string; onConcluir: (r: Resposta) => void }) {
  const [transcricao, setTranscricao] = useState<LinhaTranscricao[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [fase, setFase] = useState<FaseTexto>("conversando");
  const [mensagemErro, setMensagemErro] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [transcricao]);

  async function enviar() {
    const texto = mensagem.trim();
    if (!texto || fase !== "conversando") return;
    const nova: LinhaTranscricao[] = [...transcricao, { papel: "vendedor", texto }];
    setTranscricao(nova);
    setMensagem("");
    setFase("enviando");
    try {
      const r = await fetch(`/api/salas/${codigo}/conversar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcricao: nova }) });
      if (!r.ok) {
        setMensagemErro((await lerErro(r)).mensagem);
        setFase("erro");
        return;
      }
      const resposta = await r.json();
      setTranscricao((t) => [...t, { papel: "cliente", texto: resposta.texto }]);
      setFase("conversando");
    } catch (err) {
      setMensagemErro((await lerErro(err)).mensagem);
      setFase("erro");
    }
  }

  async function encerrar() {
    setFase("analisando");
    try {
      const r = await fetch(`/api/salas/${codigo}/analisar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcricao }) });
      if (!r.ok) {
        setMensagemErro((await lerErro(r)).mensagem);
        setFase("erro");
        return;
      }
      onConcluir(await r.json());
    } catch (err) {
      setMensagemErro((await lerErro(err)).mensagem);
      setFase("erro");
    }
  }

  const podeEnviar = fase === "conversando";
  const podeEncerrar = transcricao.some((l) => l.papel === "vendedor") && (fase === "conversando" || fase === "erro");

  return (
    <div className="card p-6 max-md:p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto">
        {transcricao.length === 0 && <p className="text-muted text-sm">Escreva a primeira fala para começar a ligação simulada.</p>}
        {transcricao.map((l, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${l.papel === "vendedor" ? "self-end bg-accent text-white" : "self-start bg-bg border border-line"}`}
          >
            {l.texto}
          </div>
        ))}
        {fase === "enviando" && <div className="self-start text-muted text-sm px-3.5">Cliente está digitando...</div>}
        <div ref={fimRef} />
      </div>

      {fase === "erro" && <Aviso tom="danger">{mensagemErro}</Aviso>}

      <div className="flex gap-2.5">
        <input
          className="input"
          placeholder="Escreva sua fala..."
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              enviar();
            }
          }}
          disabled={!podeEnviar}
        />
        <button type="button" className="btn-primary !w-auto" disabled={!podeEnviar || !mensagem.trim()} onClick={enviar}>
          Enviar
        </button>
      </div>
      <button type="button" className="btn-ghost self-start" disabled={!podeEncerrar} onClick={encerrar}>
        {fase === "analisando" ? "Analisando sua conversa..." : "Encerrar e ver minha análise"}
      </button>
    </div>
  );
}

function SalaVoz({
  codigo,
  cenario,
  vendedorId,
  agentId,
}: {
  codigo: string;
  cenario: Cenario | null;
  vendedorId?: string;
  agentId: string;
}) {
  const [scriptPronto, setScriptPronto] = useState(false);
  const [aguardando, setAguardando] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const baselineRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    let cancelado = false;
    customElements.whenDefined("elevenlabs-convai").then(() => {
      if (!cancelado) setScriptPronto(true);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    fetch(`/api/salas/${codigo}/ultima`)
      .then((r) => r.json())
      .then((d) => {
        baselineRef.current = d.id ?? null;
      })
      .catch(() => {});
  }, [codigo]);

  useEffect(() => {
    if (!aguardando) return;
    const intervalo = setInterval(async () => {
      try {
        const r = await fetch(`/api/salas/${codigo}/ultima?desde=${baselineRef.current ?? ""}`);
        const d = await r.json();
        if (d.pronto && d.id) {
          clearInterval(intervalo);
          router.push(`/r/${d.id}`);
        }
      } catch {
        // tenta de novo na próxima rodada
      }
    }, 5000);
    // Sem o aviso de pós-conversa configurado do outro lado, a análise nunca chega: depois de
    // ESPERA_MAXIMA_MS a sala para de dizer "aguarde" e explica o que fazer, em vez de girar para sempre.
    const prazo = setTimeout(() => setDemorou(true), ESPERA_MAXIMA_MS);
    return () => {
      clearInterval(intervalo);
      clearTimeout(prazo);
    };
  }, [aguardando, codigo, router]);

  /** Registra a ligação no app antes de começar a esperar: assim ela existe mesmo que o aviso nunca chegue. */
  function encerrar() {
    setAguardando(true);
    fetch(`/api/salas/${codigo}/ligacao`, { method: "POST" }).catch(() => {});
  }

  const variaveis = JSON.stringify({ vendedor_id: vendedorId || "", sala_token: codigo, cenario: cenario?.titulo || "" });

  return (
    <div className="card p-6 max-md:p-4 flex flex-col gap-4">
      {scriptPronto ? (
        <elevenlabs-convai agent-id={agentId} dynamic-variables={variaveis} />
      ) : (
        <p className="text-muted text-sm">Carregando o assistente de voz...</p>
      )}
      {aguardando ? (
        demorou ? (
          <Aviso tom="warn">A análise ainda não chegou; peça ao gestor para conferir a conexão com a ElevenLabs. A sua ligação ficou registrada.</Aviso>
        ) : (
          <p className="text-muted text-sm">Analisando sua conversa. Isso pode levar alguns segundos...</p>
        )
      ) : (
        <button type="button" className="btn-ghost self-start" onClick={encerrar}>
          Já terminei, ver minha análise
        </button>
      )}
    </div>
  );
}
