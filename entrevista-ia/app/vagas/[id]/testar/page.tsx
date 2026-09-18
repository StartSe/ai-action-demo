"use client";
// "Testar a entrevista" (US-007, decisão D11 da PRD): o gestor conversa com a entrevistadora para ver
// o roteiro que esta vaga gerou, digitando no lugar do candidato.
//
// É uma PRÉVIA: nada é gravado, nenhuma entrevista é criada e nenhum parecer sai daqui. Antes desta
// história, "iniciar entrevista" pelo gestor era o caminho principal do app e confundia o propósito
// dele — quem responde a entrevista de verdade é o candidato, pelo link.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Sala } from "@/components/Sala";
import { faixaSalarial, type VagaSalva } from "@/components/FormularioVaga";
import { Aviso, ErrorBox, Topbar, lerErro, useStatus, type ErroLido } from "@/components/ui";
import { ACAO_VOZ } from "@/lib/acoes";
import type { Tom, Vaga as VagaDaConversa } from "@/lib/types";

/** O que a entrevistadora recebe nesta prévia. Enquanto `lib/roteiro.ts` não existe (US-016), o
 * roteiro é o mesmo texto que a página da vaga mostra: requisitos, desafios e competências, na mesma
 * ordem — assim a prévia pergunta sobre o que está escrito na vaga, e não só sobre os requisitos. */
function conversaDaVaga(vaga: VagaSalva): VagaDaConversa {
  const competencias = vaga.competenciasCulturais.map((c) => c.nome).join(", ");
  return {
    titulo: vaga.cargo,
    requisitos: [
      vaga.requisitos,
      vaga.desafios ? `Desafios dos primeiros meses: ${vaga.desafios}` : "",
      competencias ? `Competências culturais a observar: ${competencias}` : "",
      `Faixa salarial: ${faixaSalarial(vaga)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    // A prévia não tem candidato: quem digita é quem abriu a vaga.
    candidato: "você",
    tom: vaga.tom as Tom,
    numero_perguntas: vaga.numeroPerguntas,
  };
}

export default function Page() {
  const { status, erro } = useStatus();
  const { id } = useParams<{ id: string }>();

  const [vaga, setVaga] = useState<VagaSalva | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [encerrada, setEncerrada] = useState(false);
  // Trocar a chave da sala é o que recomeça a prévia do zero: a conversa inteira mora dentro dela.
  const [tentativa, setTentativa] = useState(1);

  useEffect(() => {
    fetch(`/api/vagas/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setVaga(corpo.vaga))
      .catch(async (e) => setErroTela(await lerErro(e)));
  }, [id]);

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={`/vagas/${id}`} className="btn-link text-[13px]">← Voltar para a vaga</Link>
        <h1 className="titulo-painel mt-3 mb-1.5">Testar a entrevista</h1>
        <p className="apoio mb-5">Você responde no lugar do candidato para ouvir as perguntas que esta vaga gera.</p>

        <div className="mb-5">
          <Aviso>Prévia do roteiro. Nada aqui é salvo.</Aviso>
        </div>

        {erroTela ? (
          <ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar para as vagas", url: "/vagas" }} />
        ) : !vaga ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : encerrada ? (
          <div className="card p-6 flex flex-col gap-4 items-start">
            <div>
              <h2 className="font-extrabold text-[17px] mb-1">Prévia encerrada</h2>
              <p className="apoio">Nada desta conversa foi salvo: não há entrevista nem parecer. Os pareceres saem das conversas dos candidatos, pelo link do convite.</p>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <button
                type="button"
                className="btn-ghost !w-auto"
                onClick={() => {
                  setTentativa((n) => n + 1);
                  setEncerrada(false);
                }}
              >
                Testar de novo
              </button>
              <Link href={`/vagas/${id}`} className="btn-primary !w-auto">Voltar para a vaga</Link>
            </div>
          </div>
        ) : (
          <Sala
            key={tentativa}
            vaga={conversaDaVaga(vaga)}
            rotas={{ proxima: "/api/entrevista/proxima", voz: "/api/tts" }}
            vozLigada={Boolean(status?.integrations?.tts)}
            acaoVoz={ACAO_VOZ}
            modoExemplo={false}
            onFinalizar={() => setEncerrada(true)}
          />
        )}
      </main>
    </>
  );
}
