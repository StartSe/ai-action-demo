"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, CopyButton, DataTable, DemoNotice, Empty, ErrorBox, Field, Item, Loading, Panel, ResultHead, Row, Section, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import type { DadosPDI, PDI } from "@/lib/types";

const EXEMPLO: DadosPDI = {
  nome: "Marina Costa",
  cargo: "Coordenadora de Marketing",
  tempo: "1 a 3 anos",
  entregas: "Liderou o lançamento da campanha de rebranding no prazo e dentro do orçamento. Reduziu o custo por lead em 18% no último trimestre. Trouxe pesquisa com clientes que mudou o posicionamento do produto principal. Assumiu a relação com a agência. Time de 3 analistas, todos com menos de 1 ano de casa.",
  objetivos: "Crescer 30% em receita recorrente até dezembro. Abrir o mercado de médias empresas. Reduzir a dependência de mídia paga com conteúdo e comunidade.",
  aspiracoes: "Assumir a gerência de marketing nos próximos 2 anos",
};

const VAZIO: DadosPDI = { nome: "", cargo: "", tempo: "1 a 3 anos", entregas: "", objetivos: "", aspiracoes: "" };

type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string } | { fase: "pronto"; pdi: PDI; dados: DadosPDI; demo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosPDI>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const formRef = useRef<HTMLFormElement>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  const set = (campo: keyof DadosPDI) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function gerar(d: DadosPDI) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/pdi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar o PDI.");
      setEstado({ fase: "pronto", pdi: data.pdi, dados: d, demo: data.demo });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados);
  }

  function preencherExemplo() {
    setDados(EXEMPLO);
    document.getElementById("nome")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setDados(EXEMPLO); gerar(EXEMPLO); }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="P" nome="PDI do Time" area="Recursos Humanos" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && !status.ai)} resumo="Modo demonstração: o plano exibido é um exemplo." />

      <Workspace>
        <Panel titulo="Um plano de desenvolvimento em três minutos." lead="Descreva o que a pessoa entregou e o que a empresa precisa. A IA conecta os dois em um PDI de 90 dias pronto para a conversa de feedback.">
          <form ref={formRef} onSubmit={onSubmit}>
            <Row>
              <Field label="Nome" htmlFor="nome"><input id="nome" className="input" required placeholder="Marina Costa" value={dados.nome} onChange={set("nome")} /></Field>
              <Field label="Cargo" htmlFor="cargo"><input id="cargo" className="input" required placeholder="Coordenadora de Marketing" value={dados.cargo} onChange={set("cargo")} /></Field>
            </Row>
            <Field label="Tempo na função" htmlFor="tempo">
              <select id="tempo" className="input" value={dados.tempo} onChange={set("tempo")}>
                <option>menos de 1 ano</option><option>1 a 3 anos</option><option>3 a 5 anos</option><option>mais de 5 anos</option>
              </select>
            </Field>
            <Field label="Entregas e atividades recentes" htmlFor="entregas" hint="Cole itens do kanban, do 1:1 ou da avaliação. Quanto mais concreto, melhor.">
              <textarea id="entregas" className="input min-h-24 resize-y" required placeholder="Ex.: liderou o lançamento da campanha X, reduziu custo por lead em 18%, assumiu a relação com a agência..." value={dados.entregas} onChange={set("entregas")} />
            </Field>
            <Field label="Objetivos da empresa para o período" htmlFor="objetivos">
              <textarea id="objetivos" className="input min-h-24 resize-y" required placeholder="Ex.: crescer 30% em receita recorrente, abrir o mercado corporativo, reduzir churn para 2%..." value={dados.objetivos} onChange={set("objetivos")} />
            </Field>
            <Field label="Aspirações da pessoa (opcional)" htmlFor="aspiracoes">
              <input id="aspiracoes" className="input" placeholder="Ex.: assumir a gerência da área em 2 anos" value={dados.aspiracoes} onChange={set("aspiracoes")} />
            </Field>
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando plano" : "Gerar PDI"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">Nada é salvo. O plano existe só nesta tela até você imprimir ou copiar.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && <Empty glifo="90" titulo="O plano aparece aqui" descricao="Pontos fortes, lacunas priorizadas, três objetivos com ações em 30, 60 e 90 dias e perguntas para a conversa." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading texto="Lendo entregas, cruzando com os objetivos da empresa e montando o plano..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <Resultado pdi={estado.pdi} dados={estado.dados} demo={estado.demo} />}
        </Stage>
      </Workspace>
    </>
  );
}

function Resultado({ pdi, dados, demo }: { pdi: PDI; dados: DadosPDI; demo: boolean }) {
  return (
    <article className="reveal">
      <ResultHead titulo={`PDI de ${dados.nome}`} subtitulo={`${dados.cargo}, ${dados.tempo} na função${demo ? " (exemplo em modo demonstração)" : ""}`}>
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Imprimir ou salvar PDF</button>
        <CopyButton texto={() => pdiParaTexto(pdi, dados)} />
      </ResultHead>

      <p className="summary">{pdi.resumo}</p>

      <Section titulo="Pontos fortes a preservar">
        <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5">
          {pdi.pontos_fortes.map((f) => <Item key={f.titulo}><h3 className="font-bold mb-1">{f.titulo}</h3><p className="text-muted text-sm">{f.evidencia}</p></Item>)}
        </div>
      </Section>

      <Section titulo="Lacunas priorizadas">
        <DataTable
          colunas={[
            { chave: "competencia", titulo: "Competência", render: (l) => <strong>{l.competencia}</strong> },
            { chave: "impacto", titulo: "Impacto no negócio", render: (l) => l.impacto },
            { chave: "prioridade", titulo: "Prioridade", render: (l) => <Chip nivel={l.prioridade}>{l.prioridade}</Chip> },
          ]}
          linhas={pdi.lacunas}
        />
      </Section>

      <Section titulo="Objetivos de desenvolvimento para 90 dias">
        {pdi.objetivos.map((o) => (
          <div key={o.titulo} className="card shadow-none px-[22px] py-5 mb-3.5">
            <header className="flex justify-between gap-4 mb-3 flex-wrap">
              <div><h3 className="font-bold">{o.titulo}</h3><p className="text-muted text-sm">{o.resultado_esperado}</p></div>
              <div className="text-[13px] text-muted">Indicador<br /><strong className="text-ink">{o.indicador}</strong></div>
            </header>
            <div className="border-t border-line divide-y divide-line text-sm">
              {o.acoes.map((a) => (
                <div key={a.prazo} className="flex gap-4 py-[11px]"><span className="w-24 shrink-0 font-bold text-accent-ink">{a.prazo}</span><span>{a.acao}</span></div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section titulo="Recursos de apoio">
        <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5">
          {pdi.recursos.map((r) => <Item key={r.nome}><Chip nivel="neutral">{r.tipo}</Chip><h3 className="font-bold mt-2 mb-1">{r.nome}</h3><p className="text-muted text-sm">{r.motivo}</p></Item>)}
        </div>
      </Section>

      <Section titulo="Para abrir a conversa de feedback">
        <Item>{pdi.conversa_sugerida.map((q) => <p key={q} className="my-1.5">“{q}”</p>)}</Item>
      </Section>
    </article>
  );
}

function pdiParaTexto(pdi: PDI, d: DadosPDI) {
  const l: string[] = [`PDI de ${d.nome} (${d.cargo})`, "", pdi.resumo, "", "Pontos fortes:"];
  pdi.pontos_fortes.forEach((f) => l.push(`- ${f.titulo}: ${f.evidencia}`));
  l.push("", "Lacunas:");
  pdi.lacunas.forEach((x) => l.push(`- ${x.competencia} (${x.prioridade}): ${x.impacto}`));
  l.push("", "Objetivos:");
  pdi.objetivos.forEach((o) => { l.push(`- ${o.titulo}: ${o.resultado_esperado} | Indicador: ${o.indicador}`); o.acoes.forEach((a) => l.push(`    ${a.prazo}: ${a.acao}`)); });
  l.push("", "Recursos:");
  pdi.recursos.forEach((r) => l.push(`- ${r.tipo}: ${r.nome} (${r.motivo})`));
  l.push("", "Perguntas para a conversa:");
  pdi.conversa_sugerida.forEach((q) => l.push(`- ${q}`));
  return l.join("\n");
}
