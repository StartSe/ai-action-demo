"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CopyButton, DemoNotice, Empty, ErrorBox, Field, Loading, Panel, ResultHead, Row, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import { PreviaPost, REDES, textoDoPost } from "@/components/PreviaPost";
import type { DadosPosts, Post, Rede, ResultadoPosts } from "@/lib/types";

const EXEMPLO: DadosPosts = {
  empresa: "Vetra Logística",
  tema: "Lançamos o rastreamento em tempo real para todos os clientes: cada embarque tem um link com posição do veículo, previsão de chegada e alerta automático de mudança de rota. No piloto com 40 clientes, as ligações de 'onde está minha carga' caíram 71% em seis semanas e o NPS subiu 12 pontos.",
  objetivo: "anunciar novidade",
  tom: "executivo",
  redes: ["linkedin", "instagram", "x"],
  publico: "gerentes de logística e supply chain de indústrias médias",
};

const VAZIO: DadosPosts = { empresa: "", tema: "", objetivo: "fortalecer marca", tom: "executivo", redes: ["linkedin", "instagram"], publico: "" };

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; resultado: ResultadoPosts; dados: DadosPosts; demo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosPosts>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [imagens, setImagens] = useState<Record<number, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  const set = (campo: keyof DadosPosts) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  function toggleRede(r: Rede) {
    setDados((d) => {
      const tem = d.redes.includes(r);
      return { ...d, redes: tem ? d.redes.filter((x) => x !== r) : [...d.redes, r] };
    });
  }

  async function gerar(d: DadosPosts) {
    if (!d.redes.length) {
      setEstado({ fase: "erro", mensagem: "Escolha pelo menos uma rede. Marque LinkedIn, Instagram ou X antes de gerar." });
      return;
    }
    setEstado({ fase: "carregando" });
    setImagens({});
    try {
      const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar os posts.");
      setEstado({ fase: "pronto", resultado: data.resultado, dados: d, demo: data.demo });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados);
  }

  function preencherExemplo() {
    setDados(EXEMPLO);
    document.getElementById("empresa")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário (sem gerar imagens).
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      const t = setTimeout(() => {
        setDados(EXEMPLO);
        gerar(EXEMPLO);
      }, 0);
      return () => clearTimeout(t);
    }
  }, []);

  function atualizarTexto(i: number, texto: string) {
    setEstado((e) => {
      if (e.fase !== "pronto") return e;
      const posts = e.resultado.posts.map((p, idx) => (idx === i ? { ...p, texto } : p));
      return { ...e, resultado: { ...e.resultado, posts } };
    });
  }

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="S" nome="Posts em Minutos" area="Marketing" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && !status.ai)} resumo="Modo demonstração: os posts exibidos são exemplos." />

      <Workspace>
        <Panel titulo="O que sua empresa tem a dizer, pronto para cada rede." lead="Descreva a novidade em poucas linhas. A IA escreve o post no formato certo para LinkedIn, Instagram e X, com sugestão de imagem e horário.">
          <form ref={formRef} onSubmit={onSubmit}>
            <Field label="Empresa ou marca" htmlFor="empresa">
              <input id="empresa" className="input" required placeholder="Vetra Logística" value={dados.empresa} onChange={set("empresa")} />
            </Field>
            <Field label="Tema ou novidade" htmlFor="tema" hint="Fatos, números e o que muda para o cliente. Quanto mais concreto, melhor o post.">
              <textarea id="tema" className="input min-h-24 resize-y" required placeholder="Ex.: lançamos o rastreamento em tempo real para todos os clientes; no piloto, as ligações de 'onde está minha carga' caíram 71%..." value={dados.tema} onChange={set("tema")} />
            </Field>
            <Row>
              <Field label="Objetivo" htmlFor="objetivo">
                <select id="objetivo" className="input" value={dados.objetivo} onChange={set("objetivo")}>
                  <option value="gerar leads">gerar leads</option>
                  <option value="fortalecer marca">fortalecer marca</option>
                  <option value="engajar comunidade">engajar comunidade</option>
                  <option value="anunciar novidade">anunciar novidade</option>
                </select>
              </Field>
              <Field label="Tom" htmlFor="tom">
                <select id="tom" className="input" value={dados.tom} onChange={set("tom")}>
                  <option value="executivo">executivo</option>
                  <option value="próximo">próximo</option>
                  <option value="provocador">provocador</option>
                  <option value="didático">didático</option>
                </select>
              </Field>
            </Row>
            <Field label="Redes" htmlFor="redes">
              <div className="flex gap-[18px] flex-wrap py-1" id="redes">
                {(Object.keys(REDES) as Rede[]).map((r) => (
                  <label key={r} className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-accent m-0" checked={dados.redes.includes(r)} onChange={() => toggleRede(r)} />
                    {REDES[r].nome}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Público-alvo (opcional)" htmlFor="publico">
              <input id="publico" className="input" placeholder="Ex.: gerentes de logística de indústrias médias" value={dados.publico} onChange={set("publico")} />
            </Field>
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando posts" : "Gerar posts"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">Nada é salvo. Os posts existem só nesta tela até você copiar ou baixar.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && <Empty glifo="S" titulo="Os posts aparecem aqui" descricao="Uma prévia por rede, com o texto no formato certo, hashtags, melhor horário para publicar e imagem gerada sob demanda." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading texto="Lendo o briefing, definindo a ideia central e adaptando o texto ao formato de cada rede..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && (
            <Resultado
              resultado={estado.resultado}
              dados={estado.dados}
              demo={estado.demo}
              imagens={imagens}
              onImagemGerada={(i, url) => setImagens((m) => ({ ...m, [i]: url }))}
              onTextoAtualizado={atualizarTexto}
            />
          )}
        </Stage>
      </Workspace>
    </>
  );
}

function Resultado({
  resultado,
  dados,
  demo,
  imagens,
  onImagemGerada,
  onTextoAtualizado,
}: {
  resultado: ResultadoPosts;
  dados: DadosPosts;
  demo: boolean;
  imagens: Record<number, string>;
  onImagemGerada: (i: number, url: string) => void;
  onTextoAtualizado: (i: number, texto: string) => void;
}) {
  const posts = resultado.posts || [];
  const copiarTudo = () => posts.map((p: Post) => `${REDES[p.rede]?.nome || p.rede}\n\n${textoDoPost(p)}`).join("\n\n----------\n\n");

  return (
    <article className="reveal">
      <ResultHead titulo={`Posts de ${dados.empresa}`} subtitulo={`${posts.length} ${posts.length === 1 ? "rede" : "redes"}, objetivo: ${dados.objetivo}, tom ${dados.tom}${demo ? " (exemplo em modo demonstração)" : ""}`}>
        <CopyButton texto={copiarTudo} rotulo="Copiar todos" />
      </ResultHead>

      <p className="summary">{resultado.ideia_central}</p>

      <div className="mb-8">
        <h2 className="section-title">Prévia por rede</h2>
        <div className="grid grid-cols-2 max-[1180px]:grid-cols-1 gap-[18px] items-start">
          {posts.map((p, i) => (
            <PreviaPost
              key={i}
              post={p}
              empresa={dados.empresa}
              ideiaCentral={resultado.ideia_central}
              imagemUrl={imagens[i]}
              onImagemGerada={(url) => onImagemGerada(i, url)}
              onTextoAtualizado={(texto) => onTextoAtualizado(i, texto)}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
