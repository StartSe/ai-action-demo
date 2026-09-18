"use client";
// Tela pública do link de candidato (app/entrevista/[token]): em vez do formulário genérico de
// campos texto/textarea (app/f/[token]), a conversa é o formulário. Ao concluir, avisa o servidor e
// mostra a tela de agradecimento; o parecer é preparado depois, em segundo plano, e o candidato nunca
// vê nota, avaliação nem qualquer pista do que foi analisado (US-021).
//
// A ordem é: boas-vindas (components/BoasVindas.tsx, com o teste de microfone) → sala → agradecimento.
// Quem recarregou a página no meio da conversa entra direto na sala: as boas-vindas são o convite, e
// quem já aceitou não precisa aceitar de novo.
//
// Qual sala é decisão do SERVIDOR (lib/sala-do-candidato.ts): com o agente conversacional conectado,
// a do nível 1 (components/SalaAgenteCandidato.tsx), que cai sozinha para a do nível 2 quando o widget
// não carrega; sem ele, a do nível 2 (components/SalaCandidato.tsx) direto.
import { useState } from "react";
import { AGRADECIMENTO_APOIO, agradecimentoTitulo } from "@/lib/formato";
import { BoasVindas } from "./BoasVindas";
import { SalaAgenteCandidato } from "./SalaAgenteCandidato";
import { SalaCandidato, type PropsSalaCandidato } from "./SalaCandidato";
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
  conversaNoNavegador = false,
  agente = null,
}: {
  codigo: string;
  marca: string;
  nome: string;
  vaga: Vaga;
  duracaoMin: number;
  vozLigada: boolean;
  /** Este aparelho já começou esta conversa: entra direto na sala. */
  retomando?: boolean;
  /** Link antigo, sem entrevista guardada: a conversa viaja no corpo de cada turno. */
  conversaNoNavegador?: boolean;
  /** O agente conversacional desta entrevista (nível 1). Nulo quando a empresa não o conectou. */
  agente?: { id: string; variaveis: Record<string, string> } | null;
}) {
  const [fase, setFase] = useState<Fase>(retomando ? "entrevista" : "boas-vindas");
  const [mensagemErro, setMensagemErro] = useState("");
  // O toque em "Começar a entrevista" é o gesto que libera o áudio deste navegador; sem ele a sala
  // esperaria um segundo gesto para falar a primeira pergunta, e a tela ficaria muda. Quem chega aqui
  // por uma recarga da página não passou por esse toque, e a sala pede um antes de falar.
  const [audioLiberado, setAudioLiberado] = useState(false);
  // O teste de microfone das boas-vindas passou. Na retomada não há teste: a sala tenta escutar e cai
  // para o texto sozinha se este navegador não souber ou se a permissão tiver sido negada.
  const [porVoz, setPorVoz] = useState(true);

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

  // As mesmas props servem às duas salas: a do agente carrega a do navegador inteira, para a queda
  // para o nível 2 não precisar de uma segunda volta ao servidor.
  const propsDaSala: PropsSalaCandidato = {
    codigo,
    cargo: vaga.titulo,
    primeiroNome: vaga.candidato.trim().split(/\s+/)[0] || vaga.candidato,
    vozLigada,
    porVoz,
    audioLiberado,
    conversaNoNavegador,
    onFinalizar,
  };

  if (fase === "boas-vindas") {
    return (
      <BoasVindas
        codigo={codigo}
        marca={marca}
        nome={nome}
        primeiroNome={vaga.candidato.trim().split(/\s+/)[0] || vaga.candidato}
        cargo={vaga.titulo}
        duracaoMin={duracaoMin}
        onPronto={({ porVoz: falando }) => {
          setAudioLiberado(true);
          setPorVoz(falando);
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
        // A MESMA frase da página do link (app/entrevista/[token]), que é o que quem voltar ao
        // endereço depois vai ler: as duas vêm de lib/formato.ts.
        <div className="card p-7 max-md:p-[22px] text-center">
          <h1 className="text-xl font-extrabold mb-1.5">{agradecimentoTitulo(vaga.candidato)}</h1>
          <p className="text-muted">{AGRADECIMENTO_APOIO} Você já pode fechar esta página.</p>
        </div>
      ) : fase === "erro" ? (
        <div className="card p-7 max-md:p-[22px] text-center">
          <h1 className="text-xl font-extrabold mb-1.5">Não foi possível continuar</h1>
          <p className="text-muted">{mensagemErro}</p>
        </div>
      ) : agente ? (
        <SalaAgenteCandidato agente={agente.id} variaveis={agente.variaveis} navegador={propsDaSala} onConcluida={() => setFase("concluida")} />
      ) : (
        <SalaCandidato {...propsDaSala} />
      )}

      {fase === "enviando" && <p className="text-muted text-sm text-center mt-4">Enviando suas respostas...</p>}
    </div>
  );
}
