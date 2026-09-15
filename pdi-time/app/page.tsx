"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, DataTable, Empty, Entregar, ErrorBox, Field, Item, Loading, MaisDetalhes, OptInGuardar, Origem, Panel, Privacidade, ResultHead, Row, Section, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { DialogoAutoavaliacao } from "@/components/DialogoAutoavaliacao";
import { LembrarCheckins } from "@/components/LembrarCheckins";
import { SENSIVEL } from "@/lib/sensivel";
import type { Meta } from "@/lib/ai";
import type { DadosPDI, PDI } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type ItemAutoavaliacao = { id: string; nome: string; criadoEm: string; resultadoId: string | null };

const EXEMPLO: DadosPDI = {
  nome: "Marina Costa",
  cargo: "Coordenadora de Marketing",
  tempo: "1 a 3 anos",
  entregas: "Liderou o lançamento da campanha de rebranding no prazo e dentro do orçamento. Reduziu o custo por lead em 18% no último trimestre. Trouxe pesquisa com clientes que mudou o posicionamento do produto principal. Assumiu a relação com a agência. Time de 3 analistas, todos com menos de 1 ano de casa.",
  objetivos: "Crescer 30% em receita recorrente até dezembro. Abrir o mercado de médias empresas. Reduzir a dependência de mídia paga com conteúdo e comunidade.",
  aspiracoes: "Assumir a gerência de marketing nos próximos 2 anos",
};

const VAZIO: DadosPDI = { nome: "", cargo: "", tempo: "1 a 3 anos", entregas: "", objetivos: "", aspiracoes: "", dataConversa: "", preparadoPor: "" };

const ETAPAS_CARREGANDO = ["Lendo as entregas recentes...", "Cruzando com os objetivos da empresa...", "Montando o plano de 30, 60 e 90 dias..."];

/** Desenho de três blocos crescentes rotulados 30/60/90, no lugar de um glifo genérico no estado vazio. */
function IlustracaoPlano() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 48h56" />
      <rect x="6" y="33" width="14" height="15" rx="3" />
      <rect x="25" y="24" width="14" height="24" rx="3" />
      <rect x="44" y="14" width="14" height="34" rx="3" />
      <text x="13" y="43" textAnchor="middle" fontSize="7" stroke="none" fill="currentColor">30</text>
      <text x="32" y="38" textAnchor="middle" fontSize="7" stroke="none" fill="currentColor">60</text>
      <text x="51" y="33" textAnchor="middle" fontSize="7" stroke="none" fill="currentColor">90</text>
    </svg>
  );
}

type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string; dados: DadosPDI } | { fase: "pronto"; pdi: PDI; dados: DadosPDI; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosPDI>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [guardar, setGuardar] = useState(false);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [autoavaliacaoAberta, setAutoavaliacaoAberta] = useState(false);
  const [autoavaliacoes, setAutoavaliacoes] = useState<ItemAutoavaliacao[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/pdi").then((r) => r.json()).then((r) => {
      setHistorico(r.itens);
      if (r.nomeUsuario) setDados((d) => (d.preparadoPor ? d : { ...d, preparadoPor: r.nomeUsuario }));
    }).catch(() => setHistorico([]));
  }

  function carregarAutoavaliacoes() {
    fetch("/api/pdi/autoavaliacao").then((r) => r.json()).then((r) => setAutoavaliacoes(r.itens)).catch(() => setAutoavaliacoes([]));
  }

  useEffect(() => { carregarHistorico(); carregarAutoavaliacoes(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/pdi", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosPDI) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function gerar(d: DadosPDI, guardarResultado: boolean) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/pdi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, guardar: guardarResultado }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar o PDI.");
      setEstado({ fase: "pronto", pdi: resposta.pdi, dados: d, meta: resposta.meta, id: resposta.id });
      fetch("/api/pdi").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", dados: d });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados, guardar);
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
      setTimeout(() => { setDados(EXEMPLO); gerar(EXEMPLO, false); }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="P" nome="PDI do Time" area="Recursos Humanos" status={status} erro={erro} resumo="Modo demonstração: o plano exibido é um exemplo." usuario={status?.usuario} />

      <Workspace>
        <Panel titulo="Um plano de desenvolvimento em três minutos." lead="Descreva o que a pessoa entregou e o que a empresa precisa para receber um PDI de 90 dias pronto para a conversa de feedback.">
          <form ref={formRef} onSubmit={onSubmit}>
            <Row>
              <Field label="Nome" htmlFor="nome"><input id="nome" className="input" required placeholder="Marina Costa" value={dados.nome} onChange={set("nome")} /></Field>
              <Field label="Cargo" htmlFor="cargo"><input id="cargo" className="input" required placeholder="Coordenadora de Marketing" value={dados.cargo} onChange={set("cargo")} /></Field>
            </Row>
            <Field label="Tempo na função" htmlFor="tempo">
              <select id="tempo" className="input" value={dados.tempo} onChange={set("tempo")}>
                <option>Menos de 1 ano</option><option>1 a 3 anos</option><option>3 a 5 anos</option><option>Mais de 5 anos</option>
              </select>
            </Field>
            <Field label="Entregas e atividades recentes" htmlFor="entregas" hint="Cole itens do kanban, do 1:1 ou da avaliação. Quanto mais concreto, melhor.">
              <textarea id="entregas" className="input min-h-24 resize-y" required placeholder="Ex.: liderou o lançamento da campanha X, reduziu custo por lead em 18%, assumiu a relação com a agência..." value={dados.entregas} onChange={set("entregas")} />
            </Field>
            <Field label="Objetivos da empresa para o período" htmlFor="objetivos">
              <textarea id="objetivos" className="input min-h-24 resize-y" required placeholder="Ex.: crescer 30% em receita recorrente, abrir o mercado corporativo, reduzir churn para 2%..." value={dados.objetivos} onChange={set("objetivos")} />
            </Field>
            <MaisDetalhes>
              <Field label="Aspirações da pessoa (opcional)" htmlFor="aspiracoes">
                <input id="aspiracoes" className="input" placeholder="Ex.: assumir a gerência da área em 2 anos" value={dados.aspiracoes} onChange={set("aspiracoes")} />
              </Field>
              <Row>
                <Field label="Data da conversa (opcional)" htmlFor="dataConversa" hint="Usada para calcular as datas reais das ações de 30, 60 e 90 dias.">
                  <input id="dataConversa" type="date" className="input" value={dados.dataConversa ?? ""} onChange={set("dataConversa")} />
                </Field>
                <Field label="Seu nome (opcional)" htmlFor="preparadoPor" hint="Aparece como 'Preparado por' na folha de impressão.">
                  <input id="preparadoPor" className="input" placeholder="Seu nome" value={dados.preparadoPor ?? ""} onChange={set("preparadoPor")} />
                </Field>
              </Row>
            </MaisDetalhes>
            {SENSIVEL && <OptInGuardar checked={guardar} onChange={setGuardar} />}
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando plano" : "Gerar PDI"}</button>
          </form>
          <Privacidade detalhe="O plano fica salvo neste app até você apagar em 'Últimos resultados'." />

          <div className="mt-5 pt-5 border-t border-line">
            <p className="text-[13px] font-semibold mb-2">Prefere que a própria pessoa preencha?</p>
            <button type="button" className="btn-ghost" onClick={() => setAutoavaliacaoAberta(true)}>Pedir autoavaliação por link</button>
          </div>

          <MaisDetalhes titulo="Últimos resultados">
            {historico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5 text-sm mb-3">
                  {historico.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                      <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
              </>
            )}
          </MaisDetalhes>

          <MaisDetalhes titulo="Autoavaliações recebidas">
            {autoavaliacoes === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : autoavaliacoes.length === 0 ? (
              <p className="text-muted text-sm">Nenhuma resposta recebida ainda.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {autoavaliacoes.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span className="truncate">{a.nome}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-muted">{data(a.criadoEm)}</span>
                      {a.resultadoId ? (
                        <Link href={`/r/${a.resultadoId}`} className="text-accent-ink font-semibold hover:underline">Abrir PDI</Link>
                      ) : (
                        <span className="text-muted">Falha ao gerar</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </MaisDetalhes>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoPlano />} titulo="O plano aparece aqui" descricao="Pontos fortes, lacunas priorizadas, três objetivos com ações em 30, 60 e 90 dias e perguntas para a conversa." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => gerar(estado.dados, guardar)} />}
          {estado.fase === "pronto" && <Resultado pdi={estado.pdi} dados={estado.dados} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>

      {autoavaliacaoAberta && (
        <DialogoAutoavaliacao
          onFechar={() => { setAutoavaliacaoAberta(false); carregarAutoavaliacoes(); }}
          objetivosIniciais={dados.objetivos}
        />
      )}
    </>
  );
}

export function Resultado({ pdi, dados, meta, id }: { pdi: PDI; dados: DadosPDI; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={`PDI de ${dados.nome}`} subtitulo={`${dados.cargo}, ${dados.tempo} na função`}>
        <Entregar id={id} titulo={`PDI de ${dados.nome}`} texto={() => pdiParaTexto(pdi, dados)} />
      </ResultHead>

      <Origem meta={meta} />
      {id && <LembrarCheckins resultadoId={id} />}

      <ConteudoPDI pdi={pdi} dataConversa={dados.dataConversa} />
    </article>
  );
}

/** "30 dias" vira "30 dias · 12/10/2026" quando há uma data da conversa para calcular a partir dela. */
function prazoComData(prazo: string, dataConversa?: string) {
  if (!dataConversa) return prazo;
  const dias = Number(prazo.match(/\d+/)?.[0]);
  if (!dias) return prazo;
  const data_ = new Date(`${dataConversa}T00:00:00`);
  data_.setDate(data_.getDate() + dias);
  return `${prazo} · ${data(data_, { comAno: true })}`;
}

/** Corpo do PDI (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoPDI({ pdi, dataConversa }: { pdi: PDI; dataConversa?: string }) {
  return (
    <>
      <p className="summary">{pdi.resumo}</p>

      <Section titulo="Pontos fortes a preservar">
        <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5">
          {pdi.pontos_fortes.map((f) => <Item key={f.titulo}><h3 className="font-bold mb-1">{f.titulo}</h3><p className="text-muted text-sm">{f.evidencia}</p></Item>)}
        </div>
      </Section>

      <Section titulo="Lacunas priorizadas">
        <DataTable
          colunas={[
            { chave: "competencia", titulo: "Competência", papel: "titulo", largura: "22%", render: (l) => <strong>{l.competencia}</strong> },
            { chave: "impacto", titulo: "Impacto no negócio", papel: "resumo", render: (l) => l.impacto },
            { chave: "prioridade", titulo: "Prioridade", papel: "chip", largura: "110px", render: (l) => <Chip nivel={l.prioridade} /> },
          ]}
          linhas={pdi.lacunas}
        />
      </Section>

      <Section titulo="Objetivos de desenvolvimento para 90 dias">
        {pdi.objetivos.map((o) => (
          <div key={o.titulo} className="card shadow-none px-[22px] py-5 mb-3.5">
            <header className="flex justify-between gap-4 mb-3 max-md:flex-col">
              <div><h3 className="font-bold">{o.titulo}</h3><p className="text-muted text-sm">{o.resultado_esperado}</p></div>
              <div className="text-[13px] text-muted md:w-40 md:shrink-0 md:text-right">Indicador<br /><strong className="text-ink">{o.indicador}</strong></div>
            </header>
            <div className="border-t border-line divide-y divide-line text-sm">
              {o.acoes.map((a) => (
                <div key={a.prazo} className="flex gap-4 py-[11px]"><span className={`${dataConversa ? "w-36" : "w-24"} shrink-0 font-bold text-accent-ink`}>{prazoComData(a.prazo, dataConversa)}</span><span>{a.acao}</span></div>
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

      {pdi.acompanhamento && pdi.acompanhamento.length > 0 && (
        <Section titulo="Acompanhamento">
          <div className="flex flex-col gap-3">
            {pdi.acompanhamento.map((a, i) => (
              <div key={i} className="card shadow-none px-[22px] py-4">
                <p className="text-[13px] text-muted mb-1.5">Check-in de {a.marco} dias · {data(a.data, { comHora: true })}</p>
                <p className="mb-2">{a.texto}</p>
                {a.statusAcoes.length > 0 && (
                  <ul className="text-sm flex flex-col gap-1">
                    {a.statusAcoes.map((s, j) => <li key={j}><strong>{s.acao}</strong>: {s.status}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
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
  if (pdi.acompanhamento?.length) {
    l.push("", "Acompanhamento:");
    pdi.acompanhamento.forEach((a) => {
      l.push(`- Check-in de ${a.marco} dias (${a.data}): ${a.texto}`);
      a.statusAcoes.forEach((s) => l.push(`    ${s.acao}: ${s.status}`));
    });
  }
  return l.join("\n");
}
