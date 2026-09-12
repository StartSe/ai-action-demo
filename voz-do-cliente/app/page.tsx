"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CampoArquivo } from "@/components/CampoArquivo";
import { ResultadoAnalise, type MetaAnalise } from "@/components/ResultadoAnalise";
import { DemoNotice, Empty, ErrorBox, Field, Loading, Panel, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import {
  adivinharColunaNota,
  adivinharColunaTexto,
  comentariosDoArquivo,
  comentariosDoTexto,
  lerArquivo,
  type ArquivoDados,
} from "@/lib/parse";
import type { Analise, Comentario } from "@/lib/types";

const LIMITE_COMENTARIOS = 500;

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; analise: Analise; meta: MetaAnalise };

export default function Page() {
  const { status, erro } = useStatus();
  const [contexto, setContexto] = useState("");
  const [textoComentarios, setTextoComentarios] = useState("");
  const [arquivoDados, setArquivoDados] = useState<ArquivoDados | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [usarArquivo, setUsarArquivo] = useState(false);
  const [idxTexto, setIdxTexto] = useState(0);
  const [idxNota, setIdxNota] = useState(-1);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  const comentarios: Comentario[] = useMemo(() => {
    if (usarArquivo && arquivoDados) return comentariosDoArquivo(arquivoDados, idxTexto, idxNota);
    return comentariosDoTexto(textoComentarios);
  }, [usarArquivo, arquivoDados, idxTexto, idxNota, textoComentarios]);

  const headersCSV = usarArquivo && arquivoDados && arquivoDados.tipo === "csv" ? arquivoDados.headers : null;

  const textoContagem =
    comentarios.length === 0
      ? "Nenhum comentário detectado ainda."
      : `${comentarios.length} comentário${comentarios.length === 1 ? "" : "s"} detectado${comentarios.length === 1 ? "" : "s"}.`;

  const avisoLimite =
    comentarios.length > LIMITE_COMENTARIOS
      ? `Detectamos ${comentarios.length} comentários. O limite é ${LIMITE_COMENTARIOS} por análise: vamos analisar os ${LIMITE_COMENTARIOS} primeiros.`
      : "";

  function onTextoChange(v: string) {
    setTextoComentarios(v);
    if (v.trim()) {
      setUsarArquivo(false);
      setArquivoDados(null);
      setNomeArquivo("");
    }
  }

  async function onArquivo(file: File | null) {
    if (!file) {
      setUsarArquivo(false);
      setArquivoDados(null);
      setNomeArquivo("");
      return;
    }
    const dados = await lerArquivo(file);
    setArquivoDados(dados);
    setNomeArquivo(file.name);
    setUsarArquivo(true);
    setTextoComentarios("");
    if (dados.tipo === "csv") {
      setIdxTexto(Math.max(0, adivinharColunaTexto(dados.headers)));
      setIdxNota(adivinharColunaNota(dados.headers));
    }
  }

  async function analisar(lista: Comentario[], ctx: string) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentarios: lista, contexto: ctx }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao analisar os comentários.");
      setEstado({
        fase: "pronto",
        analise: data.analise,
        meta: {
          contexto: ctx,
          demo: data.demo,
          truncado: data.truncado,
          total_enviado: data.total_enviado,
          total_analisado: data.total_analisado,
        },
      });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const lista = comentarios.slice(0, LIMITE_COMENTARIOS);
    if (!lista.length) {
      setEstado({ fase: "erro", mensagem: "Cole ao menos um comentário ou envie um arquivo antes de analisar." });
      return;
    }
    analisar(lista, contexto);
  }

  async function preencherExemplo() {
    setContexto("app do banco");
    setUsarArquivo(false);
    setArquivoDados(null);
    setNomeArquivo("");
    try {
      const r = await fetch("/exemplo-feedbacks.txt");
      const texto = await r.text();
      setTextoComentarios(texto);
      return texto;
    } catch {
      return "";
    }
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(async () => {
        const texto = await preencherExemplo();
        const lista = comentariosDoTexto(texto).slice(0, LIMITE_COMENTARIOS);
        if (lista.length) analisar(lista, "app do banco");
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="V" nome="Voz do Cliente" area="Experiência do Cliente e Marketing" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && !status.ai)} resumo="Modo demonstração: a análise exibida é um exemplo." />

      <Workspace>
        <Panel
          titulo="Centenas de comentários lidos em minutos."
          lead="Cole os comentários de NPS, avaliações ou tickets, ou envie um arquivo. A IA agrupa por tema, mede o sentimento e diz por onde começar."
        >
          <form onSubmit={onSubmit}>
            <Field label="Sobre o que são os comentários?" htmlFor="contexto">
              <input id="contexto" className="input" placeholder="Ex.: app do banco" value={contexto} onChange={(e) => setContexto(e.target.value)} />
            </Field>

            <Field label="Cole os comentários, um por linha" htmlFor="comentarios">
              <>
                <textarea
                  id="comentarios"
                  className="input min-h-32 resize-y"
                  placeholder="Ex.: O app trava toda vez que tento fazer um Pix..."
                  value={textoComentarios}
                  onChange={(e) => onTextoChange(e.target.value)}
                />
                <span className="text-[12.5px] text-muted">{textoContagem}</span>
                {avisoLimite && <p className="text-[12.5px] text-warn mt-1">{avisoLimite}</p>}
              </>
            </Field>

            <CampoArquivo
              nomeArquivo={nomeArquivo}
              headers={headersCSV}
              idxTexto={idxTexto}
              idxNota={idxNota}
              onArquivo={onArquivo}
              onColTexto={setIdxTexto}
              onColNota={setIdxNota}
            />

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar comentários"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">Nada é salvo. Limite de 500 comentários por análise; acima disso, analisamos os 500 primeiros.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              glifo="V"
              titulo="A análise aparece aqui"
              descricao="Resumo executivo, sentimento geral, NPS, temas mais citados e a matriz de prioridade do que resolver primeiro."
              acao="Usar comentários de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading texto="Lendo os comentários, agrupando por tema e medindo o sentimento..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <ResultadoAnalise analise={estado.analise} meta={estado.meta} />}
        </Stage>
      </Workspace>
    </>
  );
}
