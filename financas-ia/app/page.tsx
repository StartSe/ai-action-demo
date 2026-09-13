"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Chip,
  CopyButton,
  DataTable,
  Destaque,
  Dropzone,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Item,
  Loading,
  MaisDetalhes,
  OptInGuardar,
  Origem,
  Panel,
  Privacidade,
  ResultHead,
  Row,
  Section,
  Stage,
  Topbar,
  Workspace,
  data,
  useScrollToResult,
  useStatus,
} from "@/components/ui";
import { SENSIVEL } from "@/lib/sensivel";
import type { Meta } from "@/lib/ai";
import { parseCSV, sugerirMapeamento } from "@/lib/csv";
import { calcularResumo, formatarMoeda, normalizarRegistros } from "@/lib/analise";
import { GraficoCategorias } from "@/components/GraficoCategorias";
import { GraficoMeses } from "@/components/GraficoMeses";
import type { Destaque as TipoDestaque, Insights, LancamentoResumo, Mapeamento, Resumo } from "@/lib/types";

type ArquivoState = { nome: string; cabecalho: string[]; linhas: string[][] };
type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const ETAPAS_CARREGANDO = ["Lendo os lançamentos...", "Cruzando meses e categorias...", "Montando a leitura..."];

/** Desenho de um gráfico de barras, no lugar de um glifo genérico no estado vazio. */
function IlustracaoBarras() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 54h48" />
      <rect x="14" y="34" width="9" height="20" />
      <rect x="28" y="22" width="9" height="32" />
      <rect x="42" y="12" width="9" height="42" />
    </svg>
  );
}

type EstadoAnalise =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; retomar?: { resumo: Resumo; amostra: LancamentoResumo[]; nomeArquivo: string; todos: LancamentoResumo[] } }
  | {
      fase: "pronto";
      id?: string;
      resumo: Resumo;
      insights: Insights;
      amostra: LancamentoResumo[];
      meta: Meta;
      nomeArquivo: string;
      todos: LancamentoResumo[];
    };

export default function Page() {
  const { status, erro } = useStatus();
  const [arquivoBruto, setArquivoBruto] = useState<File | null>(null);
  const [arquivo, setArquivo] = useState<ArquivoState | null>(null);
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [guardar, setGuardar] = useState(false);
  const [estado, setEstado] = useState<EstadoAnalise>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/insights").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/insights", { method: "DELETE" }).then(carregarHistorico);
  }

  function processarTexto(texto: string, nome: string) {
    const { cabecalho, linhas } = parseCSV(texto);
    if (!cabecalho.length || !linhas.length) {
      setErroArquivo("Não encontramos linhas nesse arquivo. Confira se é mesmo um CSV com cabeçalho.");
      return null;
    }
    const mapa = sugerirMapeamento(cabecalho, linhas);
    const mapeamentoFinal: Mapeamento = {
      data: mapa.data >= 0 ? mapa.data : 0,
      categoria: mapa.categoria >= 0 ? mapa.categoria : 0,
      valor: mapa.valor >= 0 ? mapa.valor : 0,
      descricao: mapa.descricao >= 0 ? mapa.descricao : -1,
    };
    setErroArquivo(null);
    setArquivo({ nome, cabecalho, linhas });
    setMapeamento(mapeamentoFinal);
    setEstado({ fase: "vazio" });
    return { cabecalho, linhas, mapeamento: mapeamentoFinal };
  }

  function handleFile(file: File) {
    setErroArquivo(null);
    if (!/\.csv$/i.test(file.name) && file.type && !file.type.includes("csv") && file.type !== "text/plain") {
      setErroArquivo("Envie um arquivo .csv.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErroArquivo("O arquivo passa de 5 MB. Exporte um período menor.");
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => processarTexto(String(leitor.result), file.name);
    leitor.onerror = () => setErroArquivo("Não foi possível ler esse arquivo.");
    leitor.readAsText(file, "utf-8");
  }

  function onArquivoSelecionado(file: File | null) {
    setArquivoBruto(file);
    if (!file) {
      setArquivo(null);
      setMapeamento(null);
      setErroArquivo(null);
      return;
    }
    handleFile(file);
  }

  async function gerarLeitura(resumo: Resumo, amostra: LancamentoResumo[], nomeArquivo: string, todos: LancamentoResumo[]) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumo, nomeArquivo, guardar }),
      });
      const respo = await r.json();
      if (!r.ok) throw new Error(respo.error || "Falha ao gerar a leitura.");
      setEstado({ fase: "pronto", id: respo.id, resumo, insights: respo.insights, amostra, meta: respo.meta, nomeArquivo, todos });
      carregarHistorico();
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", retomar: { resumo, amostra, nomeArquivo, todos } });
    }
  }

  async function analisar(linhas: string[][], mapa: Mapeamento, nomeArquivo: string) {
    const registros = normalizarRegistros(linhas, mapa);
    if (!registros.length) {
      setEstado({
        fase: "erro",
        mensagem:
          "Não deu para ler os lançamentos. Confira se as colunas de data e valor foram mapeadas corretamente (datas em dd/mm/aaaa ou aaaa-mm-dd, valores como 1.234,56 ou 1234.56).",
      });
      return;
    }
    const resumo = calcularResumo(registros);
    const paraLinha = (r: (typeof registros)[number]): LancamentoResumo => ({
      data: r.data.toISOString().slice(0, 10),
      categoria: r.categoria,
      descricao: r.descricao,
      valor: r.valor,
    });
    const amostra = registros.slice(0, 60).map(paraLinha);
    const todos = registros.map(paraLinha);
    await gerarLeitura(resumo, amostra, nomeArquivo, todos);
  }

  async function usarExemplo() {
    try {
      const r = await fetch("/exemplo-despesas.csv");
      if (!r.ok) throw new Error("Falha ao buscar o exemplo.");
      const texto = await r.text();
      const resultado = processarTexto(texto, "exemplo-despesas.csv");
      if (resultado) await analisar(resultado.linhas, resultado.mapeamento, "exemplo-despesas.csv");
    } catch {
      setErroArquivo("Não foi possível carregar o CSV de exemplo agora.");
    }
  }

  // Atalho para demonstrações: /?exemplo=1 carrega os dados de exemplo e analisa.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        usarExemplo();
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar
        marca="F"
        nome="Analista Financeiro"
        area="Financeiro"
        status={status}
        erro={erro}
        resumo="Modo demonstração: a leitura e as respostas exibidas são exemplos calculados com os números da sua planilha."
      />

      <Workspace>
        <Panel
          titulo="Entenda sua planilha de despesas em minutos."
          lead="Solte o CSV do financeiro aqui e confira as colunas antes de analisar."
        >
          <div className="mb-4">
            <Dropzone id="csv" accept=".csv,text/csv" tiposLabel="CSV" maxSizeMB={5} arquivo={arquivoBruto} onArquivo={onArquivoSelecionado} />
          </div>

          {(arquivo || erroArquivo) && (
            <p className="text-[13px] text-muted -mt-1.5 mb-3.5 break-words">
              {erroArquivo ? <span className="text-danger font-semibold">{erroArquivo}</span> : `${arquivo!.nome} · ${arquivo!.linhas.length} linhas`}
            </p>
          )}

          {arquivo && mapeamento && (
            <div className="mb-4">
              <p className="text-muted text-[13px] mb-2.5">Confirme as colunas antes de analisar. Já tentamos adivinhar pelo conteúdo do arquivo.</p>
              <Row>
                <Field label="Coluna de data" htmlFor="col-data">
                  <select
                    id="col-data"
                    className="input"
                    value={mapeamento.data}
                    onChange={(e) => setMapeamento((m) => (m ? { ...m, data: Number(e.target.value) } : m))}
                  >
                    {arquivo.cabecalho.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Coluna de categoria" htmlFor="col-categoria">
                  <select
                    id="col-categoria"
                    className="input"
                    value={mapeamento.categoria}
                    onChange={(e) => setMapeamento((m) => (m ? { ...m, categoria: Number(e.target.value) } : m))}
                  >
                    {arquivo.cabecalho.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              </Row>
              <Row>
                <Field label="Coluna de valor" htmlFor="col-valor">
                  <select
                    id="col-valor"
                    className="input"
                    value={mapeamento.valor}
                    onChange={(e) => setMapeamento((m) => (m ? { ...m, valor: Number(e.target.value) } : m))}
                  >
                    {arquivo.cabecalho.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Coluna de descrição (opcional)" htmlFor="col-descricao">
                  <select
                    id="col-descricao"
                    className="input"
                    value={mapeamento.descricao}
                    onChange={(e) => setMapeamento((m) => (m ? { ...m, descricao: Number(e.target.value) } : m))}
                  >
                    <option value={-1}>(nenhuma)</option>
                    {arquivo.cabecalho.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              </Row>
              {SENSIVEL && <OptInGuardar checked={guardar} onChange={setGuardar} />}
              <button type="button" className="btn-primary mt-1.5" disabled={carregando} onClick={() => analisar(arquivo.linhas, mapeamento, arquivo.nome)}>
                {carregando ? "Analisando" : "Analisar"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap mt-1">
            <a className="btn-link" href="/exemplo-despesas.csv" download="exemplo-despesas.csv">
              Baixar CSV de exemplo
            </a>
            <button type="button" className="btn-link" onClick={usarExemplo}>
              Usar dados de exemplo
            </button>
          </div>
          <Privacidade detalhe="Nada é enviado no upload. Só agregados (totais, médias, maiores lançamentos) e uma amostra de linhas são enviados à IA quando você pede uma leitura ou faz uma pergunta." />

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
          {estado.fase === "vazio" && (
            <Empty
              ilustracao={<IlustracaoBarras />}
              titulo="A leitura da sua planilha aparece aqui"
              descricao="Totais, variação do mês, maiores categorias e lançamentos, gráficos e um espaço para perguntar o que quiser sobre os números."
              acao="Preencher com um exemplo"
              onAcao={usarExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && (
            <ErrorBox
              mensagem={estado.mensagem}
              onTentarNovamente={
                estado.retomar
                  ? () => gerarLeitura(estado.retomar!.resumo, estado.retomar!.amostra, estado.retomar!.nomeArquivo, estado.retomar!.todos)
                  : undefined
              }
            />
          )}
          {estado.fase === "pronto" && (
            <Resultado
              id={estado.id}
              resumo={estado.resumo}
              insights={estado.insights}
              amostra={estado.amostra}
              meta={estado.meta}
              nomeArquivo={estado.nomeArquivo}
              todosLancamentos={estado.todos}
            />
          )}
        </Stage>
      </Workspace>
    </>
  );
}

type RespostaItem = { id: string; pergunta: string; carregando: boolean; resposta?: string; erro?: string };

export function Resultado({
  id,
  resumo,
  insights,
  amostra,
  meta,
  nomeArquivo,
  todosLancamentos,
}: {
  id?: string;
  resumo: Resumo;
  insights: Insights;
  amostra?: LancamentoResumo[];
  meta: Meta;
  nomeArquivo: string;
  todosLancamentos?: LancamentoResumo[];
}) {
  const titulo = `Leitura de ${nomeArquivo}`;
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${resumo.periodo.inicio} a ${resumo.periodo.fim} · ${resumo.quantidade} lançamentos`}>
        <Entregar
          id={id}
          titulo={titulo}
          texto={() => resumoParaTexto(resumo, insights, nomeArquivo)}
          extras={todosLancamentos ? [{ rotulo: "Exportar planilha categorizada", onClick: () => exportarPlanilhaCategorizada(todosLancamentos, nomeArquivo) }] : undefined}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoFinancas resumo={resumo} insights={insights} />

      <AutomatizarProximosMeses />

      {amostra && <SecaoPerguntar resumo={resumo} insights={insights} amostra={amostra} />}
    </article>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };

/** Depois de uma leitura salva, oferece automatizar os próximos meses: uma rotina que entrega o resumo
 * todo dia 1 às 8h e um link permanente para enviar a próxima planilha sem abrir o app. */
function AutomatizarProximosMeses() {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criandoRotina, setCriandoRotina] = useState(false);
  const [linkCodigo, setLinkCodigo] = useState<string | null | undefined>(undefined);
  const [criandoLink, setCriandoLink] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(integracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => setRotinaId((d.itens || []).find((i: { tipo: string }) => i.tipo === "resumo-mensal")?.id ?? null))
      .catch(() => setRotinaId(null));
    fetch("/api/planilha-mensal")
      .then((r) => r.json())
      .then((d) => setLinkCodigo(d.codigo ?? null))
      .catch(() => setLinkCodigo(null));
  }, []);

  async function criarRotina() {
    if (!notificacoes?.configurada) return;
    setCriandoRotina(true);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "resumo-mensal",
          frequencia: "mensal",
          diaMes: 1,
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar a rotina.");
      setRotinaId(d.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar a rotina.");
    } finally {
      setCriandoRotina(false);
    }
  }

  async function criarLinkPlanilha() {
    setCriandoLink(true);
    try {
      const r = await fetch("/api/planilha-mensal", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar o link.");
      setLinkCodigo(d.codigo);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar o link.");
    } finally {
      setCriandoLink(false);
    }
  }

  return (
    <Section titulo="Automatize os próximos meses">
      <div className="card shadow-none p-4 flex flex-col gap-5">
        <div>
          {rotinaId === undefined || notificacoes === null ? null : rotinaId ? (
            <p className="text-muted text-sm">Você já recebe o resumo todo mês, no dia 1 às 8h.</p>
          ) : notificacoes.configurada ? (
            <button type="button" className="btn-ghost" onClick={criarRotina} disabled={criandoRotina}>
              {criandoRotina ? "Criando..." : "Receber o resumo todo mês"}
            </button>
          ) : (
            <a href="/setup#notificacoes" className="btn-ghost">Receber o resumo todo mês</a>
          )}
        </div>

        <div>
          <p className="text-muted text-[13px] mb-2.5 max-w-[520px]">
            Envie este link para quem cuida da planilha: qualquer CSV enviado por ele vira o próximo resumo mensal. O arquivo é processado na hora e descartado — só os totais ficam guardados.
          </p>
          {linkCodigo === undefined ? null : linkCodigo ? (
            <div className="flex items-center gap-3 flex-wrap">
              <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">
                {typeof window !== "undefined" ? `${window.location.origin}/f/${linkCodigo}` : `/f/${linkCodigo}`}
              </code>
              <CopyButton texto={() => `${window.location.origin}/f/${linkCodigo}`} rotulo="Copiar" />
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={criarLinkPlanilha} disabled={criandoLink}>
              {criandoLink ? "Criando..." : "Enviar a planilha do mês por link"}
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Corpo da leitura (sem cabeçalho, Origem nem a caixa de perguntas), reaproveitado pela página de impressão. */
export function ConteudoFinancas({ resumo, insights }: { resumo: Resumo; insights: Insights }) {
  const ultimoMes = resumo.meses[resumo.meses.length - 1];
  const maiorCrescimento = resumo.categoriasQueCresceram[0];
  const variacao = resumo.variacaoUltimoMes;
  const tomVariacao = variacao > 5 ? "warn" : variacao < -5 ? "ok" : "neutro";

  return (
    <>
      <Destaque
        valor={formatarMoeda(resumo.total)}
        rotulo="Total do período"
        interpretacao={`${percentual(variacao)} em relação ao mês anterior`}
        tom={tomVariacao}
      />

      <p className="summary">{insights.leitura_geral}</p>

      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5 mb-7">
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Média mensal</p>
          <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(resumo.mediaMensal)}</p>
        </Item>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Último mês ({ultimoMes ? ultimoMes.rotulo : "-"})</p>
          <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(ultimoMes ? ultimoMes.total : 0)}</p>
        </Item>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Maior variação</p>
          <p className="text-[19px] font-extrabold tracking-tight">{maiorCrescimento ? maiorCrescimento.categoria : "-"}</p>
          <p className="text-muted text-[13px]">{maiorCrescimento ? percentual(maiorCrescimento.variacao) : ""}</p>
        </Item>
      </div>

      <Section titulo="Despesas por mês">
        <div className="card shadow-none p-4">
          <GraficoMeses meses={resumo.meses} variacao={variacao} tom={tomVariacao} />
        </div>
      </Section>

      <Section titulo="Despesas por categoria">
        <div className="card shadow-none p-4">
          <GraficoCategorias categorias={resumo.categorias} maiorCrescimento={maiorCrescimento} />
        </div>
      </Section>

      <Section titulo="Destaques">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {insights.destaques.map((d, i) => (
            <Item key={i}>
              <div className="mb-2">
                <Chip nivel={nivelDoTipo(d.tipo)}>{rotuloTipo(d.tipo)}</Chip>
              </div>
              <h3 className="font-bold mb-1">{d.titulo}</h3>
              <p className="text-muted text-sm">{d.detalhe}</p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Cinco maiores lançamentos">
        <DataTable
          colunas={[
            { chave: "data", titulo: "Data", render: (l: LancamentoResumo) => formatarDataCurta(l.data) },
            { chave: "categoria", titulo: "Categoria", papel: "titulo", render: (l: LancamentoResumo) => l.categoria },
            { chave: "descricao", titulo: "Descrição", papel: "resumo", render: (l: LancamentoResumo) => l.descricao || "-" },
            { chave: "valor", titulo: "Valor", render: (l: LancamentoResumo) => <strong>{formatarMoeda(l.valor)}</strong> },
          ]}
          linhas={resumo.maioresLancamentos}
        />
      </Section>
    </>
  );
}

/** Caixa de perguntas sobre os números; só aparece quando a amostra de lançamentos ainda está disponível (não é persistida no histórico). */
function SecaoPerguntar({ resumo, insights, amostra }: { resumo: Resumo; insights: Insights; amostra: LancamentoResumo[] }) {
  const [respostas, setRespostas] = useState<RespostaItem[]>([]);
  const [pergunta, setPergunta] = useState("");

  async function perguntar(p: string) {
    const texto = p.trim();
    if (!texto) return;
    const id = `${Date.now()}-${Math.random()}`;
    setRespostas((r) => [{ id, pergunta: texto, carregando: true }, ...r]);
    try {
      const r2 = await fetch("/api/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumo, amostra, pergunta: texto }),
      });
      const respo = await r2.json();
      if (!r2.ok) throw new Error(respo.error || "Não foi possível responder agora.");
      setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, resposta: respo.resposta } : x)));
    } catch (e) {
      setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, erro: e instanceof Error ? e.message : "Erro inesperado." } : x)));
    }
  }

  return (
    <Section titulo="Pergunte aos seus números">
      <div className="flex gap-2.5 mb-3 max-md:flex-col">
        <input
          type="text"
          className="input"
          placeholder="Ex.: por que marketing subiu esse mês?"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              perguntar(pergunta);
              setPergunta("");
            }
          }}
        />
        <button
          type="button"
          className="btn-primary w-auto max-md:w-full whitespace-nowrap"
          onClick={() => {
            perguntar(pergunta);
            setPergunta("");
          }}
        >
          Perguntar
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {insights.perguntas_sugeridas.map((p, i) => (
          <button
            key={i}
            type="button"
            className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-left hover:bg-[#d3ecdf]"
            onClick={() => perguntar(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {respostas.map((r) => (
          <Item key={r.id}>
            <p className="font-bold mb-1.5">{r.pergunta}</p>
            {r.carregando && <p className="text-muted text-sm">Calculando a resposta...</p>}
            {r.resposta && <p className="whitespace-pre-line">{r.resposta}</p>}
            {r.erro && <p className="text-danger">{r.erro}</p>}
          </Item>
        ))}
      </div>
    </Section>
  );
}

function percentual(v: number) {
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${(v || 0).toFixed(1).replace(".", ",")}%`;
}

function formatarDataCurta(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function nivelDoTipo(tipo: TipoDestaque["tipo"]) {
  if (tipo === "alerta") return "alta";
  if (tipo === "oportunidade") return "baixa";
  return "neutral";
}

function rotuloTipo(tipo: TipoDestaque["tipo"]) {
  if (tipo === "alerta") return "Alerta";
  if (tipo === "oportunidade") return "Oportunidade";
  return "Observação";
}

/** Exporta os lançamentos normalizados (data, categoria, descrição e valor) como CSV, um para reimportar já categorizado. */
function exportarPlanilhaCategorizada(lancamentos: LancamentoResumo[], nomeArquivo: string) {
  const cabecalho = ["Data", "Categoria", "Descrição", "Valor"];
  const linhasCSV = [cabecalho.join(";")];
  lancamentos.forEach((l) => {
    const campos = [formatarDataCurta(l.data), l.categoria, l.descricao, l.valor.toFixed(2).replace(".", ",")];
    linhasCSV.push(campos.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhasCSV.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo.replace(/\.csv$/i, "")}-categorizado.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resumoParaTexto(resumo: Resumo, insights: Insights, nomeArquivo: string) {
  const linhas: string[] = [
    `Leitura de ${nomeArquivo} (${resumo.periodo.inicio} a ${resumo.periodo.fim})`,
    "",
    insights.leitura_geral,
    "",
    `Total do período: ${formatarMoeda(resumo.total)}`,
    `Média mensal: ${formatarMoeda(resumo.mediaMensal)}`,
    "",
    "Despesas por mês:",
  ];
  resumo.meses.forEach((m) => linhas.push(`- ${m.rotulo}: ${formatarMoeda(m.total)}`));
  linhas.push("", "Despesas por categoria:");
  resumo.categorias.forEach((c) => linhas.push(`- ${c.categoria}: ${formatarMoeda(c.total)}`));
  linhas.push("", "Destaques:");
  insights.destaques.forEach((d) => linhas.push(`- ${d.titulo}: ${d.detalhe}`));
  linhas.push("", "Cinco maiores lançamentos:");
  resumo.maioresLancamentos.forEach((l) => linhas.push(`- ${formatarDataCurta(l.data)} · ${l.categoria} · ${l.descricao || "-"}: ${formatarMoeda(l.valor)}`));
  return linhas.join("\n");
}
