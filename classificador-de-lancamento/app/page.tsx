"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Aviso,
  Chip,
  DataTable,
  Dropzone,
  Entregar,
  ErrorBox,
  Hero,
  Loading,
  MaisDetalhes,
  OptInGuardar,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  SeloIA,
  Section,
  Stage,
  Topbar,
  data,
  lerErro,
  useScrollToResult,
  useStatus,
  type Coluna,
  type PassoIndicador,
} from "@/components/ui";
import { SENSIVEL } from "@/lib/sensivel";
import { DEMO_HISTORICO_CSV, DEMO_NOVOS_CSV } from "@/lib/demo";
import { formatarMoeda } from "@/lib/moeda";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { LancamentoClassificado, ResultadoClassificacao } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; resumo: string; criadoEm: string };

const ETAPAS_CARREGANDO = ["Lendo o histórico já classificado...", "Comparando com os lançamentos novos...", "Aplicando o padrão encontrado..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada).
const PROMESSA = {
  sobretitulo: "Financeiro",
  titulo: "Classifique lançamentos pelo seu próprio padrão",
  apoio: "Suba o histórico já classificado e os lançamentos novos: a IA aplica o mesmo padrão, sempre citando a fonte.",
  itens: [
    "Categoria sugerida com confiança",
    "Citação do lançamento parecido",
    "Lançamentos incertos marcados para revisar",
    "Nunca inventa categoria nova",
    "Planilha classificada pronta para baixar",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Histórico", apoio: "Já classificado" },
  { titulo: "Lançamentos novos", apoio: "Sem categoria" },
  { titulo: "Resultado", apoio: "Classificado e citado" },
];

function arquivoDemo(texto: string, nome: string): File {
  return new File([texto], nome, { type: "text/csv" });
}

function IconeHistorico() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6a8 8 0 1 1-1.5 4.7" />
      <path d="M2 3v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function IconeNovos() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M8 10h8M8 14h5" />
      <path d="M15 17.5 17 19.5l3.5-3.5" />
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

/** Cartão de entrada com ícone circular e título, mesmo desenho do resto da suíte. */
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes da primeira classificação. */
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
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string } }
  | { fase: "pronto"; resultado: ResultadoClassificacao; meta: Meta; id?: string; nomeNovos: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [arquivoHistorico, setArquivoHistorico] = useState<File | null>(null);
  const [arquivoNovos, setArquivoNovos] = useState<File | null>(null);
  const [guardar, setGuardar] = useState(false);
  const [erroValidacao, setErroValidacao] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [erroHistorico, setErroHistorico] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroExclusao, setErroExclusao] = useState("");
  const emAndamento = useRef(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "erro");

  function carregarHistorico() {
    fetch("/api/classificar")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((r) => {
        setErroHistorico(false);
        setHistorico(r.itens);
      })
      .catch(() => setErroHistorico(true));
  }

  useEffect(() => {
    carregarHistorico();
  }, []);

  async function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    setApagando(true);
    setErroExclusao("");
    try {
      const resposta = await fetch("/api/classificar", { method: "DELETE" });
      if (!resposta.ok) throw new Error();
      carregarHistorico();
    } catch {
      setErroExclusao("Não foi possível apagar os resultados. Tente novamente.");
    } finally {
      setApagando(false);
    }
  }

  async function classificar(hist: File, novos: File, guardarResultado: boolean) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setEstado({ fase: "carregando" });
    try {
      const formData = new FormData();
      formData.append("historico", hist);
      formData.append("novos", novos);
      formData.append("guardar", guardarResultado ? "1" : "0");
      const r = await fetch("/api/classificar", { method: "POST", body: formData });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", resultado: resposta.resultado, meta: resposta.meta, id: resposta.id, nomeNovos: novos.name });
      carregarHistorico();
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem });
    } finally {
      emAndamento.current = false;
    }
  }

  function onSubmit() {
    setErroValidacao("");
    if (!arquivoHistorico || !arquivoNovos) {
      setErroValidacao("Selecione os dois arquivos CSV: o histórico já classificado e os lançamentos novos.");
      return;
    }
    classificar(arquivoHistorico, arquivoNovos, guardar);
  }

  function preencherExemplo() {
    const hist = arquivoDemo(DEMO_HISTORICO_CSV, "historico-exemplo.csv");
    const novos = arquivoDemo(DEMO_NOVOS_CSV, "lancamentos-novos-exemplo.csv");
    setArquivoHistorico(hist);
    setArquivoNovos(novos);
    setErroValidacao("");
    classificar(hist, novos, false);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia os dois arquivos de exemplo.
  useEffect(() => {
    if (autoEnviado.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => preencherExemplo(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : arquivoHistorico || arquivoNovos ? 2 : 1;

  return (
    <>
      <Topbar marca="C" nome="Classificador de Lançamento" area="Financeiro" status={status} erro={erro} resumo="Modo demonstração: a classificação exibida é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Financeiro">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div className="no-print">
          <p className="text-sm text-muted mb-3">Suba os dois arquivos para classificar os lançamentos novos.</p>
          <fieldset disabled={carregando} className="min-w-0">
            <CartaoEntrada icone={<IconeHistorico />} titulo="Histórico já classificado">
              <p className="text-[12.5px] text-muted mb-3">CSV com data, descrição, valor e categoria de cada lançamento. É daqui que vem todo o padrão real da empresa.</p>
              <Dropzone id="dropzone-historico" accept=".csv,text/csv" tiposLabel="CSV" maxSizeMB={8} arquivo={arquivoHistorico} onArquivo={setArquivoHistorico} />
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeNovos />} titulo="Lançamentos novos">
              <p className="text-[12.5px] text-muted mb-3">CSV com data, descrição e valor, sem categoria — o que você quer classificar.</p>
              <Dropzone id="dropzone-novos" accept=".csv,text/csv" tiposLabel="CSV" maxSizeMB={8} arquivo={arquivoNovos} onArquivo={setArquivoNovos} />
              {SENSIVEL && <div className="mt-3.5"><OptInGuardar checked={guardar} onChange={setGuardar} /></div>}
            </CartaoEntrada>

            {erroValidacao && <p role="alert" className="text-danger text-sm mb-3">{erroValidacao}</p>}

            <button type="button" className="btn-primary" disabled={carregando} onClick={onSubmit}>
              {carregando ? "Classificando" : "Classificar lançamentos"}
            </button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={preencherExemplo}>
              Preencher com um exemplo
            </button>
          </fieldset>
          {carregando && (
            <p role="status" className="text-sm text-accent-ink mt-3">
              Classificando seus lançamentos. Aguarde nesta página.
            </p>
          )}

          <div className="card p-5 mt-4">
            <Privacidade detalhe="Os arquivos só são enviados à IA para a classificação; o resultado fica salvo neste app só se você marcar 'Guardar este resultado'." />

            <MaisDetalhes titulo="Últimos resultados">
              {erroExclusao && <p role="alert" className="text-danger text-sm mb-2">{erroExclusao}</p>}
              {erroHistorico ? (
                <div role="alert">
                  <p className="text-danger text-sm">Não foi possível carregar os resultados.</p>
                  <button type="button" className="btn-link" onClick={carregarHistorico}>Tentar novamente</button>
                </div>
              ) : historico === null ? (
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
                    <button type="button" className="btn-ghost" disabled={apagando} onClick={apagarHistorico}>{apagando ? "Apagando…" : "Apagar tudo"}</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <div className="min-w-0">
          <Stage>
            {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
            {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
            {estado.fase === "erro" && (
              <ErrorBox
                mensagem={estado.mensagem}
                codigo={estado.codigo}
                acao={estado.acao}
                onTentarNovamente={arquivoHistorico && arquivoNovos ? () => classificar(arquivoHistorico, arquivoNovos, guardar) : undefined}
              />
            )}
            {estado.fase === "pronto" && <Resultado resultado={estado.resultado} meta={estado.meta} id={estado.id} nomeNovos={estado.nomeNovos} />}
          </Stage>
        </div>
      </main>
    </>
  );
}

const ROTULO_CONFIANCA: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const NIVEL_CONFIANCA: Record<string, string> = { alta: "positivo", media: "neutro", baixa: "negativo" };

function baixarCsv(resultado: ResultadoClassificacao, nomeNovos: string) {
  import("@/lib/exportar-csv").then(({ baixarCsvClassificado }) => baixarCsvClassificado(resultado.lancamentos, nomeNovos));
}

function resultadoParaTexto(resultado: ResultadoClassificacao): string {
  const l: string[] = [
    `Classificação de ${resultado.totalNovos} lançamentos (${resultado.totalNovos - resultado.totalRevisar} classificados, ${resultado.totalRevisar} para revisar)`,
    "",
  ];
  for (const lanc of resultado.lancamentos) {
    l.push(`- ${lanc.data ? `${lanc.data} · ` : ""}${lanc.descricao} (${formatarMoeda(lanc.valor)}): ${lanc.revisar ? "revisar" : lanc.categoriaSugerida}`);
    if (!lanc.revisar && lanc.citacoes.length) l.push(`    baseado em: ${lanc.citacoes.join("; ")}`);
    if (lanc.justificativa) l.push(`    ${lanc.justificativa}`);
  }
  return l.join("\n");
}

/** Corpo do resultado (sem cabeçalho, Entregar nem Origem), reaproveitado pela página de impressão. */
export function ConteudoClassificacao({ resultado }: { resultado: ResultadoClassificacao }) {
  const [somenteRevisar, setSomenteRevisar] = useState(false);

  const ordenados = useMemo(() => resultado.lancamentos.slice().sort((a, b) => Number(b.revisar) - Number(a.revisar)), [resultado]);
  const visiveis = somenteRevisar ? ordenados.filter((l) => l.revisar) : ordenados;

  const colunas: Coluna<LancamentoClassificado>[] = [
    {
      chave: "descricao",
      titulo: "Lançamento",
      papel: "titulo",
      largura: "26%",
      render: (l) => (
        <>
          <div>{l.descricao}</div>
          {l.data && <div className="text-muted text-[12px] font-normal">{l.data}</div>}
        </>
      ),
    },
    { chave: "valor", titulo: "Valor", largura: "110px", render: (l) => formatarMoeda(l.valor) },
    { chave: "categoria", titulo: "Categoria sugerida", render: (l) => l.categoriaSugerida ?? "—" },
    {
      chave: "status",
      titulo: "Status",
      papel: "chip",
      largura: "110px",
      render: (l) => (l.revisar ? <Chip nivel="media">Revisar</Chip> : <Chip nivel={NIVEL_CONFIANCA[l.confianca]}>{ROTULO_CONFIANCA[l.confianca]}</Chip>),
    },
    {
      chave: "base",
      titulo: "Baseado em",
      papel: "resumo",
      linhas: 3,
      render: (l) =>
        l.citacoes.length ? (
          <>
            <span>{l.justificativa}</span>
            <br />
            <span className="text-[12px]">Fonte: {l.citacoes.join("; ")}</span>
          </>
        ) : (
          l.justificativa
        ),
    },
  ];

  return (
    <>
      {resultado.totalRevisar > 0 && (
        <div className="mb-5">
          <Aviso tom="warn">
            {resultado.totalRevisar} lançamento{resultado.totalRevisar > 1 ? "s" : ""} ficou{resultado.totalRevisar > 1 ? "ram" : ""} marcado{resultado.totalRevisar > 1 ? "s" : ""} para revisar: o histórico
            enviado não tinha um precedente claro o bastante para classificar com segurança.
          </Aviso>
        </div>
      )}

      <Section titulo="Categorias encontradas no histórico">
        <div className="flex flex-wrap gap-2">
          {resultado.categoriasEncontradas.map((c) => (
            <Chip key={c} nivel="neutral">{c}</Chip>
          ))}
        </div>
      </Section>

      <Section titulo="Lançamentos classificados">
        <label className="flex items-center gap-2 text-[13px] mb-3 cursor-pointer w-fit no-print">
          <input type="checkbox" className="w-4 h-4" checked={somenteRevisar} onChange={(e) => setSomenteRevisar(e.target.checked)} />
          Mostrar só os que precisam de revisão
        </label>
        {visiveis.length === 0 ? (
          <p className="text-muted text-sm">Nenhum lançamento marcado para revisar.</p>
        ) : (
          <DataTable colunas={colunas} linhas={visiveis} />
        )}
      </Section>
    </>
  );
}

export function Resultado({ resultado, meta, id, nomeNovos }: { resultado: ResultadoClassificacao; meta: Meta; id?: string; nomeNovos: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={`Classificação de ${resultado.totalNovos} lançamentos`} subtitulo={`${resultado.totalNovos - resultado.totalRevisar} classificados, ${resultado.totalRevisar} para revisar`}>
        <Entregar
          id={id}
          titulo={`Classificação de ${resultado.totalNovos} lançamentos`}
          texto={() => resultadoParaTexto(resultado)}
          extras={[{ rotulo: "Baixar CSV classificado", onClick: () => baixarCsv(resultado, nomeNovos) }]}
        />
      </ResultHead>

      <Origem meta={meta} demoTexto="Exemplo fixo: os arquivos enviados não foram classificados." />

      <ConteudoClassificacao resultado={resultado} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}
