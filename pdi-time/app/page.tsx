"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Chip, DataTable, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, OptInGuardar, Origem, Passos, Privacidade, ResultHead, Row, SeloIA, Section, Stage, Topbar, data, useScrollToResult, useStatus, type PassoIndicador } from "@/components/ui";
import { DialogoAutoavaliacao } from "@/components/DialogoAutoavaliacao";
import { LembrarCheckins } from "@/components/LembrarCheckins";
import { SENSIVEL } from "@/lib/sensivel";
import type { CodigoErroIA, Meta } from "@/lib/ai";
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

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Recursos Humanos",
  titulo: "Um PDI pronto em três minutos",
  apoio: "Descreva as entregas recentes e os objetivos da empresa: a IA devolve um plano de 90 dias.",
  itens: [
    "Pontos fortes e lacunas priorizadas",
    "Ações para 30/60/90 dias",
    "Indicadores para medir o progresso",
    "Perguntas prontas para a conversa",
    "Pronto para imprimir ou enviar",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Colaborador", apoio: "Informe os dados" },
  { titulo: "Contexto", apoio: "Entregas e objetivos" },
  { titulo: "PDI", apoio: "Plano em 30, 60 e 90 dias" },
];

function IconePessoa() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  );
}

function IconeContexto() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 12h7M8.5 16h7" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título, no lugar da coluna única de campos crus. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes de gerar o primeiro PDI. */
function Previa({ itens }: { itens: string[] }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; dados: DadosPDI }
  | { fase: "pronto"; pdi: PDI; dados: DadosPDI; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
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

  async function gerar(d: DadosPDI, guardarResultado: boolean, erroForcado?: string) {
    setEstado({ fase: "carregando" });
    try {
      const url = erroForcado ? `/api/pdi?erro=${erroForcado}` : "/api/pdi";
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, guardar: guardarResultado }) });
      const resposta = await r.json();
      if (!r.ok) {
        if (r.status === 401 && resposta.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        throw { mensagem: resposta.error || "Falha ao gerar o PDI.", codigo: resposta.codigo, acao: resposta.acao };
      }
      setEstado({ fase: "pronto", pdi: resposta.pdi, dados: d, meta: resposta.meta, id: resposta.id });
      fetch("/api/pdi").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      const info = e as { mensagem?: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string } };
      setEstado({ fase: "erro", mensagem: info.mensagem || "Erro inesperado.", codigo: info.codigo, acao: info.acao, dados: d });
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

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário; /?erro=sem_credito (só em dev) força o erro para capturar a tela.
  useEffect(() => {
    if (autoEnviado.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setDados(EXEMPLO); gerar(EXEMPLO, false); }, 0);
    } else if (process.env.NODE_ENV !== "production" && params.get("erro") === "sem_credito") {
      autoEnviado.current = true;
      setTimeout(() => { setDados(EXEMPLO); gerar(EXEMPLO, false, "sem_credito"); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : dados.entregas || dados.objetivos ? 2 : 1;

  return (
    <>
      <Topbar marca="P" nome="PDI do Time" area="Recursos Humanos" status={status} erro={erro} resumo="Modo demonstração: o plano exibido é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="RH">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form ref={formRef} onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconePessoa />} titulo="Sobre o colaborador">
              <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3 [&>*]:min-w-0">
                <Field label="Nome" htmlFor="nome"><input id="nome" className="input" required placeholder="Marina Costa" value={dados.nome} onChange={set("nome")} /></Field>
                <Field label="Cargo" htmlFor="cargo"><input id="cargo" className="input" required placeholder="Coordenadora de Marketing" value={dados.cargo} onChange={set("cargo")} /></Field>
                <Field label="Tempo na função" htmlFor="tempo">
                  <select id="tempo" className="input" value={dados.tempo} onChange={set("tempo")}>
                    <option>Menos de 1 ano</option><option>1 a 3 anos</option><option>3 a 5 anos</option><option>Mais de 5 anos</option>
                  </select>
                </Field>
              </div>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeContexto />} titulo="Contexto profissional">
              <Row>
                <Field label="Entregas e atividades recentes" htmlFor="entregas">
                  <textarea id="entregas" className="input min-h-20 resize-y" required placeholder="Ex.: liderou o lançamento da campanha X, reduziu custo por lead em 18%..." value={dados.entregas} onChange={set("entregas")} />
                </Field>
                <Field label="Objetivos da empresa para o período" htmlFor="objetivos">
                  <textarea id="objetivos" className="input min-h-20 resize-y" required placeholder="Ex.: crescer 30% em receita recorrente, abrir o mercado corporativo..." value={dados.objetivos} onChange={set("objetivos")} />
                </Field>
              </Row>
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
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando plano" : "Gerar PDI"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={preencherExemplo}>Usar colaborador de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
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
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
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
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => gerar(estado.dados, guardar)} />}
          {estado.fase === "pronto" && <Resultado pdi={estado.pdi} dados={estado.dados} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>

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

      <SeloIA demo={meta.demo} />
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
