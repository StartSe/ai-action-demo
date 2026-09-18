"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DataTable, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, SeloIA, Section, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type ErroLido, type PassoIndicador } from "@/components/ui";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Briefing, Campanha, Troca } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const VAZIO: Campanha = { nome: "", objetivo: "", produto: "", numero_perguntas: 6 };

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada).
const PROMESSA = {
  sobretitulo: "Marketing",
  titulo: "Um briefing de campanha em minutos",
  apoio: "Conte o objetivo e o produto: a IA conduz uma conversa rápida e monta o briefing completo.",
  itens: [
    "Público-alvo e proposta de valor",
    "Mensagens-chave e canais sugeridos",
    "Cronograma e KPIs para acompanhar",
    "Riscos e restrições já mapeados",
    "Pronto para imprimir ou enviar",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Campanha", apoio: "Nome, objetivo e produto" },
  { titulo: "Conversa", apoio: "Perguntas rápidas" },
  { titulo: "Briefing", apoio: "Documento completo" },
];

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

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

/** Resumo somente leitura da campanha, mostrado na coluna esquerda enquanto a conversa/o briefing acontecem
 * (o formulário de cima já cumpriu seu papel — reabrir os campos só confundiria, a conversa é quem manda agora). */
function ResumoCampanha({ campanha }: { campanha: Campanha }) {
  return (
    <div className="card p-5 mb-3">
      <h2 className="font-bold text-[15px] mb-2">{campanha.nome}</h2>
      <p className="text-muted text-sm mb-1"><strong className="text-ink">Produto:</strong> {campanha.produto}</p>
      <p className="text-muted text-sm">{campanha.objetivo}</p>
    </div>
  );
}

/** Chat da entrevista de descoberta: uma pergunta por vez, sem voz (diferente de entrevista-ia, aqui é a
 * mesma pessoa que preenche o formulário quem responde, então não há sentido em ligar/candidato por link). */
function Conversa({ campanha, onFinalizar }: { campanha: Campanha; onFinalizar: (historico: Troca[]) => void }) {
  const [historico, setHistorico] = useState<Troca[]>([]);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [falha, setFalha] = useState<ErroLido | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const iniciouRef = useRef(false);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [historico]);

  async function avancar(hist: Troca[]) {
    setFalha(null);
    try {
      const r = await fetch("/api/campanha/proxima", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanha, historico: hist }) });
      if (!r.ok) {
        setFalha(await lerErro(r));
        return;
      }
      const d = await r.json();
      const novoHist: Troca[] = [...hist, { papel: "assistente", texto: d.pergunta }];
      setHistorico(novoHist);
      if (d.encerrar) {
        setFinalizando(true);
        await new Promise((res) => setTimeout(res, 700));
        onFinalizar(novoHist);
      }
    } catch (err) {
      setFalha(await lerErro(err));
    }
  }

  useEffect(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    avancar([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez, ao montar a conversa
  }, []);

  async function onResponder(e: FormEvent) {
    e.preventDefault();
    const texto = resposta.trim();
    if (!texto) return;
    setResposta("");
    const novoHist: Troca[] = [...historico, { papel: "pessoa", texto }];
    setHistorico(novoHist);
    setEnviando(true);
    await avancar(novoHist);
    setEnviando(false);
  }

  return (
    <div className="card p-5 max-md:p-4 h-full min-h-[420px] max-md:min-h-0 flex flex-col reveal">
      <h2 className="font-bold text-[15px] mb-3">Conversa rápida sobre a campanha</h2>
      <div ref={chatRef} className="flex-1 overflow-y-auto flex flex-col gap-3 mb-3 pr-1">
        {historico.map((h, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${h.papel === "assistente" ? "bg-accent-soft text-ink self-start" : "bg-accent text-white self-end"}`}
          >
            {h.texto}
          </div>
        ))}
      </div>
      {falha && (
        <div className="mb-3">
          <ErrorBox mensagem={falha.mensagem} codigo={falha.codigo as CodigoErroIA | undefined} acao={falha.acao} onTentarNovamente={() => avancar(historico)} />
        </div>
      )}
      <form onSubmit={onResponder} className="flex gap-2 items-end">
        <textarea
          className="input min-h-[52px] resize-y flex-1"
          rows={2}
          placeholder="Digite sua resposta..."
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          disabled={enviando || finalizando}
        />
        <button type="submit" className="btn-primary !w-auto" disabled={enviando || finalizando || !resposta.trim()}>
          {enviando ? "Enviando" : "Responder"}
        </button>
      </form>
    </div>
  );
}

type Estado =
  | { fase: "formulario" }
  | { fase: "conversando"; campanha: Campanha }
  | { fase: "gerando"; campanha: Campanha; historico: Troca[] }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; campanha: Campanha; historico: Troca[] }
  | { fase: "pronto"; briefing: Briefing; campanha: Campanha; historico: Troca[]; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [campanha, setCampanha] = useState<Campanha>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "formulario" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/historico").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os briefings salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/campanha", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof Campanha) => (e: { target: { value: string } }) =>
    setCampanha((c) => ({ ...c, [campo]: campo === "numero_perguntas" ? Number(e.target.value) : e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEstado({ fase: "conversando", campanha });
  }

  async function gerar(campanhaAtual: Campanha, historicoConversa: Troca[]) {
    setEstado({ fase: "gerando", campanha: campanhaAtual, historico: historicoConversa });
    try {
      const r = await fetch("/api/campanha/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanha: campanhaAtual, historico: historicoConversa }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, campanha: campanhaAtual, historico: historicoConversa });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", briefing: resposta.briefing, campanha: campanhaAtual, historico: historicoConversa, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem, campanha: campanhaAtual, historico: historicoConversa });
    }
  }

  const passoAtual = estado.fase === "pronto" ? 3 : estado.fase === "formulario" ? 1 : 2;
  const campanhaAtual = estado.fase === "formulario" ? campanha : estado.campanha;

  return (
    <>
      <Topbar marca="B" nome="Briefing de Campanha" area="Marketing" status={status} erro={erro} resumo="Modo demonstração: o briefing exibido é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          {estado.fase === "formulario" ? (
            <form onSubmit={onSubmit}>
              <div className="card p-5 mb-3">
                <h2 className="font-bold text-[15px] mb-3">Sobre a campanha</h2>
                <Row>
                  <Field label="Nome da campanha" htmlFor="nome"><input id="nome" className="input" required placeholder="Lançamento do curso de Growth" value={campanha.nome} onChange={set("nome")} /></Field>
                  <Field label="Produto ou serviço divulgado" htmlFor="produto"><input id="produto" className="input" required placeholder="Curso de Growth Marketing" value={campanha.produto} onChange={set("produto")} /></Field>
                </Row>
                <Field label="Objetivo da campanha" htmlFor="objetivo">
                  <textarea id="objetivo" className="input min-h-20 resize-y" required placeholder="Ex.: gerar 200 leads qualificados em 30 dias para o time comercial" value={campanha.objetivo} onChange={set("objetivo")} />
                </Field>
                <MaisDetalhes>
                  <Field label="Número de perguntas" htmlFor="numero_perguntas" hint="Quantas perguntas a IA faz antes de montar o briefing.">
                    <select id="numero_perguntas" className="input" value={campanha.numero_perguntas} onChange={set("numero_perguntas")}>
                      <option value={5}>5</option>
                      <option value={6}>6</option>
                      <option value={7}>7</option>
                    </select>
                  </Field>
                </MaisDetalhes>
              </div>
              <button type="submit" className="btn-primary">Começar a conversa</button>
            </form>
          ) : (
            <ResumoCampanha campanha={campanhaAtual} />
          )}

          <div className="card p-5 mt-4">
            <Privacidade detalhe="O briefing fica salvo neste app até você apagar em 'Últimos resultados'." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum briefing salvo ainda.</p>
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
          </div>
        </div>

        <Stage>
          {estado.fase === "formulario" && <Previa itens={PROMESSA.itens} />}
          {estado.fase === "conversando" && <Conversa campanha={estado.campanha} onFinalizar={(hist) => gerar(estado.campanha, hist)} />}
          {estado.fase === "gerando" && <Loading etapas={["Lendo a conversa...", "Montando público, canais e cronograma...", "Revisando o briefing..."]} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => gerar(estado.campanha, estado.historico)} />}
          {estado.fase === "pronto" && <Resultado briefing={estado.briefing} campanha={estado.campanha} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>
    </>
  );
}

export function Resultado({ briefing, campanha, meta, id }: { briefing: Briefing; campanha: Campanha; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={`Briefing de ${campanha.nome}`} subtitulo={campanha.produto}>
        <Entregar id={id} titulo={`Briefing de ${campanha.nome}`} texto={() => briefingParaTexto(briefing, campanha)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoBriefing briefing={briefing} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo do briefing (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoBriefing({ briefing }: { briefing: Briefing }) {
  return (
    <>
      <p className="summary">{briefing.resumo}</p>

      <Section titulo="Público-alvo">
        <Item>{briefing.publico_alvo}</Item>
      </Section>

      <Section titulo="Proposta de valor">
        <Item>{briefing.proposta_de_valor}</Item>
      </Section>

      <Section titulo="Mensagens-chave">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {briefing.mensagens_chave.map((m) => <Item key={m}>{m}</Item>)}
        </div>
      </Section>

      <Section titulo="Canais sugeridos">
        <DataTable
          colunas={[
            { chave: "canal", titulo: "Canal", papel: "titulo", largura: "28%", render: (c) => <strong>{c.canal}</strong> },
            { chave: "motivo", titulo: "Por quê", papel: "resumo", render: (c) => c.motivo },
          ]}
          linhas={briefing.canais_sugeridos}
        />
      </Section>

      <Section titulo="Cronograma">
        <Item>
          <div className="divide-y divide-line text-sm -my-[9px]">
            {briefing.cronograma.map((e, i) => (
              <div key={i} className="flex gap-4 py-[9px]">
                <span className="w-40 shrink-0 font-bold text-accent-ink">{e.prazo}</span>
                <span>{e.etapa}</span>
              </div>
            ))}
          </div>
        </Item>
      </Section>

      <Section titulo="KPIs para acompanhar">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {briefing.kpis.map((k) => <Item key={k}>{k}</Item>)}
        </div>
      </Section>

      <Section titulo="Tom de voz">
        <Item>{briefing.tom_de_voz}</Item>
      </Section>

      <Section titulo="Riscos e restrições">
        <Item>
          <ul className="list-disc pl-5 flex flex-col gap-1.5 text-sm">
            {briefing.riscos_e_restricoes.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Item>
      </Section>
    </>
  );
}

function briefingParaTexto(briefing: Briefing, campanha: Campanha) {
  const l: string[] = [`Briefing de ${campanha.nome} (${campanha.produto})`, "", briefing.resumo, "", "Público-alvo:", briefing.publico_alvo, "", "Proposta de valor:", briefing.proposta_de_valor, "", "Mensagens-chave:"];
  briefing.mensagens_chave.forEach((m) => l.push(`- ${m}`));
  l.push("", "Canais sugeridos:");
  briefing.canais_sugeridos.forEach((c) => l.push(`- ${c.canal}: ${c.motivo}`));
  l.push("", "Cronograma:");
  briefing.cronograma.forEach((e) => l.push(`- ${e.prazo}: ${e.etapa}`));
  l.push("", "KPIs:");
  briefing.kpis.forEach((k) => l.push(`- ${k}`));
  l.push("", `Tom de voz: ${briefing.tom_de_voz}`, "", "Riscos e restrições:");
  briefing.riscos_e_restricoes.forEach((r) => l.push(`- ${r}`));
  return l.join("\n");
}
