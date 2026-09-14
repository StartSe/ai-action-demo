"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Chip, CopyButton, DataTable, Empty, Entregar, ErrorBox, Field, Item, Loading, MaisDetalhes, Origem, Panel, Privacidade, Destaque, ResultHead, Row, Section, Stage, Topbar, Workspace, data, numero, useScrollToResult, useStatus } from "@/components/ui";
import { GraficoCriteriosFracos } from "@/components/GraficoCriteriosFracos";
import { VendedoresPainel } from "@/components/VendedoresPainel";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { Meta } from "@/lib/ai";
import type { Analise, Cenario, Conversa, DadosAnalise, PainelEquipe, Vendedor } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const EXEMPLO: DadosAnalise = {
  conversaColada: `Vendedor: Boa tarde, Rodrigo! Vi que vocês já receberam a proposta. Como ficou a comparação com as outras opções que estão avaliando?
Cliente: Olha, gostamos bastante do que vocês entregam, mas o concorrente X está cobrando uns 20% a menos pelo mesmo pacote.
Vendedor: Entendo a comparação. Posso te perguntar: além do preço, o que mais pesa nessa decisão para vocês, prazo de implantação, suporte, algo assim?
Cliente: Prazo pesa bastante, a gente precisa estar operando até o fim do mês que vem.
Vendedor: Perfeito, porque é exatamente aí que a diferença aparece: nosso time de implantação consegue colocar vocês no ar em 15 dias, contra os 45 dias que normalmente esse concorrente leva. Isso significa quase um mês a mais de operação rodando.
Cliente: Isso é relevante mesmo. Mas ainda preciso justificar a diferença de preço para o financeiro.
Vendedor: Faz sentido. Posso te mandar um comparativo simples mostrando o custo do mês extra parado versus a diferença de preço? Isso costuma ajudar na conversa com o financeiro.
Cliente: Manda sim, isso ajuda bastante.
Vendedor: Combinado, te mando ainda hoje. Podemos marcar 20 minutos na quinta para fechar os detalhes se o comparativo fizer sentido para vocês?
Cliente: Pode ser, me manda o convite.`,
  cenarioId: "desconto",
  criterios: [...CRITERIOS_PADRAO],
};

const VAZIO: DadosAnalise = { conversaColada: "", vendedorId: undefined, cenarioId: undefined, criterios: [...CRITERIOS_PADRAO] };

const ETAPAS_CARREGANDO = ["Lendo a conversa...", "Comparando com os critérios de avaliação...", "Calculando a nota e os destaques..."];

/** Duas falas em balões, no lugar de um glifo genérico no estado vazio. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12h34v18H20l-7 7v-7H6z" />
      <path d="M26 30h32v18H36l-6 6v-6h-4z" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; dados: DadosAnalise }
  | { fase: "pronto"; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string; dados: DadosAnalise }
  | { fase: "painel"; painel: PainelEquipe; meta: Meta; id: string; titulo: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosAnalise>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [novoVendedorAberto, setNovoVendedorAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaEquipe, setNovaEquipe] = useState("");
  const [salvandoVendedor, setSalvandoVendedor] = useState(false);
  const [criandoLinkTreino, setCriandoLinkTreino] = useState(false);
  const [linkTreino, setLinkTreino] = useState<string | null>(null);
  const [gerandoPainel, setGerandoPainel] = useState(false);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "painel");

  function carregarVendedores() {
    fetch("/api/vendedores").then((r) => r.json()).then((r) => setVendedores(r.itens)).catch(() => setVendedores([]));
  }

  function carregarCenarios() {
    fetch("/api/cenarios").then((r) => r.json()).then((r) => setCenarios(r.itens)).catch(() => setCenarios([]));
  }

  function carregarHistorico() {
    fetch("/api/analisar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarVendedores(); carregarCenarios(); carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/analisar", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: "conversaColada") => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  function setCriterio(i: number, valor: string) {
    setDados((d) => ({ ...d, criterios: (d.criterios || CRITERIOS_PADRAO).map((c, j) => (j === i ? valor : c)) }));
  }

  async function salvarVendedor() {
    if (!novoNome.trim()) return;
    setSalvandoVendedor(true);
    try {
      const r = await fetch("/api/vendedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome.trim(), email: novoEmail.trim() || undefined, equipe: novaEquipe.trim() || undefined }),
      });
      const novo = await r.json();
      if (r.ok) {
        setVendedores((v) => [...v, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        setDados((d) => ({ ...d, vendedorId: novo.id }));
        setNovoVendedorAberto(false);
        setNovoNome("");
        setNovoEmail("");
        setNovaEquipe("");
      }
    } finally {
      setSalvandoVendedor(false);
    }
  }

  async function criarLinkTreino() {
    setCriandoLinkTreino(true);
    try {
      const r = await fetch("/api/salas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendedorId: dados.vendedorId, cenarioId: dados.cenarioId }) });
      const resposta = await r.json();
      if (r.ok) setLinkTreino(resposta.url);
    } finally {
      setCriandoLinkTreino(false);
    }
  }

  async function verPainelEquipe() {
    setGerandoPainel(true);
    setErroPainel(null);
    try {
      const r = await fetch("/api/painel-equipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dias: 30 }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível montar o painel da equipe.");
      setEstado({ fase: "painel", painel: resposta.painel, meta: resposta.meta, id: resposta.id, titulo: resposta.titulo });
    } catch (e) {
      setErroPainel(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGerandoPainel(false);
    }
  }

  async function gerar(d: DadosAnalise) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao analisar a conversa.");
      setEstado({ fase: "pronto", conversa: resposta.conversa, analise: resposta.analise, meta: resposta.meta, id: resposta.id, titulo: resposta.titulo, dados: d });
      fetch("/api/analisar").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", dados: d });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados);
  }

  function preencherExemplo() {
    setDados(EXEMPLO);
    document.getElementById("conversaColada")?.focus();
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
  const criterios = dados.criterios || CRITERIOS_PADRAO;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: a conversa e a análise exibidas são um exemplo." />

      <Workspace>
        <Panel titulo="Treine seu time de vendas com um cliente que responde" lead="Cadastre quem está treinando, escolha um cenário e cole a conversa para entender o que o app mede antes de conectar a voz.">
          <form onSubmit={onSubmit}>
            <Field label="Vendedor (opcional)" htmlFor="vendedor" hint="Quem conduziu esta conversa.">
              <select
                id="vendedor"
                className="input"
                value={novoVendedorAberto ? "__novo__" : dados.vendedorId || ""}
                onChange={(e) => {
                  if (e.target.value === "__novo__") { setNovoVendedorAberto(true); return; }
                  setNovoVendedorAberto(false);
                  setDados((d) => ({ ...d, vendedorId: e.target.value || undefined }));
                }}
              >
                <option value="">Sem vendedor selecionado</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                <option value="__novo__">Cadastrar vendedor</option>
              </select>
            </Field>

            {novoVendedorAberto && (
              <div className="card shadow-none px-4 py-4 mb-4 flex flex-col gap-3">
                <Row>
                  <Field label="Nome" htmlFor="novoNome"><input id="novoNome" className="input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do vendedor" /></Field>
                  <Field label="E-mail (opcional)" htmlFor="novoEmail"><input id="novoEmail" type="email" className="input" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="nome@empresa.com" /></Field>
                </Row>
                <Field label="Equipe (opcional)" htmlFor="novaEquipe"><input id="novaEquipe" className="input" value={novaEquipe} onChange={(e) => setNovaEquipe(e.target.value)} placeholder="Ex.: Vendas Corporativo" /></Field>
                <div className="flex gap-2.5">
                  <button type="button" className="btn-primary !w-auto" disabled={!novoNome.trim() || salvandoVendedor} onClick={salvarVendedor}>{salvandoVendedor ? "Salvando" : "Salvar vendedor"}</button>
                  <button type="button" className="btn-ghost" onClick={() => setNovoVendedorAberto(false)}>Cancelar</button>
                </div>
              </div>
            )}

            <Field label="Cenário (opcional)" htmlFor="cenario" hint="Qual cliente simulado esta conversa representa.">
              <select id="cenario" className="input" value={dados.cenarioId || ""} onChange={(e) => setDados((d) => ({ ...d, cenarioId: e.target.value || undefined }))}>
                <option value="">Sem cenário selecionado</option>
                {cenarios.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
              </select>
            </Field>

            <div className="mb-4">
              <button type="button" className="btn-ghost" disabled={criandoLinkTreino} onClick={criarLinkTreino}>{criandoLinkTreino ? "Gerando..." : "Criar link de treino"}</button>
              <p className="text-[12.5px] text-muted mt-1.5">O vendedor treina sozinho abrindo este link, sem precisar colar nada depois.</p>
              {linkTreino && (
                <div className="card shadow-none px-4 py-3 mt-2.5 flex items-center gap-3 flex-wrap">
                  <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{linkTreino}</code>
                  <CopyButton texto={() => linkTreino} rotulo="Copiar link" />
                </div>
              )}
            </div>

            <Field label="Colar uma conversa" htmlFor="conversaColada" hint='Uma fala por linha, começando com "Vendedor:" ou "Cliente:".'>
              <textarea
                id="conversaColada"
                className="input min-h-44 resize-y font-mono text-[13px]"
                required
                placeholder={'Vendedor: Boa tarde! Como posso ajudar hoje?\nCliente: Oi, vi a proposta que vocês mandaram...\nVendedor: ...'}
                value={dados.conversaColada}
                onChange={set("conversaColada")}
              />
            </Field>

            <MaisDetalhes titulo="Critérios de avaliação">
              <p className="text-[12.5px] text-muted mb-3">Ajuste os nomes se quiser avaliar outra coisa. A ordem aqui é a mesma da tabela de resultado.</p>
              {criterios.map((c, i) => (
                <Field key={i} label={`Critério ${i + 1}`} htmlFor={`criterio-${i}`}>
                  <input id={`criterio-${i}`} className="input" value={c} onChange={(e) => setCriterio(i, e.target.value)} />
                </Field>
              ))}
            </MaisDetalhes>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar a conversa"}</button>
          </form>

          <div className="card shadow-none px-4 py-4 mb-4">
            <p className="font-bold text-[14.5px] mb-1">Painel da equipe</p>
            <p className="text-[12.5px] text-muted mb-3">Veja como cada vendedor evolui e onde a equipe tropeça, a partir das conversas já analisadas.</p>
            <button type="button" className="btn-ghost" disabled={gerandoPainel} onClick={verPainelEquipe}>{gerandoPainel ? "Montando..." : "Ver o painel da equipe"}</button>
            {erroPainel && <p className="text-danger text-[12.5px] mt-2">{erroPainel}</p>}
          </div>

          <Privacidade detalhe="A conversa e a análise ficam salvas neste app por 90 dias, até você apagar." />

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
        </Panel>

        <Stage>
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoConversa />} titulo="A análise aparece aqui" descricao="Nota geral, nota e evidência de cada critério, pontos fortes, o que melhorar e os momentos-chave da conversa." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => gerar(estado.dados)} />}
          {estado.fase === "pronto" && <Resultado conversa={estado.conversa} analise={estado.analise} meta={estado.meta} id={estado.id} titulo={estado.titulo} />}
          {estado.fase === "painel" && <ResultadoPainel painel={estado.painel} meta={estado.meta} id={estado.id} titulo={estado.titulo} />}
        </Stage>
      </Workspace>
    </>
  );
}

function tomDestaque(nota: number): "ok" | "warn" | "danger" {
  if (nota >= 7.5) return "ok";
  if (nota >= 5) return "warn";
  return "danger";
}

function tomChip(nota: number): "positivo" | "neutro" | "negativo" {
  if (nota >= 7.5) return "positivo";
  if (nota >= 5) return "neutro";
  return "negativo";
}

function interpretacaoNota(nota: number): string {
  if (nota >= 7.5) return "Conversa forte, boa referência para o time.";
  if (nota >= 5) return "Conversa satisfatória, com pontos claros para evoluir.";
  return "Conversa exige atenção antes da próxima ligação.";
}

function formatarSegundo(s?: number): string | null {
  if (s === undefined || s === null || !Number.isFinite(s)) return null;
  const min = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${min}:${String(seg).padStart(2, "0")}`;
}

export function Resultado({ conversa, analise, meta, id, titulo }: { conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${conversa.transcricao.length} falas · ${data(conversa.criadoEm)}`}>
        <Entregar id={id} titulo={titulo} texto={() => analiseParaTexto(analise)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAnalise conversa={conversa} analise={analise} />
    </article>
  );
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ conversa, analise }: { conversa: Conversa; analise: Analise }) {
  return (
    <>
      <Destaque valor={numero(analise.nota, 1)} rotulo="Nota geral" interpretacao={interpretacaoNota(analise.nota)} tom={tomDestaque(analise.nota)} />
      <p className="summary">{analise.resumo}</p>

      <Section titulo="Critérios de avaliação">
        <DataTable
          colunas={[
            { chave: "nome", titulo: "Critério", papel: "titulo", largura: "24%", render: (l) => <strong>{l.nome}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (l) => <Chip nivel={tomChip(l.nota)}>{numero(l.nota, 1)}</Chip> },
            { chave: "evidencia", titulo: "Evidência", papel: "resumo", render: (l) => l.evidencia },
            { chave: "comoMelhorar", titulo: "Como melhorar", papel: "detalhe", render: (l) => l.comoMelhorar },
          ]}
          linhas={analise.criterios}
        />
      </Section>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5 mb-8">
        <Item>
          <h3 className="font-bold mb-2">Pontos fortes</h3>
          <ul className="text-sm text-muted flex flex-col gap-1.5">
            {analise.pontosFortes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Item>
        <Item>
          <h3 className="font-bold mb-2">O que melhorar</h3>
          <ul className="text-sm text-muted flex flex-col gap-1.5">
            {analise.oQueMelhorar.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Item>
      </div>

      <Section titulo="Momentos-chave">
        <Item>
          <ul className="flex flex-col gap-2">
            {analise.momentos.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </Item>
      </Section>

      <details className="group">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Ver a conversa completa
        </summary>
        <div className="mt-3 card shadow-none divide-y divide-line text-sm">
          {conversa.transcricao.map((l, i) => {
            const tempo = formatarSegundo(l.segundo);
            return (
              <div key={i} className="px-4 py-2.5">
                <span className="font-bold">{l.papel === "vendedor" ? "Vendedor" : "Cliente"}</span>
                {tempo && <span className="text-muted text-[12px]"> · {tempo}</span>}
                <p className="mt-0.5">{l.texto}</p>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}

function analiseParaTexto(analise: Analise): string {
  const l: string[] = [`Nota geral: ${numero(analise.nota, 1)}`, "", analise.resumo, "", "Critérios:"];
  analise.criterios.forEach((c) => l.push(`- ${c.nome} (${numero(c.nota, 1)}): ${c.evidencia} | Como melhorar: ${c.comoMelhorar}`));
  l.push("", "Pontos fortes:");
  analise.pontosFortes.forEach((p) => l.push(`- ${p}`));
  l.push("", "O que melhorar:");
  analise.oQueMelhorar.forEach((p) => l.push(`- ${p}`));
  l.push("", "Momentos-chave:");
  analise.momentos.forEach((m) => l.push(`- ${m}`));
  return l.join("\n");
}

function tomVariacaoPainel(variacao: number | null): "ok" | "warn" | "danger" | "neutro" {
  if (variacao === null) return "neutro";
  if (variacao > 0) return "ok";
  if (variacao < 0) return "danger";
  return "neutro";
}

function interpretacaoVariacaoPainel(variacao: number | null): string {
  if (variacao === null) return "Sem conversas suficientes no período anterior para comparar.";
  const sinal = variacao > 0 ? "+" : "";
  return `${sinal}${numero(variacao, 1)} em relação aos 30 dias anteriores`;
}

export function ResultadoPainel({ painel, meta, id, titulo }: { painel: PainelEquipe; meta: Meta; id?: string; titulo: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${painel.vendedores.length} vendedor${painel.vendedores.length === 1 ? "" : "es"} com conversas no período`}>
        <Entregar id={id} titulo={titulo} texto={() => painelParaTexto(painel)} extras={[{ rotulo: "Baixar notas da equipe (CSV)", onClick: () => exportarNotasEquipeCSV(painel) }]} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoPainel painel={painel} />
    </article>
  );
}

/** Corpo do painel (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoPainel({ painel }: { painel: PainelEquipe }) {
  const variacao = painel.notaMediaAnterior === null ? null : Math.round((painel.notaMedia - painel.notaMediaAnterior) * 10) / 10;
  return (
    <>
      <Destaque
        valor={numero(painel.notaMedia, 1)}
        rotulo={`Nota média da equipe (últimos ${painel.dias} dias)`}
        interpretacao={interpretacaoVariacaoPainel(variacao)}
        tom={tomVariacaoPainel(variacao)}
      />

      <Section titulo="Vendedores">
        <VendedoresPainel vendedores={painel.vendedores} />
      </Section>

      <Section titulo="Critérios mais fracos da equipe">
        <Item>
          <GraficoCriteriosFracos criterios={painel.criteriosFracos} />
        </Item>
      </Section>

      <Section titulo="Em breve">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          <Item className="opacity-60">
            <div className="mb-2"><Chip nivel="neutral">Em breve</Chip></div>
            <h3 className="font-bold mb-1">Analisar ligações reais do time</h3>
            <p className="text-muted text-sm">Conecte as gravações de chamadas reais para a mesma análise por critérios, sem depender de conversas coladas.</p>
          </Item>
          <Item className="opacity-60">
            <div className="mb-2"><Chip nivel="neutral">Em breve</Chip></div>
            <h3 className="font-bold mb-1">Levar as notas para o CRM</h3>
            <p className="text-muted text-sm">Envie a nota e os destaques de cada conversa direto para o registro do negócio no seu CRM.</p>
          </Item>
        </div>
      </Section>
    </>
  );
}

function painelParaTexto(painel: PainelEquipe): string {
  const l: string[] = [`Painel da equipe — últimos ${painel.dias} dias`, `Nota média: ${numero(painel.notaMedia, 1)}`, ""];
  l.push("Vendedores:");
  painel.vendedores.forEach((v) => l.push(`- ${v.nome}: ${numero(v.notaMedia, 1)} (${v.conversas} conversa${v.conversas === 1 ? "" : "s"}, tendência ${v.tendencia}, critério mais fraco: ${v.criterioMaisFraco})`));
  l.push("", "Critérios mais fracos da equipe:");
  painel.criteriosFracos.forEach((c) => l.push(`- ${c.nome}: ${numero(c.notaMedia, 1)}`));
  return l.join("\n");
}

function exportarNotasEquipeCSV(painel: PainelEquipe) {
  const cabecalho = ["Vendedor", "Conversas", "Nota média", "Tendência", "Critério mais fraco", "Última conversa"];
  const linhas = [cabecalho.join(";")];
  painel.vendedores.forEach((v) => {
    const campos = [v.nome, String(v.conversas), numero(v.notaMedia, 1), v.tendencia, v.criterioMaisFraco, v.ultimaConversa ? data(v.ultimaConversa) : ""];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notas-equipe.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
