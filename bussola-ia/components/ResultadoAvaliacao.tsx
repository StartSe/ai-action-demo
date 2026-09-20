"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Aviso, DataTable, Destaque, Entregar, Item, Origem, ResultHead, SeloIA, Section, data, lerErro, numero, useStatus, type ErroLido } from "@/components/ui";
import { GraficoMaturidade } from "@/components/GraficoMaturidade";
import type { Meta } from "@/lib/ai";
import type { Analise, Avaliacao, MediaDimensao } from "@/lib/types";
/** CSV das respostas recebidas, uma linha por respondente e uma coluna por pergunta do questionário. */
function respostasParaCSV(avaliacao: Avaliacao): string {
  const perguntas = avaliacao.questionario.perguntas;
  const cabecalho = ["Área", "Cargo", "Respondido em", ...perguntas.map((p) => p.texto)];
  const linha = (campos: string[]) => campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";");
  const linhas = avaliacao.respostas.map((r) =>
    linha([r.respondente?.area || "", r.respondente?.cargo || "", data(r.criadoEm), ...perguntas.map((p) => r.valores[p.id] || "")])
  );
  return "﻿" + [linha(cabecalho), ...linhas].join("\r\n");
}

function baixarRespostasCSV(avaliacao: Avaliacao) {
  const blob = new Blob([respostasParaCSV(avaliacao)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "respostas-avaliacao.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Resultado({ avaliacao, meta, id }: { avaliacao: Avaliacao; meta: Meta; id?: string }) {
  const analise = avaliacao.analise;
  const [avisoCopia, setAvisoCopia] = useState<"ok" | "falha" | null>(null);
  // Diagnóstico real cuja leitura escrita saiu da leitura automática (sem chave ou IA indisponível): não é exemplo,
  // mas também não foi "gerado com IA" — a linha de origem e o selo dizem exatamente isso.
  const leituraAutomatica = !meta.demo && analise?.origemLeitura === "automatica";

  async function copiarProximosPassos() {
    const texto = (analise?.proximosPassos ?? []).map((p, i) => `${i + 1}. ${p}`).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setAvisoCopia("ok");
    } catch {
      setAvisoCopia("falha");
    }
    setTimeout(() => setAvisoCopia(null), 4000);
  }

  return (
    <article className="reveal">
      <ResultHead titulo={avaliacao.titulo} subtitulo={avaliacao.empresa}>
        <Entregar
          id={id}
          titulo={avaliacao.titulo}
          texto={() => avaliacaoParaTexto(avaliacao)}
          extras={[
            { rotulo: "Baixar respostas (CSV)", onClick: () => baixarRespostasCSV(avaliacao) },
            ...(analise?.proximosPassos.length ? [{ rotulo: "Copiar próximos passos", onClick: copiarProximosPassos }] : []),
          ]}
        />
      </ResultHead>
      {avisoCopia === "ok" && <div className="mb-4"><Aviso tom="ok">Próximos passos copiados. Cole no e-mail ou na mensagem.</Aviso></div>}
      {avisoCopia === "falha" && <div className="mb-4"><Aviso tom="danger">Não foi possível copiar automaticamente. Use &ldquo;Copiar texto&rdquo; no menu Mais.</Aviso></div>}

      {leituraAutomatica ? (
        <p className="text-muted text-[13px] mb-4">
          Diagnóstico calculado a partir de {meta.insumo}, em {data(meta.geradoEm, { comHora: true })}.{" "}
          <Link href="/setup#openrouter" className="font-semibold text-accent underline underline-offset-2">Conectar a IA para a leitura escrita</Link>
        </p>
      ) : (
        <Origem meta={meta} demoTexto={meta.demo ? `Exemplo ilustrativo a partir de ${meta.insumo}.` : undefined} />
      )}

      {analise?.avisoIA && <div className="mb-4"><Aviso tom="warn">{analise.avisoIA}</Aviso></div>}

      <ConteudoAvaliacao avaliacao={avaliacao} acoesPassos={id && analise ? <EnviarAoQuadro id={id} analise={analise} /> : undefined} />

      {leituraAutomatica ? (
        <p className="text-center mt-6"><span className="chip-cinza">Leitura automática, sem IA</span></p>
      ) : (
        <SeloIA demo={meta.demo} />
      )}
    </article>
  );
}

type EnvioPasso = { indice: number; passo: string; ok: boolean; mensagem: string };

/** "Enviar próximos passos ao quadro": cada passo vira um cartão no quadro de tarefas conectado (MCP). Três estados:
 * status carregando → nada; quadro conectado → botão; senão → link para conectar em Configurações. */
function EnviarAoQuadro({ id, analise }: { id: string; analise: Analise }) {
  const { status } = useStatus();
  const [enviando, setEnviando] = useState(false);
  const [noQuadro, setNoQuadro] = useState<number[]>(analise.passosNoQuadro ?? []);
  const [resultados, setResultados] = useState<EnvioPasso[] | null>(null);
  const [erroEnvio, setErroEnvio] = useState<ErroLido | null>(null);

  if (!status) return null;
  const conectado = Boolean(status.integrations?.mcpTarefas);
  const total = analise.proximosPassos.length;
  const todosEnviados = noQuadro.length >= total;

  async function enviar() {
    setEnviando(true);
    setErroEnvio(null);
    setResultados(null);
    try {
      const r = await fetch(`/api/bussola/${id}/quadro`, { method: "POST" });
      if (!r.ok) {
        setErroEnvio(await lerErro(r));
        return;
      }
      const d = (await r.json()) as { avaliacao: Avaliacao; resultados: EnvioPasso[] };
      setResultados(d.resultados);
      setNoQuadro(d.avaliacao.analise?.passosNoQuadro ?? []);
    } catch (e) {
      setErroEnvio(await lerErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="no-print mt-4 flex flex-col gap-3">
      {conectado ? (
        todosEnviados ? (
          <p className="text-muted text-sm">Os {total} passos já estão no quadro de tarefas.</p>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-ghost !w-auto" onClick={enviar} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar próximos passos ao quadro"}
            </button>
            {noQuadro.length > 0 && <span className="text-muted text-[13px]">{noQuadro.length} de {total} já no quadro</span>}
          </div>
        )
      ) : (
        <a href="/setup#mcp-tarefas" className="btn-ghost !w-auto">Enviar próximos passos ao quadro</a>
      )}
      {resultados && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {resultados.map((r) => (
            <li key={r.indice} className={r.ok ? "text-ok" : "text-danger"}>{r.ok ? "Criado no quadro: " : "Não enviado: "}{r.passo}{!r.ok && ` (${r.mensagem})`}</li>
          ))}
        </ul>
      )}
      {erroEnvio && <Aviso tom="danger" acao={erroEnvio.acao}>{erroEnvio.mensagem}</Aviso>}
    </div>
  );
}

const TOM_NIVEL: Record<number, "danger" | "warn" | "neutro" | "ok"> = { 1: "danger", 2: "warn", 3: "neutro", 4: "ok", 5: "ok" };

/** Corpo da avaliação (sem cabeçalho nem Origem), reaproveitado pela página de impressão. `acoesPassos` entra
 * abaixo dos próximos passos só na tela (a impressão não passa nada). */
export function ConteudoAvaliacao({ avaliacao, acoesPassos }: { avaliacao: Avaliacao; acoesPassos?: ReactNode }) {
  const analise = avaliacao.analise;
  const n = avaliacao.respostas.length;

  return (
    <>
      {analise && (
        <Destaque
          valor={`${numero(analise.nivelGeral, 1)} · ${analise.nomeEstagio}`}
          rotulo="Nível geral de maturidade em IA"
          interpretacao={`Com base em ${n} ${n === 1 ? "resposta" : "respostas"}, numa escala de 1 (Inicial) a 5 (Transformação).`}
          tom={TOM_NIVEL[Math.round(analise.nivelGeral)] ?? "neutro"}
        />
      )}

      {analise && <p className="summary">{analise.resumo}</p>}

      {analise && analise.mediasPorDimensao.length > 0 && (
        <Section titulo="Mapa de maturidade">
          <GraficoMaturidade medias={analise.mediasPorDimensao} leituraPorDimensao={analise.leituraPorDimensao ?? []} />
        </Section>
      )}

      {analise && analise.forcas?.length > 0 && (
        <Section titulo="Forças">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {analise.forcas.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      {analise && analise.lacunas?.length > 0 && (
        <Section titulo="Lacunas">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {analise.lacunas.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      {analise && analise.proximosPassos?.length > 0 && (
        <Section titulo="Próximos passos">
          <Item>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              {analise.proximosPassos.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            {acoesPassos}
          </Item>
        </Section>
      )}

      {analise?.ondeDiscordam && analise.ondeDiscordam.length > 0 && (
        <Section titulo="Onde discordam">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {analise.ondeDiscordam.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      <Section titulo={`Respondentes (${n})`}>
        <DataTable
          colunas={[
            { chave: "area", titulo: "Área", papel: "titulo", largura: "30%", render: (r) => r.respondente?.area || "Não informado" },
            { chave: "cargo", titulo: "Cargo", render: (r) => r.respondente?.cargo || "Não informado" },
            { chave: "criadoEm", titulo: "Respondido em", largura: "160px", render: (r) => data(r.criadoEm) },
          ]}
          linhas={avaliacao.respostas}
        />
      </Section>
    </>
  );
}

function avaliacaoParaTexto(avaliacao: Avaliacao): string {
  const analise = avaliacao.analise;
  const l: string[] = [`${avaliacao.titulo} — ${avaliacao.empresa}`, ""];
  if (analise) {
    l.push(`Nível geral: ${numero(analise.nivelGeral, 1)} (${analise.nomeEstagio})`, "", analise.resumo, "");
  }
  l.push("Nível por dimensão:");
  (analise?.mediasPorDimensao ?? []).forEach((m: MediaDimensao) => l.push(`- ${m.dimensao}: ${numero(m.media, 1)}`));
  if (analise?.forcas?.length) { l.push("", "Forças:"); analise.forcas.forEach((f) => l.push(`- ${f}`)); }
  if (analise?.lacunas?.length) { l.push("", "Lacunas:"); analise.lacunas.forEach((f) => l.push(`- ${f}`)); }
  if (analise?.proximosPassos?.length) { l.push("", "Próximos passos:"); analise.proximosPassos.forEach((p, i) => l.push(`${i + 1}. ${p}`)); }
  if (analise?.ondeDiscordam?.length) { l.push("", "Onde discordam:"); analise.ondeDiscordam.forEach((f) => l.push(`- ${f}`)); }
  l.push("", `Respondentes (${avaliacao.respostas.length}):`);
  avaliacao.respostas.forEach((r) => l.push(`- ${r.respondente?.area || "Não informado"} · ${r.respondente?.cargo || "Não informado"}`));
  return l.join("\n");
}
