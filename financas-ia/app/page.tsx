"use client";

import { useEffect, useRef, useState } from "react";
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
} from "@/components/ui";
import { GraficoCategorias } from "@/components/GraficoCategorias";
import { GraficoMeses } from "@/components/GraficoMeses";
import { parseCSV, sugerirMapeamento } from "@/lib/csv";
import { calcularResumo, formatarMoeda, normalizarRegistros } from "@/lib/analise";
import type { Destaque, Insights, LancamentoResumo, Mapeamento, Resumo } from "@/lib/types";

type ArquivoState = { nome: string; cabecalho: string[]; linhas: string[][] };

type EstadoAnalise =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; resumo: Resumo; insights: Insights; amostra: LancamentoResumo[]; demo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const [arquivo, setArquivo] = useState<ArquivoState | null>(null);
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoAnalise>({ fase: "vazio" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

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

  async function analisar(linhas: string[][], mapa: Mapeamento) {
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
    const amostra: LancamentoResumo[] = registros.slice(0, 60).map((r) => ({
      data: r.data.toISOString().slice(0, 10),
      categoria: r.categoria,
      descricao: r.descricao,
      valor: r.valor,
    }));
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar a leitura.");
      setEstado({ fase: "pronto", resumo, insights: data.insights, amostra, demo: data.demo });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function usarExemplo() {
    try {
      const r = await fetch("/exemplo-despesas.csv");
      if (!r.ok) throw new Error("Falha ao buscar o exemplo.");
      const texto = await r.text();
      const resultado = processarTexto(texto, "exemplo-despesas.csv");
      if (resultado) await analisar(resultado.linhas, resultado.mapeamento);
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
      <Topbar marca="F" nome="Analista Financeiro" area="Financeiro" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && !status.ai)} resumo="Modo demonstração: a leitura e as respostas exibidas são exemplos calculados com os números da sua planilha." />

      <Workspace>
        <Panel
          titulo="Entenda sua planilha de despesas em minutos."
          lead="Solte o CSV do financeiro aqui. Os lançamentos ficam só no seu navegador — apenas um resumo e uma amostra vão para a IA."
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Selecionar ou soltar um arquivo CSV"
            className={`border-[1.5px] border-dashed rounded-card p-7 max-md:p-5 text-center cursor-pointer transition-colors mb-4 ${
              dragOver ? "border-accent bg-accent-soft" : "border-line hover:border-accent hover:bg-accent-soft focus-visible:border-accent focus-visible:bg-accent-soft"
            }`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent grid place-items-center text-xs font-extrabold mx-auto mb-3">CSV</div>
            <p className="font-bold mb-1">Arraste o CSV de despesas aqui</p>
            <p className="text-muted text-[13.5px] mb-1.5">
              ou{" "}
              <button
                type="button"
                className="btn-link"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                selecione um arquivo
              </button>
            </p>
            <p className="text-muted text-[12.5px] m-0">Até 5 MB. O arquivo é lido e processado localmente.</p>
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
              <button type="button" className="btn-primary mt-1.5" disabled={carregando} onClick={() => analisar(arquivo.linhas, mapeamento)}>
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
          <p className="mt-3.5 text-muted text-[12.5px]">
            Nada é enviado no upload. Só agregados (totais, médias, maiores lançamentos) e uma amostra de linhas são enviados à IA quando você pede uma leitura
            ou faz uma pergunta.
          </p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              glifo="R$"
              titulo="A leitura da sua planilha aparece aqui"
              descricao="Totais, variação do mês, maiores categorias e lançamentos, gráficos e um espaço para perguntar o que quiser sobre os números."
              acao="Preencher com um exemplo"
              onAcao={usarExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading texto="Lendo os lançamentos, cruzando meses e categorias e montando a leitura..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <Resultado resumo={estado.resumo} insights={estado.insights} amostra={estado.amostra} demo={estado.demo} />}
        </Stage>
      </Workspace>
    </>
  );
}

type RespostaItem = { id: string; pergunta: string; carregando: boolean; resposta?: string; erro?: string };

function Resultado({ resumo, insights, amostra, demo }: { resumo: Resumo; insights: Insights; amostra: LancamentoResumo[]; demo: boolean }) {
  const ultimoMes = resumo.meses[resumo.meses.length - 1];
  const maiorCategoria = resumo.categorias[0];
  const variacao = resumo.variacaoUltimoMes;
  const corVariacao = variacao > 0.05 ? "text-danger" : variacao < -0.05 ? "text-ok" : "text-ink";

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
      const data = await r2.json();
      if (!r2.ok) throw new Error(data.error || "Não foi possível responder agora.");
      setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, resposta: data.resposta } : x)));
    } catch (e) {
      setRespostas((r) => r.map((x) => (x.id === id ? { ...x, carregando: false, erro: e instanceof Error ? e.message : "Erro inesperado." } : x)));
    }
  }

  return (
    <article className="reveal">
      <ResultHead
        titulo="Leitura da planilha"
        subtitulo={`${resumo.periodo.inicio} a ${resumo.periodo.fim} · ${resumo.quantidade} lançamentos${demo ? " (exemplo em modo demonstração)" : ""}`}
      >
        <CopyButton texto={() => resumoParaTexto(resumo, insights)} rotulo="Copiar leitura" />
      </ResultHead>

      <p className="summary">{insights.leitura_geral}</p>

      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 mb-7">
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Total do período</p>
          <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(resumo.total)}</p>
        </Item>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Média mensal</p>
          <p className="text-[19px] font-extrabold tracking-tight">{formatarMoeda(resumo.mediaMensal)}</p>
        </Item>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Último mês ({ultimoMes ? ultimoMes.rotulo : "-"})</p>
          <p className={`text-[19px] font-extrabold tracking-tight ${corVariacao}`}>
            {formatarMoeda(ultimoMes ? ultimoMes.total : 0)} <span className="text-[13px] font-bold ml-1">{percentual(variacao)}</span>
          </p>
        </Item>
        <Item>
          <p className="text-muted text-[12.5px] font-semibold mb-1">Maior categoria</p>
          <p className="text-[19px] font-extrabold tracking-tight">{maiorCategoria ? maiorCategoria.categoria : "-"}</p>
          <p className="text-muted text-[13px]">{maiorCategoria ? formatarMoeda(maiorCategoria.total) : ""}</p>
        </Item>
      </div>

      <Section titulo="Despesas por mês">
        <div className="card shadow-none p-4 overflow-x-auto">
          <GraficoMeses meses={resumo.meses} />
        </div>
      </Section>

      <Section titulo="Despesas por categoria">
        <div className="card shadow-none p-4 overflow-x-auto">
          <GraficoCategorias categorias={resumo.categorias} />
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
            { chave: "categoria", titulo: "Categoria", render: (l: LancamentoResumo) => l.categoria },
            { chave: "descricao", titulo: "Descrição", render: (l: LancamentoResumo) => l.descricao || "-" },
            { chave: "valor", titulo: "Valor", render: (l: LancamentoResumo) => <strong>{formatarMoeda(l.valor)}</strong> },
          ]}
          linhas={resumo.maioresLancamentos}
        />
      </Section>

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
    </article>
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

function nivelDoTipo(tipo: Destaque["tipo"]) {
  if (tipo === "alerta") return "alta";
  if (tipo === "oportunidade") return "baixa";
  return "neutral";
}

function rotuloTipo(tipo: Destaque["tipo"]) {
  if (tipo === "alerta") return "Alerta";
  if (tipo === "oportunidade") return "Oportunidade";
  return "Observação";
}

function resumoParaTexto(resumo: Resumo, insights: Insights) {
  const linhas: string[] = [
    `Leitura da planilha (${resumo.periodo.inicio} a ${resumo.periodo.fim})`,
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
