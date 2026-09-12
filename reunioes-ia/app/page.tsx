"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DemoNotice, Empty, ErrorBox, Field, Loading, Panel, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import EntradaTranscricao, { type EntradaHandle } from "@/components/EntradaTranscricao";
import AtaResultado from "@/components/AtaResultado";
import type { Ata, DadosAta, FonteTranscricao } from "@/lib/types";

const DADOS_EXEMPLO: DadosAta = {
  titulo: "Reunião de diretoria — Vetta Alimentos",
  participantes: "Renata Cavalcanti, Marcelo Duarte, Juliana Prado, Thiago Almeida, Patrícia Nunes",
  contexto: "Reunião mensal de diretoria, foco no fechamento do terceiro trimestre e no lançamento de outubro.",
};

const DADOS_VAZIOS: DadosAta = { titulo: "", participantes: "", contexto: "" };

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando"; texto: string }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; ata: Ata; titulo: string; participantes: string; demo: boolean; transcricao: string; fonteTranscricao: FonteTranscricao | null };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosAta>(DADOS_VAZIOS);
  const [textoTranscricao, setTextoTranscricao] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const entradaRef = useRef<EntradaHandle>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  const set = (campo: keyof DadosAta) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function gerarAta(transcricao: string, dadosAta: DadosAta, fonteTranscricao: FonteTranscricao | null) {
    setEstado({ fase: "carregando", texto: "Lendo a transcrição e organizando decisões, ações e responsáveis..." });
    try {
      const r = await fetch("/api/ata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcricao, titulo: dadosAta.titulo, participantes: dadosAta.participantes, contexto: dadosAta.contexto }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar a ata.");
      setEstado({ fase: "pronto", ata: data.ata, titulo: dadosAta.titulo, participantes: dadosAta.participantes, demo: data.demo, transcricao, fonteTranscricao });
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
    setEstado({ fase: "carregando", texto: "Preparando a transcrição..." });
    try {
      const entrada = await entradaRef.current!.obterEntrada();
      if (entrada.tipo === "texto") {
        await gerarAta(entrada.transcricao, dados, null);
        return;
      }
      setEstado({ fase: "carregando", texto: "Transcrevendo o áudio..." });
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
      const t = setTimeout(async () => {
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
      return () => clearTimeout(t);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="A" nome="Ata Executiva" area="Gestão" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && !status.ai)} resumo="Modo demonstração: a ata exibida é um exemplo." />

      <Workspace>
        <Panel
          titulo="A ata pronta antes de sair da sala."
          lead="Cole a transcrição, envie o áudio ou grave a reunião agora. A IA organiza decisões, ações, responsáveis e prazos, e já deixa pronto o e-mail de acompanhamento."
        >
          <form onSubmit={onSubmit}>
            <EntradaTranscricao ref={entradaRef} texto={textoTranscricao} onChangeTexto={setTextoTranscricao} />

            <Field label="Título da reunião (opcional)" htmlFor="titulo">
              <input id="titulo" className="input" placeholder="Ex.: Reunião de diretoria — setembro" value={dados.titulo} onChange={set("titulo")} />
            </Field>
            <Field label="Participantes (opcional)" htmlFor="participantes">
              <input id="participantes" className="input" placeholder="Ex.: Renata Cavalcanti, Marcelo Duarte, Juliana Prado" value={dados.participantes} onChange={set("participantes")} />
            </Field>
            <Field label="Contexto (opcional)" htmlFor="contexto">
              <textarea id="contexto" className="input min-h-20 resize-y" placeholder="Ex.: reunião mensal de diretoria, foco no fechamento do trimestre" value={dados.contexto} onChange={set("contexto")} />
            </Field>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando ata" : "Gerar ata"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">Nada é salvo. A ata existe só nesta tela até você imprimir ou copiar.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              glifo="✓"
              titulo="A ata aparece aqui"
              descricao="Resumo executivo, decisões, ações com responsáveis e prazos, riscos, pendências e um e-mail de acompanhamento pronto para enviar."
              acao="Usar transcrição de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading texto={estado.texto} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && (
            <AtaResultado
              ata={estado.ata}
              titulo={estado.titulo}
              participantes={estado.participantes}
              demo={estado.demo}
              transcricao={estado.transcricao}
              fonteTranscricao={estado.fonteTranscricao}
            />
          )}
        </Stage>
      </Workspace>
    </>
  );
}
