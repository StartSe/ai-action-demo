"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Chip,
  CopyButton,
  DataTable,
  DemoNotice,
  Empty,
  ErrorBox,
  Field,
  Item,
  Loading,
  Panel,
  ResultHead,
  Row,
  Section,
  Stage,
  Topbar,
  Workspace,
  useScrollToResult,
  useStatus,
  type Status,
} from "@/components/ui";
import { Sala } from "@/components/Sala";
import type { Scorecard, Troca, Vaga } from "@/lib/types";

const EXEMPLO: Vaga = {
  titulo: "Analista de Customer Success",
  requisitos:
    "2 anos de experiência em atendimento B2B\nComunicação escrita clara e objetiva\nExperiência com CRM (HubSpot ou similar)\nDisponibilidade para viagens ocasionais a clientes",
  candidato: "Bruno Alves",
  tom: "acolhedor",
  numero_perguntas: 5,
};

const VAZIO: Vaga = { titulo: "", requisitos: "", candidato: "", tom: "acolhedor", numero_perguntas: 5 };

type Estado =
  | { fase: "vazio" }
  | { fase: "entrevista" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; scorecard: Scorecard; demo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const [vaga, setVaga] = useState<Vaga>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [modoExemplo, setModoExemplo] = useState(false);
  const autoIniciado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  const set = (campo: "titulo" | "requisitos" | "candidato" | "tom") => (e: { target: { value: string } }) =>
    setVaga((v) => ({ ...v, [campo]: e.target.value }));

  async function finalizar(historico: Troca[]) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/entrevista/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaga, historico }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar o scorecard.");
      setEstado({ fase: "pronto", scorecard: data.scorecard, demo: data.demo });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onErroSala(mensagem: string) {
    setEstado({ fase: "erro", mensagem });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setModoExemplo(false);
    setEstado({ fase: "entrevista" });
  }

  function preencherExemplo() {
    setVaga(EXEMPLO);
    document.getElementById("titulo")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche a vaga, inicia a entrevista e simula
  // automaticamente as respostas do candidato (sem tocar áudio) até o scorecard aparecer.
  useEffect(() => {
    if (autoIniciado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoIniciado.current = true;
      setTimeout(() => {
        setVaga(EXEMPLO);
        setModoExemplo(true);
        setEstado({ fase: "entrevista" });
      }, 0);
    }
  }, []);

  const emAndamento = estado.fase === "entrevista" || estado.fase === "carregando";

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} />
      <DemoNotice
        visivel={Boolean(status && !status.ai)}
        resumo="Modo demonstração: as perguntas seguem um roteiro fixo e o scorecard é um exemplo."
      />

      <Workspace>
        <Panel
          titulo="A primeira conversa de triagem, sem tirar seu tempo."
          lead="Descreva a vaga. A entrevistadora de IA conduz a conversa por voz e texto com o candidato e te entrega um scorecard pronto para decidir os próximos passos."
        >
          <form onSubmit={onSubmit}>
            <Field label="Título da vaga" htmlFor="titulo">
              <input id="titulo" className="input" required placeholder="Analista de Customer Success" value={vaga.titulo} onChange={set("titulo")} />
            </Field>
            <Field label="Principais requisitos" htmlFor="requisitos" hint="Um requisito por linha. A entrevistadora usa isso para montar as perguntas.">
              <textarea
                id="requisitos"
                className="input min-h-24 resize-y"
                required
                placeholder="Ex.: 2 anos em atendimento B2B, comunicação escrita clara, experiência com CRM, disponibilidade para viagens ocasionais..."
                value={vaga.requisitos}
                onChange={set("requisitos")}
              />
            </Field>
            <Row>
              <Field label="Nome do candidato" htmlFor="candidato">
                <input id="candidato" className="input" required placeholder="Bruno Alves" value={vaga.candidato} onChange={set("candidato")} />
              </Field>
              <Field label="Tom da entrevista" htmlFor="tom">
                <select id="tom" className="input" value={vaga.tom} onChange={set("tom")}>
                  <option value="acolhedor">Acolhedor</option>
                  <option value="objetivo">Objetivo</option>
                </select>
              </Field>
            </Row>
            <Field label="Número de perguntas" htmlFor="numero_perguntas">
              <select
                id="numero_perguntas"
                className="input"
                value={vaga.numero_perguntas}
                onChange={(e) => setVaga((v) => ({ ...v, numero_perguntas: Number(e.target.value) }))}
              >
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6</option>
              </select>
            </Field>
            <button type="submit" className="btn-primary" disabled={emAndamento}>
              {emAndamento ? "Entrevista em andamento" : "Iniciar entrevista"}
            </button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">A conversa acontece só nesta tela. Nada é gravado além do que aparece aqui.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              glifo="E"
              titulo="A sala de entrevista aparece aqui"
              descricao='Preencha a vaga e clique em "Iniciar entrevista". A conversa acontece por voz e texto, com um scorecard ao final.'
              acao="Preencher com um exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "entrevista" && (
            <Sala vaga={vaga} status={status} modoExemplo={modoExemplo} onFinalizar={finalizar} onErro={onErroSala} />
          )}
          {estado.fase === "carregando" && <Loading texto="Analisando as respostas e montando o scorecard..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <Resultado vaga={vaga} scorecard={estado.scorecard} demo={estado.demo} status={status} />}
        </Stage>
      </Workspace>
    </>
  );
}

function Resultado({ vaga, scorecard, demo, status }: { vaga: Vaga; scorecard: Scorecard; demo: boolean; status: Status | null }) {
  const recClasse = scorecard.recomendacao === "avançar" ? "baixa" : scorecard.recomendacao === "não avançar" ? "alta" : "media";
  return (
    <article className="reveal">
      <ResultHead titulo={`Scorecard de ${vaga.candidato}`} subtitulo={`${vaga.titulo}${demo ? " (exemplo em modo demonstração)" : ""}`}>
        <CopyButton texto={() => scorecardParaTexto(scorecard, vaga)} rotulo="Copiar scorecard" />
        <button type="button" className="btn-ghost" onClick={() => location.reload()}>Nova entrevista</button>
      </ResultHead>

      <div className="summary nota-summary">
        <div className="nota-grande">
          {Number(scorecard.nota_geral).toFixed(1)}
          <span>/10</span>
        </div>
        <div>
          <Chip nivel={recClasse}>{scorecard.recomendacao}</Chip>
          <p className="mt-2">{scorecard.resumo}</p>
        </div>
      </div>

      <Section titulo="Critérios avaliados">
        <DataTable
          colunas={[
            { chave: "criterio", titulo: "Critério", render: (c) => <strong>{c.criterio}</strong> },
            { chave: "nota", titulo: "Nota", render: (c) => `${c.nota}/10` },
            { chave: "evidencia", titulo: "Evidência", render: (c) => c.evidencia },
          ]}
          linhas={scorecard.criterios}
        />
      </Section>

      <Section titulo="Pontos fortes">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {scorecard.pontos_fortes.map((p, i) => (
            <Item key={i}>
              <p>{p}</p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Pontos de atenção">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {scorecard.pontos_atencao.map((p, i) => (
            <Item key={i}>
              <p>{p}</p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Próximos passos">
        <Item>
          {scorecard.proximos_passos.map((p, i) => (
            <p key={i} className="my-1.5">
              - {p}
            </p>
          ))}
        </Item>
      </Section>

      <SecaoLigar vaga={vaga} habilitado={Boolean(status?.integrations?.ligacao)} />
    </article>
  );
}

function SecaoLigar({ vaga, habilitado }: { vaga: Vaga; habilitado: boolean }) {
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [ligando, setLigando] = useState(false);

  if (!habilitado) {
    return (
      <p className="text-muted text-[12.5px] mb-8">
        Ligação automática por telefone desligada. <a href="/setup" className="btn-link">Conecte a ElevenLabs em /setup</a> para habilitar.
      </p>
    );
  }

  async function onLigar() {
    const tel = telefone.trim();
    if (!tel) {
      setMensagem("Informe o telefone.");
      return;
    }
    setLigando(true);
    setMensagem("Ligando...");
    try {
      const r = await fetch("/api/ligar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: tel, vaga: vaga.titulo, requisitos: vaga.requisitos, candidato: vaga.candidato }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao ligar.");
      setMensagem("Ligação iniciada.");
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Falha ao ligar.");
    } finally {
      setLigando(false);
    }
  }

  return (
    <Section titulo="Ligar para o candidato">
      <div className="ligacao-row max-md:flex-col">
        <input className="input" placeholder="+55 11 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        <button type="button" className="btn-ghost" onClick={onLigar} disabled={ligando}>
          Ligar agora
        </button>
      </div>
      {mensagem && <p className="text-muted text-[12.5px] mt-2">{mensagem}</p>}
    </Section>
  );
}

function scorecardParaTexto(sc: Scorecard, vaga: Vaga) {
  const linhas: string[] = [
    `Scorecard de ${vaga.candidato} (${vaga.titulo})`,
    "",
    `Nota geral: ${sc.nota_geral}/10`,
    `Recomendação: ${sc.recomendacao}`,
    "",
    sc.resumo,
    "",
    "Critérios:",
  ];
  sc.criterios.forEach((c) => linhas.push(`- ${c.criterio}: ${c.nota} — ${c.evidencia}`));
  linhas.push("", "Pontos fortes:");
  sc.pontos_fortes.forEach((p) => linhas.push(`- ${p}`));
  linhas.push("", "Pontos de atenção:");
  sc.pontos_atencao.forEach((p) => linhas.push(`- ${p}`));
  linhas.push("", "Próximos passos:");
  sc.proximos_passos.forEach((p) => linhas.push(`- ${p}`));
  return linhas.join("\n");
}
