"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, Entregar, ErrorBox, Field, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { GradePosts, REDES, textoDoPost } from "@/components/PreviaPost";
import type { Meta } from "@/lib/ai";
import type { DadosPosts, ImagemGerada, Post, Rede, ResultadoPosts } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const EXEMPLO: DadosPosts = {
  empresa: "Vetra Logística",
  tema: "Lançamos o rastreamento em tempo real para todos os clientes: cada embarque tem um link com posição do veículo, previsão de chegada e alerta automático de mudança de rota. No piloto com 40 clientes, as ligações de 'onde está minha carga' caíram 71% em seis semanas e o NPS subiu 12 pontos.",
  objetivo: "anunciar novidade",
  tom: "executivo",
  redes: ["linkedin", "instagram", "x"],
  publico: "gerentes de logística e supply chain de indústrias médias",
};

const VAZIO: DadosPosts = { empresa: "", tema: "", objetivo: "fortalecer marca", tom: "executivo", redes: ["linkedin", "instagram"], publico: "" };

const ETAPAS_CARREGANDO = ["Lendo o briefing e definindo a ideia central...", "Escrevendo o texto no formato de cada rede...", "Sugerindo hashtags e o melhor horário..."];

/** Três cartões de post sobrepostos, no lugar de um glifo genérico no estado vazio. */
function IlustracaoPosts() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="14" width="17" height="36" rx="3" />
      <rect x="23.5" y="8" width="17" height="42" rx="3" />
      <rect x="44" y="14" width="17" height="36" rx="3" />
      <circle cx="9.5" cy="21" r="2.5" />
      <path d="M15 21h3" />
      <path d="M6.5 28h11M6.5 33h11M6.5 38h7" />
      <circle cx="30" cy="16" r="2.5" />
      <path d="M35.5 16h3" />
      <path d="M27 23h11M27 28h11M27 33h7" />
      <circle cx="50.5" cy="21" r="2.5" />
      <path d="M56 21h3" />
      <path d="M47.5 28h11M47.5 33h11M47.5 38h7" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; resultado: ResultadoPosts; dados: DadosPosts; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosPosts>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/posts").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/posts", { method: "DELETE" }).then(carregarHistorico);
  }

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
    try {
      const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar os posts.");
      setEstado({ fase: "pronto", resultado: resposta.resultado, dados: d, meta: resposta.meta, id: resposta.id });
      fetch("/api/posts").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
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
      setTimeout(() => {
        setDados(EXEMPLO);
        gerar(EXEMPLO);
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="S" nome="Posts em Minutos" area="Marketing" status={status} erro={erro} resumo="Modo demonstração: os posts exibidos são exemplos." />

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
                  <option value="gerar leads">Gerar leads</option>
                  <option value="fortalecer marca">Fortalecer marca</option>
                  <option value="engajar comunidade">Engajar comunidade</option>
                  <option value="anunciar novidade">Anunciar novidade</option>
                </select>
              </Field>
              <Field label="Tom" htmlFor="tom">
                <select id="tom" className="input" value={dados.tom} onChange={set("tom")}>
                  <option value="executivo">Executivo</option>
                  <option value="próximo">Próximo</option>
                  <option value="provocador">Provocador</option>
                  <option value="didático">Didático</option>
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
            <MaisDetalhes>
              <Field label="Público-alvo (opcional)" htmlFor="publico">
                <input id="publico" className="input" placeholder="Ex.: gerentes de logística de indústrias médias" value={dados.publico} onChange={set("publico")} />
              </Field>
            </MaisDetalhes>
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando posts" : "Gerar posts"}</button>
          </form>
          <Privacidade detalhe="Os posts ficam salvos neste app até você apagar em 'Últimos resultados'." />

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
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoPosts />} titulo="Os posts aparecem aqui" descricao="Uma prévia por rede, com o texto no formato certo, hashtags, melhor horário para publicar e imagem gerada sob demanda." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <Resultado resultado={estado.resultado} dados={estado.dados} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({ resultado, dados, meta, id }: { resultado: ResultadoPosts; dados: DadosPosts; meta: Meta; id?: string }) {
  const [posts, setPosts] = useState<Post[]>(resultado.posts || []);
  const [imagens, setImagens] = useState<Record<number, ImagemGerada>>({});

  const copiarTudo = () => posts.map((p) => `${REDES[p.rede]?.nome || p.rede}\n\n${textoDoPost(p)}`).join("\n\n----------\n\n");

  return (
    <article className="reveal">
      <ResultHead titulo={`Posts de ${dados.empresa}`} subtitulo={`${posts.length} ${posts.length === 1 ? "rede" : "redes"}, objetivo: ${dados.objetivo}, tom ${dados.tom}`}>
        <Entregar id={id} titulo={`Posts de ${dados.empresa}`} texto={copiarTudo} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoPosts
        posts={posts}
        empresa={dados.empresa}
        ideiaCentral={resultado.ideia_central}
        imagens={imagens}
        onImagemGerada={(i, imagem) => setImagens((m) => ({ ...m, [i]: imagem }))}
        onTextoAtualizado={(i, texto) => setPosts((ps) => ps.map((p, idx) => (idx === i ? { ...p, texto } : p)))}
      />
    </article>
  );
}

/** Ideia central + prévia por rede (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoPosts({
  posts,
  empresa,
  ideiaCentral,
  imagens,
  onImagemGerada,
  onTextoAtualizado,
}: {
  posts: Post[];
  empresa: string;
  ideiaCentral: string;
  imagens: Record<number, ImagemGerada>;
  onImagemGerada: (i: number, imagem: ImagemGerada) => void;
  onTextoAtualizado: (i: number, texto: string) => void;
}) {
  return (
    <>
      <p className="summary">{ideiaCentral}</p>

      <div className="mb-8">
        <h2 className="section-title">Prévia por rede</h2>
        <GradePosts
          posts={posts}
          empresa={empresa}
          ideiaCentral={ideiaCentral}
          imagens={imagens}
          onImagemGerada={onImagemGerada}
          onTextoAtualizado={onTextoAtualizado}
        />
      </div>
    </>
  );
}
