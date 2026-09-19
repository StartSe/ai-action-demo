"use client";
// A aba Personas do painel de um treino (US-024).
//
// Ela responde "em que tipo de cliente meu time trava?", e a resposta é uma lista curta: emoji, nome,
// o número grande e uma barra. Sete linhas, nenhum gráfico — a comparação que interessa é entre a
// primeira e a última, e isso se lê de cima para baixo.
//
// A lista já vem pronta no painel (cálculo puro). A única coisa buscada aqui é o parágrafo que
// interpreta a menor nota, porque ele é escrito pela IA e não deve custar uma chamada para quem nunca
// abre esta aba.
import { useEffect, useState } from "react";
import type { PainelSimulacao, PersonaNaSimulacao } from "@/lib/painel-simulacao";
import { COR_DA_NOTA, contagem, nota, tomDaNota } from "./apresentacao";
import BarraNota from "./BarraNota";

type Leitura = { frase: string; daIA: boolean };

/** Uma linha da lista: o tipo de cliente, como o time vai com ele e de quantas conversas isso saiu. */
function LinhaPersona({ persona }: { persona: PersonaNaSimulacao }) {
  const detalhe = [
    contagem(persona.sessoes, "sessão", "sessões"),
    contagem(persona.vendedores, "vendedor", "vendedores"),
    // Com base pequena, a linha diz o que falta para a nota aparecer em vez de só omiti-la: sem isso o
    // gestor lê "poucos dados" e não sabe se são duas conversas ou nenhuma.
    persona.poucosDados
      ? `${contagem(persona.avaliadas, "conversa avaliada", "conversas avaliadas")} — a nota aparece a partir de 3`
      : contagem(persona.avaliadas, "conversa avaliada", "conversas avaliadas"),
  ].join(" · ");

  return (
    <li>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden="true" className="text-[26px] leading-none">
            {persona.emoji}
          </span>
          <span className="font-semibold truncate">{persona.nome}</span>
        </span>
        {persona.poucosDados ? (
          <span className="chip-cinza shrink-0">Poucos dados</span>
        ) : (
          <span className={`text-[26px] leading-none font-extrabold tracking-[-0.02em] shrink-0 ${COR_DA_NOTA[tomDaNota(persona.nota)]}`}>{nota(persona.nota)}</span>
        )}
      </div>
      <BarraNota
        valor={persona.nota}
        descricao={persona.poucosDados ? `${persona.nome}: ainda sem nota, ${detalhe}` : `${persona.nome}: nota ${nota(persona.nota)} de 10, em ${detalhe}`}
      />
      <p className="text-[13px] text-muted mt-1.5">{detalhe}</p>
    </li>
  );
}

export default function Personas({ painel }: { painel: PainelSimulacao }) {
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [falhou, setFalhou] = useState(false);

  // Busca em forma de corrente, como o resto das telas: `react-hooks/set-state-in-effect` acusa
  // chamada direta a função que mexe em estado no corpo do efeito, mesmo com await no meio.
  useEffect(() => {
    fetch(`/api/resultados/${painel.codigo}/personas`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: { dificuldade: Leitura }) => setLeitura(corpo.dificuldade))
      .catch(() => setFalhou(true));
  }, [painel.codigo]);

  if (painel.personas.length === 0) {
    return (
      <div className="card px-6 py-7">
        <h2 className="font-bold text-[17px] mb-1.5">Ninguém treinou ainda</h2>
        <p className="apoio">Assim que a primeira pessoa abrir o link e conversar, o tipo de cliente que ela encarou aparece aqui, com a nota do time.</p>
      </div>
    );
  }

  return (
    <section>
      <h2 className="section-title">Como o time vende para cada cliente</h2>
      <p className="apoio mb-4">Do cliente que o time domina para o que mais o desafia, somando todas as conversas já avaliadas deste treino.</p>
      <ul className="card px-5 py-5 flex flex-col gap-5 list-none">
        {painel.personas.map((p) => (
          <LinhaPersona key={p.id} persona={p} />
        ))}
      </ul>

      <h2 className="section-title mt-7">Onde o time mais trava</h2>
      {leitura ? (
        <>
          <p className="summary !mb-2">{leitura.frase}</p>
          <p className="text-muted text-[13px]">
            {leitura.daIA
              ? "Escrito com Inteligência Artificial a partir dos números acima, sem ler as conversas."
              : "Calculado a partir dos números acima."}
          </p>
        </>
      ) : (
        <p className="text-muted text-sm">{falhou ? "Não foi possível montar essa leitura agora. Os números acima continuam valendo." : "Carregando..."}</p>
      )}
    </section>
  );
}
