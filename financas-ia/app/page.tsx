"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Aviso,
  Chip,
  CopyButton,
  DataTable,
  Destaque,
  Dropzone,
  Entregar,
  ErrorBox,
  Field,
  Hero,
  Item,
  Loading,
  MaisDetalhes,
  OptInGuardar,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  Row,
  Section,
  Stage,
  Topbar,
  data,
  lerErro,
  useConfirmacao,
  useScrollToResult,
  useStatus,
  type ErroLido,
  type PassoIndicador,
} from "@/components/ui";
import { SENSIVEL } from "@/lib/sensivel";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { parseCSV, sugerirMapeamento } from "@/lib/csv";
import { calcularResumo, formatarMoeda, normalizarRegistros } from "@/lib/analise";
import { GraficoCategorias } from "@/components/GraficoCategorias";
import { GraficoMeses } from "@/components/GraficoMeses";
import { orcamentoDaCategoria, type ItemOrcamento } from "@/lib/orcamento-calculo";
import { ACAO_NOTIFICACOES } from "@/lib/acoes";
import { baixarPlanilhaPorCategoria } from "@/lib/exportar-planilha";
import type { Destaque as TipoDestaque, Insights, LancamentoResumo, Mapeamento, Resumo } from "@/lib/types";

type ArquivoState = { nome: string; cabecalho: string[]; linhas: string[][] };
type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const ETAPAS_CARREGANDO = ["Lendo os lançamentos...", "Cruzando meses e categorias...", "Montando a leitura..."];

// Textos do hero (economia de texto: título ate 8 palavras, apoio ate 20, itens ate 5 de ate 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Financeiro",
  titulo: "Sua planilha de despesas lida em minutos",
  apoio: "Envie o CSV do financeiro: a leitura mostra totais, variações e o que merece atenção.",
  itens: [
    "Total do período e variação",
    "Despesas por mês e categoria",
    "Categorias que estouraram o orçamento",
    "Cinco maiores lançamentos",
    "Perguntas sobre os seus números",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Planilha", apoio: "O CSV do financeiro" },
  { titulo: "Colunas", apoio: "Data, categoria e valor" },
  { titulo: "Leitura", apoio: "Totais, gráficos e alertas" },
];

function IconePlanilha() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16M10 10v10" />
    </svg>
  );
}

function IconeColunas() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 20V9M12 20V4M19 20v-7" />
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

/** Prévia de "o que você vai receber", exibida no lugar da leitura antes da primeira análise. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost !w-auto self-start" onClick={onExemplo} disabled={carregando}>
        Usar dados de exemplo
      </button>
    </div>
  );
}

type Retomar = { resumo: Resumo; amostra: LancamentoResumo[]; nomeArquivo: string; todos: LancamentoResumo[] };

type EstadoAnalise =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; retomar?: Retomar }
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
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [arquivoBruto, setArquivoBruto] = useState<File | null>(null);
  const [arquivo, setArquivo] = useState<ArquivoState | null>(null);
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [avisoFonte, setAvisoFonte] = useState<ErroLido | null>(null);
  const [guardar, setGuardar] = useState(false);
  const [estado, setEstado] = useState<EstadoAnalise>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [orcamento, setOrcamento] = useState<ItemOrcamento[]>([]);
  const [lendoFonte, setLendoFonte] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  // "Fonte de dados conectada?" vem de /api/status (lib/status-do-app.ts, chave mcpDados): a tela não
  // consulta a configuração por resultado. `undefined` enquanto o status ainda está carregando.
  const fonteDados = status ? Boolean(status.integrations?.mcpDados) : undefined;

  function carregarHistorico() {
    fetch("/api/insights").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);
  useEffect(() => {
    fetch("/api/orcamento").then((r) => r.json()).then((d) => setOrcamento(d.itens || [])).catch(() => setOrcamento([]));
  }, []);

  /** 401 com codigo "sem_sessao" significa sessão expirada: a tela de entrar resolve, o ErrorBox não. */
  function sessaoExpirada(r: Response, info: ErroLido) {
    if (r.status !== 401 || info.codigo !== "sem_sessao") return false;
    router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
    return true;
  }

  async function apagarHistorico() {
    const ok = await confirmar("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.", { confirmarRotulo: "Apagar tudo" });
    if (!ok) return;
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
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setEstado({ fase: "erro", ...info, codigo: info.codigo as CodigoErroIA | undefined, retomar: { resumo, amostra, nomeArquivo, todos } });
        return;
      }
      const respo = await r.json();
      setEstado({ fase: "pronto", id: respo.id, resumo, insights: respo.insights, amostra, meta: respo.meta, nomeArquivo, todos });
      carregarHistorico();
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", ...info, codigo: info.codigo as CodigoErroIA | undefined, retomar: { resumo, amostra, nomeArquivo, todos } });
    }
  }

  async function analisar(linhas: string[][], mapa: Mapeamento, nomeArquivo: string) {
    const registros = normalizarRegistros(linhas, mapa);
    if (!registros.length) {
      setEstado({
        fase: "erro",
        mensagem:
          "Não deu para ler os lançamentos. Confira se as colunas de data e valor foram escolhidas corretamente (datas em dd/mm/aaaa ou aaaa-mm-dd, valores como 1.234,56 ou 1234.56).",
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

  async function lerFonteConectada() {
    setLendoFonte(true);
    setErroArquivo(null);
    setAvisoFonte(null);
    try {
      const r = await fetch("/api/fonte-dados", { method: "POST" });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoFonte(info);
        return;
      }
      const d = await r.json();
      const resultado = processarTexto(d.csv, "fonte-conectada.csv");
      if (resultado) await analisar(resultado.linhas, resultado.mapeamento, "fonte-conectada.csv");
    } catch (e) {
      setAvisoFonte(await lerErro(e));
    } finally {
      setLendoFonte(false);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : arquivo ? 2 : 1;

  return (
    <>
      <Topbar
        marca="F"
        nome="Analista Financeiro"
        area="Financeiro"
        status={status}
        erro={erro}
        usuario={status?.usuario}
        resumo="Modo demonstração: a leitura e as respostas exibidas são exemplos calculados com os números da sua planilha."
      />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Financeiro">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <CartaoEntrada icone={<IconePlanilha />} titulo="A planilha de despesas">
            <Dropzone id="csv" accept=".csv,text/csv" tiposLabel="CSV" maxSizeMB={5} arquivo={arquivoBruto} onArquivo={onArquivoSelecionado} />

            {(arquivo || erroArquivo) && (
              <p className="text-[13px] text-muted mt-2.5 break-words">
                {erroArquivo ? <span className="text-danger font-semibold">{erroArquivo}</span> : `${arquivo!.nome} · ${arquivo!.linhas.length} linhas`}
              </p>
            )}

            <div className="flex items-center gap-4 flex-wrap mt-3">
              <a className="btn-link text-[13px]" href="/exemplo-despesas.csv" download="exemplo-despesas.csv">
                Baixar CSV de exemplo
              </a>
              {fonteDados === true && (
                <button type="button" className="btn-link text-[13px]" onClick={lerFonteConectada} disabled={lendoFonte}>
                  {lendoFonte ? "Lendo..." : "Ler da fonte conectada"}
                </button>
              )}
              {fonteDados === false && (
                <a className="btn-link text-[13px]" href="/setup#mcp-dados">
                  Conectar uma fonte de dados
                </a>
              )}
            </div>
            {fonteDados === false && (
              <p className="text-[12.5px] text-muted mt-1.5">Leia direto da planilha compartilhada ou do ERP, sem exportar CSV toda vez.</p>
            )}
            {avisoFonte && (
              <div className="mt-3">
                <Aviso tom="danger" acao={avisoFonte.acao}>{avisoFonte.mensagem}</Aviso>
              </div>
            )}
          </CartaoEntrada>

          {arquivo && mapeamento && (
            <CartaoEntrada icone={<IconeColunas />} titulo="As colunas do arquivo">
              <p className="text-muted text-[13px] mb-3">Confirme antes de analisar. Já tentamos adivinhar pelo conteúdo.</p>
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
              <button type="button" className="btn-primary" disabled={carregando} onClick={() => analisar(arquivo.linhas, mapeamento, arquivo.nome)}>
                {carregando ? "Analisando" : "Analisar"}
              </button>
            </CartaoEntrada>
          )}

          <div className="card p-5">
            <Privacidade detalhe="Nada é enviado no upload. Só agregados (totais, médias, maiores lançamentos) e uma amostra de linhas são enviados à IA quando você pede uma leitura ou faz uma pergunta." />

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
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={usarExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && (
            <ErrorBox
              mensagem={estado.mensagem}
              codigo={estado.codigo}
              acao={estado.acao}
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
              orcamento={orcamento}
            />
          )}
        </Stage>
      </main>

      {Dialogo}
    </>
  );
}

type RespostaItem = { id: string; pergunta: string; carregando: boolean; resposta?: string; erro?: ErroLido };

export function Resultado({
  id,
  resumo,
  insights,
  amostra,
  meta,
  nomeArquivo,
  todosLancamentos,
  orcamento,
}: {
  id?: string;
  resumo: Resumo;
  insights: Insights;
  amostra?: LancamentoResumo[];
  meta: Meta;
  nomeArquivo: string;
  todosLancamentos?: LancamentoResumo[];
  orcamento?: ItemOrcamento[];
}) {
  const titulo = `Leitura de ${nomeArquivo}`;
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${resumo.periodo.inicio} a ${resumo.periodo.fim} · ${resumo.quantidade} lançamentos`}>
        <Entregar
          id={id}
          titulo={titulo}
          texto={() => resumoParaTexto(resumo, insights, nomeArquivo)}
          extras={
            todosLancamentos
              ? [{ rotulo: "Exportar planilha por categoria", onClick: () => baixarPlanilhaPorCategoria(todosLancamentos, nomeArquivo, orcamento, resumo.meses.length) }]
              : undefined
          }
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoFinancas resumo={resumo} insights={insights} orcamento={orcamento} />

      <AutomatizarProximosMeses />

      {amostra && <SecaoPerguntar resumo={resumo} insights={insights} amostra={amostra} />}
    </article>
  );
}

type EstadoNotificacoes = { canal: "email" | "slack"; destino: string };

/** Depois de uma leitura salva, oferece automatizar os próximos meses: uma rotina que entrega o resumo
 * todo dia 1 às 8h e um link permanente para enviar a próxima planilha sem abrir o app. */
function AutomatizarProximosMeses() {
  const { status } = useStatus();
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criandoRotina, setCriandoRotina] = useState(false);
  const [linkCodigo, setLinkCodigo] = useState<string | null | undefined>(undefined);
  const [criandoLink, setCriandoLink] = useState(false);
  const [aviso, setAviso] = useState<ErroLido | null>(null);

  // "Dá para entregar o resumo?" vem de /api/status (chave notificacoes de lib/status-do-app.ts, que
  // exige canal com credencial E destino). O GET de /api/setup entra só para saber PARA ONDE enviar:
  // sem `canal`/`destino` no corpo, a rota de rotinas assume e-mail e recusa quem escolheu Slack.
  const prontas = status ? Boolean(status.integrations?.notificacoes) : undefined;

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ canal, destino });
      })
      .catch(() => setNotificacoes({ canal: "email", destino: "" }));
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
    if (!notificacoes) return;
    setCriandoRotina(true);
    setAviso(null);
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
      if (!r.ok) {
        setAviso(await lerErro(r));
        return;
      }
      const d = await r.json();
      setRotinaId(d.id);
    } catch (e) {
      setAviso(await lerErro(e));
    } finally {
      setCriandoRotina(false);
    }
  }

  async function criarLinkPlanilha() {
    setCriandoLink(true);
    setAviso(null);
    try {
      const r = await fetch("/api/planilha-mensal", { method: "POST" });
      if (!r.ok) {
        setAviso(await lerErro(r));
        return;
      }
      const d = await r.json();
      setLinkCodigo(d.codigo);
    } catch (e) {
      setAviso(await lerErro(e));
    } finally {
      setCriandoLink(false);
    }
  }

  return (
    <Section titulo="Automatize os próximos meses">
      <div className="card shadow-none p-4 flex flex-col gap-5">
        <div>
          {rotinaId === undefined || prontas === undefined ? null : rotinaId ? (
            <p className="text-muted text-sm">Você já recebe o resumo todo mês, no dia 1 às 8h.</p>
          ) : prontas ? (
            <button type="button" className="btn-ghost" onClick={criarRotina} disabled={criandoRotina}>
              {criandoRotina ? "Criando..." : "Receber o resumo todo mês"}
            </button>
          ) : (
            <Aviso acao={ACAO_NOTIFICACOES}>
              Para receber o resumo todo mês, escolha antes por onde avisamos (e-mail ou Slack) e para quem.
            </Aviso>
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

        {aviso && <Aviso tom="danger" acao={aviso.acao}>{aviso.mensagem}</Aviso>}
      </div>
    </Section>
  );
}

/** Corpo da leitura (sem cabeçalho, Origem nem a caixa de perguntas), reaproveitado pela página de impressão. */
export function ConteudoFinancas({
  resumo,
  insights,
  orcamento,
}: {
  resumo: Resumo;
  insights: Insights;
  orcamento?: ItemOrcamento[];
}) {
  const ultimoMes = resumo.meses[resumo.meses.length - 1];
  const maiorCrescimento = resumo.categoriasQueCresceram[0];
  const variacao = resumo.variacaoUltimoMes;
  const anoAnterior = resumo.comparacaoAnoAnterior;
  const desvio = desvioDoOrcamento(resumo, orcamento);
  const tomVariacao = variacao > 5 ? "warn" : variacao < -5 ? "ok" : "neutro";
  const tom = desvio && desvio.valor > 0 ? "danger" : tomVariacao;

  return (
    <>
      <Destaque
        valor={formatarMoeda(resumo.total)}
        rotulo="Total do período"
        interpretacao={`${percentual(variacao)} em relação ao mês anterior${desvio ? ` · ${frasedoDesvio(desvio)}` : ""}`}
        tom={tom}
      />

      <p className="summary">{insights.leitura_geral}</p>

      <div className={`grid ${anoAnterior ? "grid-cols-2" : "grid-cols-3"} max-md:grid-cols-1 gap-3.5 mb-7`}>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Média mensal</p>
          <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(resumo.mediaMensal)}</p>
        </Item>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Último mês ({ultimoMes ? ultimoMes.rotulo : "-"})</p>
          <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(ultimoMes ? ultimoMes.total : 0)}</p>
        </Item>
        {anoAnterior && (
          <Item>
            <p className="text-muted text-[12.5px] font-semibold mb-1">Mesmo mês do ano anterior</p>
            <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(anoAnterior.totalAnterior)}</p>
            <p className="text-muted text-[13px]">
              {anoAnterior.rotuloAnterior} · {percentual(anoAnterior.variacao)}
            </p>
          </Item>
        )}
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
          <GraficoCategorias
            categorias={resumo.categorias}
            maiorCrescimento={maiorCrescimento}
            orcamento={orcamento}
            meses={resumo.meses.length}
          />
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
      if (!r2.ok) {
        const info = await lerErro(r2);
        setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, erro: info } : x)));
        return;
      }
      const respo = await r2.json();
      setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, resposta: respo.resposta } : x)));
    } catch (e) {
      const info = await lerErro(e);
      setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, erro: info } : x)));
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
            className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-left hover:brightness-95"
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
            {r.erro && <Aviso tom="danger" acao={r.erro.acao}>{r.erro.mensagem}</Aviso>}
          </Item>
        ))}
      </div>
    </Section>
  );
}

type DesvioOrcamento = { valor: number; categorias: number };

/** Gasto contra orçamento apenas nas categorias que TÊM orçamento cadastrado: somar o gasto de
 * categorias sem orçamento inflaria o desvio e a frase mentiria. O valor cadastrado é mensal, então é
 * multiplicado pelo número de meses do período (mesma conversão de lib/rotinas-do-app.ts). */
function desvioDoOrcamento(resumo: Resumo, orcamento?: ItemOrcamento[]): DesvioOrcamento | undefined {
  if (!orcamento || orcamento.length === 0) return undefined;
  const meses = Math.max(resumo.meses.length, 1);
  let gasto = 0;
  let orcado = 0;
  let categorias = 0;
  for (const c of resumo.categorias) {
    const mensal = orcamentoDaCategoria(orcamento, c.categoria);
    if (mensal === undefined) continue;
    gasto += c.total;
    orcado += mensal * meses;
    categorias++;
  }
  if (categorias === 0) return undefined;
  return { valor: gasto - orcado, categorias };
}

function frasedoDesvio({ valor, categorias }: DesvioOrcamento) {
  const onde = categorias === 1 ? "1 categoria com orçamento" : `${categorias} categorias com orçamento`;
  if (Math.abs(valor) < 1) return `no valor do orçamento em ${onde}`;
  return `${formatarMoeda(Math.abs(valor))} ${valor > 0 ? "acima" : "abaixo"} do orçamento em ${onde}`;
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

function resumoParaTexto(resumo: Resumo, insights: Insights, nomeArquivo: string) {
  const linhas: string[] = [
    `Leitura de ${nomeArquivo} (${resumo.periodo.inicio} a ${resumo.periodo.fim})`,
    "",
    insights.leitura_geral,
    "",
    `Total do período: ${formatarMoeda(resumo.total)}`,
    `Média mensal: ${formatarMoeda(resumo.mediaMensal)}`,
  ];
  if (resumo.comparacaoAnoAnterior) {
    const c = resumo.comparacaoAnoAnterior;
    linhas.push(`${c.rotuloAtual} contra ${c.rotuloAnterior}: ${formatarMoeda(c.totalAtual)} contra ${formatarMoeda(c.totalAnterior)} (${percentual(c.variacao)})`);
  }
  linhas.push("", "Despesas por mês:");
  resumo.meses.forEach((m) => linhas.push(`- ${m.rotulo}: ${formatarMoeda(m.total)}`));
  linhas.push("", "Despesas por categoria:");
  resumo.categorias.forEach((c) => linhas.push(`- ${c.categoria}: ${formatarMoeda(c.total)}`));
  linhas.push("", "Destaques:");
  insights.destaques.forEach((d) => linhas.push(`- ${d.titulo}: ${d.detalhe}`));
  linhas.push("", "Cinco maiores lançamentos:");
  resumo.maioresLancamentos.forEach((l) => linhas.push(`- ${formatarDataCurta(l.data)} · ${l.categoria} · ${l.descricao || "-"}: ${formatarMoeda(l.valor)}`));
  return linhas.join("\n");
}
