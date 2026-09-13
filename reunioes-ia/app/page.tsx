"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CopyButton,
  DataTable,
  Destaque,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Item,
  Loading,
  MaisDetalhes,
  Origem,
  Panel,
  Privacidade,
  ResultHead,
  Section,
  Stage,
  Topbar,
  Workspace,
  data,
  useScrollToResult,
  useStatus,
} from "@/components/ui";
import EntradaTranscricao, { type EntradaHandle } from "@/components/EntradaTranscricao";
import type { Meta } from "@/lib/ai";
import type { Ata, DadosAta, FonteTranscricao } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const DADOS_EXEMPLO: DadosAta = {
  titulo: "Reunião de diretoria — Vetta Alimentos",
  participantes: "Renata Cavalcanti, Marcelo Duarte, Juliana Prado, Thiago Almeida, Patrícia Nunes",
  contexto: "Reunião mensal de diretoria, foco no fechamento do terceiro trimestre e no lançamento de outubro.",
};

const DADOS_VAZIOS: DadosAta = { titulo: "", participantes: "", contexto: "" };

const ETAPAS_CARREGANDO = ["Preparando a transcrição...", "Transcrevendo o áudio, se houver...", "Lendo a transcrição e organizando decisões, ações e responsáveis..."];

const NOMES_FONTE: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI Whisper",
  demo: "transcrição de exemplo",
};

/** Folha com linhas e uma marcação concluída, no lugar de um glifo genérico no estado vazio. */
function IlustracaoAta() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 6h27l9 9v43a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="M41 6v9h9" />
      <path d="M20 29h18M20 37h18M20 45h10" />
      <path d="M38 47l3.5 3.5L50 42" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; ata: Ata; titulo: string; participantes: string; transcricao: string; fonteTranscricao: FonteTranscricao | null; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosAta>(DADOS_VAZIOS);
  const [textoTranscricao, setTextoTranscricao] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const entradaRef = useRef<EntradaHandle>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/ata").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/ata", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosAta) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function gerarAta(transcricao: string, dadosAta: DadosAta, fonteTranscricao: FonteTranscricao | null) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/ata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcricao, titulo: dadosAta.titulo, participantes: dadosAta.participantes, contexto: dadosAta.contexto, fonteTranscricao }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar a ata.");
      setEstado({
        fase: "pronto",
        ata: resposta.ata,
        titulo: dadosAta.titulo,
        participantes: dadosAta.participantes,
        transcricao,
        fonteTranscricao,
        meta: resposta.meta,
        id: resposta.id,
      });
      fetch("/api/ata").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function transcreverArquivo(arquivo: File): Promise<{ transcricao: string; fonte: FonteTranscricao }> {
    const body = new FormData();
    body.append("audio", arquivo, arquivo.name);
    const r = await fetch("/api/transcrever", { method: "POST", body });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Falha ao transcrever o áudio.");
    return { transcricao: data.transcricao, fonte: data.fonte };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEstado({ fase: "carregando" });
    try {
      const entrada = await entradaRef.current!.obterEntrada();
      if (entrada.tipo === "texto") {
        await gerarAta(entrada.transcricao, dados, null);
        return;
      }
      const { transcricao, fonte } = await transcreverArquivo(entrada.arquivo);
      await gerarAta(transcricao, dados, fonte);
    } catch (err) {
      setEstado({ fase: "erro", mensagem: err instanceof Error ? err.message : "Erro inesperado." });
    }
  }

  async function preencherExemplo() {
    entradaRef.current?.selecionarAbaTexto();
    try {
      const r = await fetch("/exemplo-transcricao.txt");
      const texto = await r.text();
      setTextoTranscricao(texto.trim());
    } catch {
      /* segue sem preencher se o arquivo não carregar */
    }
    setDados(DADOS_EXEMPLO);
    document.getElementById("transcricaoTexto")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o exemplo.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(async () => {
        entradaRef.current?.selecionarAbaTexto();
        let texto = "";
        try {
          texto = (await (await fetch("/exemplo-transcricao.txt")).text()).trim();
        } catch {
          /* segue sem exemplo se o arquivo não carregar */
        }
        setTextoTranscricao(texto);
        setDados(DADOS_EXEMPLO);
        await gerarAta(texto, DADOS_EXEMPLO, null);
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="A" nome="Ata Executiva" area="Gestão" status={status} erro={erro} resumo="Modo demonstração: a ata exibida é um exemplo." />

      <Workspace>
        <Panel
          titulo="A ata pronta antes de sair da sala."
          lead="Cole a transcrição, envie o áudio ou grave a reunião agora, e a IA organiza decisões, ações e responsáveis."
        >
          <form onSubmit={onSubmit}>
            <EntradaTranscricao ref={entradaRef} texto={textoTranscricao} onChangeTexto={setTextoTranscricao} />

            <Field label="Título da reunião (opcional)" htmlFor="titulo">
              <input id="titulo" className="input" placeholder="Ex.: Reunião de diretoria — setembro" value={dados.titulo} onChange={set("titulo")} />
            </Field>
            <Field label="Participantes (opcional)" htmlFor="participantes">
              <input id="participantes" className="input" placeholder="Ex.: Renata Cavalcanti, Marcelo Duarte, Juliana Prado" value={dados.participantes} onChange={set("participantes")} />
            </Field>
            <MaisDetalhes>
              <Field label="Contexto (opcional)" htmlFor="contexto">
                <textarea id="contexto" className="input min-h-20 resize-y" placeholder="Ex.: reunião mensal de diretoria, foco no fechamento do trimestre" value={dados.contexto} onChange={set("contexto")} />
              </Field>
            </MaisDetalhes>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando ata" : "Gerar ata"}</button>
          </form>
          <Privacidade detalhe="A ata fica salva neste app até você apagar em 'Últimos resultados'." />

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
              ilustracao={<IlustracaoAta />}
              titulo="A ata aparece aqui"
              descricao="Resumo executivo, decisões, ações com responsáveis e prazos, riscos, pendências e um e-mail de acompanhamento pronto para enviar."
              acao="Usar transcrição de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && (
            <Resultado
              ata={estado.ata}
              titulo={estado.titulo}
              participantes={estado.participantes}
              transcricao={estado.transcricao}
              fonteTranscricao={estado.fonteTranscricao}
              meta={estado.meta}
              id={estado.id}
            />
          )}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({
  ata,
  titulo,
  participantes,
  transcricao,
  fonteTranscricao,
  meta,
  id,
}: {
  ata: Ata;
  titulo?: string;
  participantes?: string;
  transcricao?: string;
  fonteTranscricao?: FonteTranscricao | null;
  meta: Meta;
  id?: string;
}) {
  const tituloAta = ata.titulo || titulo || "Ata da reunião";
  return (
    <article className="reveal">
      <ResultHead titulo={tituloAta} subtitulo={participantes || undefined}>
        <Entregar id={id} titulo={tituloAta} texto={() => ataParaTexto(ata, titulo)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAta ata={ata} transcricao={transcricao} fonteTranscricao={fonteTranscricao} />
    </article>
  );
}

/** Corpo da ata (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAta({ ata, transcricao, fonteTranscricao }: { ata: Ata; transcricao?: string; fonteTranscricao?: FonteTranscricao | null }) {
  const [transcricaoAberta, setTranscricaoAberta] = useState(false);

  return (
    <>
      <Destaque valor={`${(ata.decisoes || []).length} decisões · ${(ata.acoes || []).length} ações`} rotulo="Registradas nesta reunião" />

      <p className="summary">{ata.resumo_executivo}</p>

      <Section titulo="Decisões">
        <div className="flex flex-col gap-3">
          {(ata.decisoes || []).length ? (
            ata.decisoes.map((d, i) => (
              <Item key={i}>
                <h3 className="font-bold mb-1">{d.decisao}</h3>
                <p className="text-muted text-sm">{d.contexto}</p>
              </Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhuma decisão registrada.</p>
          )}
        </div>
      </Section>

      <Section titulo="Ações">
        <DataTable
          colunas={[
            {
              chave: "check",
              titulo: "",
              render: () => <input type="checkbox" aria-label="Concluída" className="w-4 h-4 accent-accent cursor-pointer" />,
              classe: "w-8",
            },
            { chave: "acao", titulo: "Ação", papel: "titulo", largura: "36%", render: (l) => <strong>{l.acao}</strong> },
            { chave: "responsavel", titulo: "Responsável", papel: "resumo", render: (l) => l.responsavel },
            { chave: "prazo", titulo: "Prazo", papel: "chip", largura: "120px", render: (l) => <span className="font-bold text-accent-ink">{l.prazo}</span> },
          ]}
          linhas={ata.acoes || []}
        />
        {!(ata.acoes || []).length && <p className="text-muted text-sm mt-2">Nenhuma ação identificada.</p>}
      </Section>

      <Section titulo="Riscos e bloqueios">
        <div className="flex flex-col gap-3">
          {(ata.riscos_e_bloqueios || []).length ? (
            ata.riscos_e_bloqueios.map((r, i) => (
              <Item key={i}><p>{r}</p></Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhum risco relevante identificado.</p>
          )}
        </div>
      </Section>

      <Section titulo="Ficou em aberto">
        <div className="flex flex-col gap-3">
          {(ata.pendencias || []).length ? (
            ata.pendencias.map((p, i) => (
              <Item key={i}><p>{p}</p></Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhuma pendência registrada.</p>
          )}
        </div>
        {ata.proximos_passos && <p className="mt-3 text-muted">{ata.proximos_passos}</p>}
      </Section>

      <Section titulo="E-mail de acompanhamento">
        <Item className="flex flex-col gap-2.5">
          <div className="text-sm"><strong>Assunto:</strong> {ata.email_followup?.assunto}</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-ink m-0 bg-bg border border-line rounded-[8px] px-4 py-3.5">{ata.email_followup?.corpo}</pre>
          <CopyButton
            texto={() => `${ata.email_followup?.assunto || ""}\n\n${ata.email_followup?.corpo || ""}`}
            rotulo="Copiar e-mail"
          />
        </Item>
      </Section>

      {transcricao && (
        <Section titulo="Transcrição">
          <button type="button" className="btn-link" onClick={() => setTranscricaoAberta((v) => !v)}>
            {transcricaoAberta ? "Ocultar transcrição" : "Ver transcrição"}
          </button>
          {transcricaoAberta && (
            <div className="mt-3 card shadow-none px-[18px] py-4">
              {fonteTranscricao && (
                <div className="text-[12.5px] text-muted mb-2">Transcrita via {NOMES_FONTE[fonteTranscricao] || fonteTranscricao}.</div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-muted m-0">{transcricao}</pre>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function ataParaTexto(ata: Ata, titulo?: string): string {
  const linhas: string[] = [ata.titulo || titulo || "Ata da reunião", "", ata.resumo_executivo, "", "Decisões:"];
  (ata.decisoes || []).forEach((d) => linhas.push(`- ${d.decisao} (${d.contexto})`));
  linhas.push("", "Ações:");
  (ata.acoes || []).forEach((a) => linhas.push(`- ${a.acao} | Responsável: ${a.responsavel} | Prazo: ${a.prazo}`));
  linhas.push("", "Riscos e bloqueios:");
  (ata.riscos_e_bloqueios || []).forEach((r) => linhas.push(`- ${r}`));
  linhas.push("", "Ficou em aberto:");
  (ata.pendencias || []).forEach((p) => linhas.push(`- ${p}`));
  if (ata.proximos_passos) linhas.push("", "Próximos passos:", ata.proximos_passos);
  linhas.push("", "E-mail de acompanhamento:", ata.email_followup?.assunto || "", ata.email_followup?.corpo || "");
  return linhas.join("\n");
}
