"use client";
// Tela pública do link de candidato (app/entrevista/[token]): em vez do formulário genérico de
// campos texto/textarea (app/f/[token]), reaproveita a própria sala de entrevista (components/Sala.tsx),
// já que a conversa é o formulário. Ao concluir, envia a transcrição para gerar o parecer (que só o
// gestor vê) e mostra uma tela de agradecimento para o candidato.
//
// A ordem é: boas-vindas (components/BoasVindas.tsx, com o teste de microfone) → sala → agradecimento.
// Quem recarregou a página no meio da conversa entra direto na sala: as boas-vindas são o convite, e
// quem já aceitou não precisa aceitar de novo.
import { useState } from "react";
import { BoasVindas } from "./BoasVindas";
import { Sala } from "./Sala";
import type { Troca, Vaga } from "@/lib/types";

type Fase = "boas-vindas" | "entrevista" | "enviando" | "concluida" | "erro";

export function EntrevistaCandidato({
  codigo,
  marca,
  nome,
  vaga,
  duracaoMin,
  vozLigada,
  retomando = false,
}: {
  codigo: string;
  marca: string;
  nome: string;
  vaga: Vaga;
  duracaoMin: number;
  vozLigada: boolean;
  /** Este aparelho já começou esta conversa: entra direto na sala. */
  retomando?: boolean;
}) {
  const [fase, setFase] = useState<Fase>(retomando ? "entrevista" : "boas-vindas");
  const [mensagemErro, setMensagemErro] = useState("");
  // O toque em "Começar a entrevista" é o gesto que libera o áudio deste navegador; sem ele a sala
  // esperaria um segundo gesto para falar a primeira pergunta, e a tela ficaria muda.
  const [audioLiberado, setAudioLiberado] = useState(false);

  async function onFinalizar(historico: Troca[]) {
    setFase("enviando");
    try {
      const r = await fetch(`/api/entrevista/candidato/${codigo}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ historico }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível concluir a entrevista.");
      setFase("concluida");
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : "Erro inesperado.");
      setFase("erro");
    }
  }

  if (fase === "boas-vindas") {
    return (
      <BoasVindas
        codigo={codigo}
        marca={marca}
        nome={nome}
        primeiroNome={vaga.candidato.trim().split(/\s+/)[0] || vaga.candidato}
        cargo={vaga.titulo}
        duracaoMin={duracaoMin}
        onPronto={() => {
          setAudioLiberado(true);
          setFase("entrevista");
        }}
      />
    );
  }

  return (
    <div className="max-w-[640px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8">
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>

      {fase === "concluida" ? (
        <div className="card p-7 max-md:p-[22px] text-center">
          <h1 className="text-xl font-extrabold mb-1.5">Obrigado, sua entrevista foi enviada.</h1>
          <p className="text-muted">Você já pode fechar esta página. A equipe de recrutamento vai analisar suas respostas.</p>
        </div>
      ) : fase === "erro" ? (
        <div className="card p-7 max-md:p-[22px] text-center">
          <h1 className="text-xl font-extrabold mb-1.5">Não foi possível continuar</h1>
          <p className="text-muted">{mensagemErro}</p>
        </div>
      ) : (
        <Sala
          vaga={vaga}
          rotas={{ proxima: `/api/entrevista/candidato/${codigo}/proxima`, voz: `/api/entrevista/candidato/${codigo}/voz` }}
          vozLigada={vozLigada}
          audioLiberado={audioLiberado}
          modoExemplo={false}
          onFinalizar={onFinalizar}
        />
      )}

      {fase === "enviando" && <p className="text-muted text-sm text-center mt-4">Enviando suas respostas...</p>}
    </div>
  );
}
