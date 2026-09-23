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
import { useRef, useState } from "react";
import { AGRADECIMENTO_APOIO, agradecimentoTitulo } from "@/lib/formato";
import { SalaLiveKit } from "./SalaLiveKit";
import { BoasVindas } from "./BoasVindas";
import { SalaCandidato, type PropsSalaCandidato } from "./SalaCandidato";
import type { Troca, Vaga } from "@/lib/types";

type Fase = "boas-vindas" | "entrevista" | "enviando" | "concluida" | "erro";

export function EntrevistaCandidato({
  codigo,
  tentativaAtual = 1,
  marca,
  nome,
  vaga,
  duracaoMin,
  iniciaEm,
  expiraEm,
  vozLigada,
  livekit = false,
  retomando = false,
  conversaNoNavegador = false,
}: {
  codigo: string;
  tentativaAtual?: number;
  marca: string;
  nome: string;
  vaga: Vaga;
  duracaoMin: number;
  iniciaEm?: string;
  expiraEm?: string;
  vozLigada: boolean;
  livekit?: boolean;
  /** Este aparelho já começou esta conversa: entra direto na sala. */
  retomando?: boolean;
  /** Link antigo, sem entrevista guardada: a conversa viaja no corpo de cada turno. */
  conversaNoNavegador?: boolean;
}) {
  const [fase, setFase] = useState<Fase>(retomando ? "entrevista" : "boas-vindas");
  const [mensagemErro, setMensagemErro] = useState("");
  const respostasFinais = useRef<Troca[]>([]);
  const enviandoRef = useRef(false);
  // O toque em "Começar a entrevista" é o gesto que libera o áudio deste navegador; sem ele a sala
  // esperaria um segundo gesto para falar a primeira pergunta, e a tela ficaria muda. Quem chega aqui
  // por uma recarga da página não passou por esse toque, e a sala pede um antes de falar.
  const [audioLiberado, setAudioLiberado] = useState(false);
  // O teste de microfone das boas-vindas passou. Na retomada não há teste: a sala tenta escutar e cai
  // para o texto sozinha se este navegador não souber ou se a permissão tiver sido negada.
  const [porVoz, setPorVoz] = useState(true);

  async function onFinalizar(historico: Troca[]) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    respostasFinais.current = historico;
    setFase("enviando");
    try {
      const r = await fetch(`/api/entrevista/candidato/${codigo}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Entrevista-Tentativa": String(tentativaAtual) }, body: JSON.stringify({ historico }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível concluir a entrevista.");
      setFase("concluida");
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : "Erro inesperado.");
      setFase("erro");
    } finally {
      enviandoRef.current = false;
    }
  }

  const propsDaSala: PropsSalaCandidato = {
    codigo,
    tentativaAtual,
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
        codigo={codigo} tentativaAtual={tentativaAtual}
        livekit={livekit}
        marca={marca}
        nome={nome}
        primeiroNome={vaga.candidato.trim().split(/\s+/)[0] || vaga.candidato}
        cargo={vaga.titulo}
        duracaoMin={duracaoMin}
        iniciaEm={iniciaEm}
        expiraEm={expiraEm}
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
          <button type="button" className="btn-primary mt-4" onClick={() => void onFinalizar(respostasFinais.current)}>Tentar enviar novamente</button>
        </div>
      ) : fase === "enviando" ? (
        <p className="card p-7 text-center" role="status">Enviando suas respostas...</p>

      ) : (
        livekit && porVoz ? <SalaLiveKit codigo={codigo} tentativaAtual={tentativaAtual} cargo={vaga.titulo} onFinalizar={onFinalizar} onTexto={() => setPorVoz(false)} /> : <SalaCandidato {...propsDaSala} />
      )}


    </div>
  );
}
