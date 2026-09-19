"use client";
// Compatibilidade com links antigos: conversa por texto e avaliação no próprio simulador.
import { useEffect, useRef, useState } from "react";
import { Resultado } from "@/components/Resultado";
import { Aviso, lerErro } from "@/components/ui";
import type { Analise, Cenario, Conversa, LinhaTranscricao } from "@/lib/types";
import type { Meta } from "@/lib/ai";

type Props = {
  codigo: string;
  marca: string;
  nome: string;
  cenario: Cenario | null;
  vendedorId?: string;
};

function briefing(cenario: Cenario | null): string {
  if (!cenario) return "Converse com o cliente simulado e, ao final, veja sua análise.";
  return `Você vai ligar para ${cenario.cliente.nome}, ${cenario.cliente.cargo} da ${cenario.cliente.empresa}. Objetivo: ${cenario.objetivo}`;
}

type Resposta = { demo: boolean; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string };

export function SalaSimulacao({ codigo, marca, nome, cenario }: Props) {
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
          <SalaTexto codigo={codigo} onConcluir={setResultado} />
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
