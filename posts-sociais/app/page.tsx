"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Entregar, ErrorBox, Field, Hero, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, SeloIA, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type PassoIndicador } from "@/components/ui";
import { Aprovados } from "@/components/Aprovados";
import { GradePosts, REDES, textoDoPost, useImagensPosts, type EstadoImagens } from "@/components/PreviaPost";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { DadosPosts, Post, Rede, ResultadoPosts } from "@/lib/types";

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

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Marketing",
  titulo: "Posts prontos para cada rede em minutos",
  apoio: "Descreva a novidade em poucas linhas: a IA escreve o post no formato de LinkedIn, Instagram e X.",
  itens: [
    "Um post por rede escolhida",
    "Hashtags e melhor horário",
    "Imagem no formato da rede",
    "Rascunhos semanais para aprovar",
    "Pronto para copiar ou programar",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Briefing", apoio: "Empresa e novidade" },
  { titulo: "Posts", apoio: "Um por rede" },
  { titulo: "Publicar", apoio: "Copie, agende ou programe" },
];

function IconeEmpresa() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16M6 20V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v14M15 10h3a1 1 0 0 1 1 1v9" />
      <path d="M9 9h2M9 13h2M9 17h2" />
    </svg>
  );
}

function IconeFormato() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
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

/** Cartão de entrada com ícone circular e título. */
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes dos primeiros posts. */
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
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Ver posts de exemplo</button>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; dados: DadosPosts; exemplo: boolean }
  | { fase: "pronto"; resultado: ResultadoPosts; dados: DadosPosts; meta: Meta; id?: string; exemplo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [dados, setDados] = useState<DadosPosts>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [avisoRedes, setAvisoRedes] = useState("");
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
    setAvisoRedes("");
    setDados((d) => {
      const tem = d.redes.includes(r);
      return { ...d, redes: tem ? d.redes.filter((x) => x !== r) : [...d.redes, r] };
    });
  }

  /** Sessão expirada em qualquer chamada: volta para a tela de entrar e retorna para cá depois. */
  function sessaoExpirou(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  async function gerar(d: DadosPosts, exemplo = false) {
    if (!d.redes.length) {
      setAvisoRedes("Marque LinkedIn, Instagram ou X antes de gerar.");
      document.getElementById("redes")?.scrollIntoView({ block: "center" });
      return;
    }
    setAvisoRedes("");
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, dados: d, exemplo });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", resultado: resposta.resultado, dados: d, meta: resposta.meta, id: resposta.id, exemplo });
      carregarHistorico();
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, dados: d, exemplo });
    }
  }

  function tentarNovamente() {
    if (estado.fase === "erro") gerar(estado.dados, estado.exemplo);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados);
  }

  /** "Ver posts de exemplo" preenche E gera: quem quer ver o resultado não precisa de mais um clique. */
  function verExemplo() {
    setDados(EXEMPLO);
    gerar(EXEMPLO, true);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche, gera os posts e o cartaz local dos três (rápido e offline).
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : estado.fase === "carregando" ? 2 : 1;

  return (
    <>
      <Topbar marca="S" nome="Posts em Minutos" area="Marketing" status={status} erro={erro} resumo="Modo demonstração: os posts exibidos são exemplos." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeEmpresa />} titulo="O briefing">
              <Row>
                <Field label="Empresa ou marca" htmlFor="empresa">
                  <input id="empresa" className="input" required placeholder="Vetra Logística" value={dados.empresa} onChange={set("empresa")} />
                </Field>
                <Field label="Objetivo" htmlFor="objetivo">
                  <select id="objetivo" className="input" value={dados.objetivo} onChange={set("objetivo")}>
                    <option value="gerar leads">Gerar leads</option>
                    <option value="fortalecer marca">Fortalecer marca</option>
                    <option value="engajar comunidade">Engajar comunidade</option>
                    <option value="anunciar novidade">Anunciar novidade</option>
                  </select>
                </Field>
              </Row>
              <Field label="Tema ou novidade" htmlFor="tema">
                <textarea id="tema" className="input min-h-20 resize-y" required placeholder="Fatos, números e o que muda para o cliente. Ex.: lançamos o rastreamento em tempo real; as ligações de 'onde está minha carga' caíram 71%..." value={dados.tema} onChange={set("tema")} />
              </Field>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeFormato />} titulo="O formato">
              <Row>
                <Field label="Tom" htmlFor="tom">
                  <select id="tom" className="input" value={dados.tom} onChange={set("tom")}>
                    <option value="executivo">Executivo</option>
                    <option value="próximo">Próximo</option>
                    <option value="provocador">Provocador</option>
                    <option value="didático">Didático</option>
                  </select>
                </Field>
                <Field label="Redes" htmlFor="redes">
                  <div className="flex gap-[14px] flex-wrap items-center min-h-[46px]" id="redes">
                    {(Object.keys(REDES) as Rede[]).map((r) => (
                      <label key={r} className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-accent m-0" checked={dados.redes.includes(r)} onChange={() => toggleRede(r)} />
                        {REDES[r].nome}
                      </label>
                    ))}
                  </div>
                </Field>
              </Row>
              {avisoRedes && <div className="mb-4"><Aviso tom="danger">{avisoRedes}</Aviso></div>}
              <div className="[&>details]:mb-0">
                <MaisDetalhes>
                  <Field label="Público-alvo (opcional)" htmlFor="publico">
                    <input id="publico" className="input" placeholder="Ex.: gerentes de logística de indústrias médias" value={dados.publico} onChange={set("publico")} />
                  </Field>
                </MaisDetalhes>
              </div>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando posts" : "Gerar posts"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={verExemplo}>Ver posts de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="Os posts ficam salvos neste app até você apagar em 'Últimos resultados'." />

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

            <MaisDetalhes titulo="Aprovados e rascunhos da semana">
              <Aprovados />
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={verExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={tentarNovamente} />}
          {estado.fase === "pronto" && (
            <Resultado key={estado.id ?? "sem-id"} resultado={estado.resultado} dados={estado.dados} meta={estado.meta} id={estado.id} cartazesAutomaticos={estado.exemplo} publicacaoAtiva={Boolean(status?.integrations?.publicacao)} />
          )}
        </Stage>
      </main>
    </>
  );
}

/** Resultado completo (cabeçalho, origem, prévia por rede). `cartazesAutomaticos` gera o cartaz local dos posts
 * ao montar (prévia do ?exemplo=1, rápida e offline); `publicacaoAtiva` liga "Programar publicação" nos cartões. */
export function Resultado({ resultado, dados, meta, id, cartazesAutomaticos = false, publicacaoAtiva = false }: { resultado: ResultadoPosts; dados: DadosPosts; meta: Meta; id?: string; cartazesAutomaticos?: boolean; publicacaoAtiva?: boolean }) {
  const [posts, setPosts] = useState<Post[]>(resultado.posts || []);
  const imagens = useImagensPosts({ posts, empresa: dados.empresa, ideiaCentral: resultado.ideia_central });
  const cartazesPedidos = useRef(false);

  useEffect(() => {
    if (!cartazesAutomaticos || cartazesPedidos.current) return;
    cartazesPedidos.current = true;
    imagens.gerarTodas({ cartaz: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao montar o resultado de exemplo
  }, [cartazesAutomaticos]);

  const copiarTudo = () => posts.map((p) => `${REDES[p.rede]?.nome || p.rede}\n\n${textoDoPost(p)}`).join("\n\n----------\n\n");
  const titulo = `Posts de ${dados.empresa}`;

  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${posts.length} ${posts.length === 1 ? "rede" : "redes"}, objetivo: ${dados.objetivo}, tom ${dados.tom}`}>
        <button type="button" className="btn-ghost" onClick={() => imagens.gerarTodas()} disabled={imagens.algumaGerando}>
          {imagens.algumaGerando ? "Gerando imagens..." : `Gerar imagens dos ${posts.length} posts`}
        </button>
        <Entregar id={id} titulo={titulo} texto={copiarTudo} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoPosts
        posts={posts}
        empresa={dados.empresa}
        ideiaCentral={resultado.ideia_central}
        imagens={imagens}
        publicacaoAtiva={publicacaoAtiva}
        onTextoAtualizado={(i, texto) => setPosts((ps) => ps.map((p, idx) => (idx === i ? { ...p, texto } : p)))}
      />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Ideia central + prévia por rede (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoPosts({
  posts,
  empresa,
  ideiaCentral,
  imagens,
  publicacaoAtiva,
  onTextoAtualizado,
}: {
  posts: Post[];
  empresa: string;
  ideiaCentral: string;
  imagens: EstadoImagens;
  publicacaoAtiva?: boolean;
  onTextoAtualizado: (i: number, texto: string) => void;
}) {
  return (
    <>
      <p className="summary">{ideiaCentral}</p>

      <div className="mb-8">
        <h2 className="section-title">Prévia por rede</h2>
        <GradePosts posts={posts} empresa={empresa} estado={imagens} onTextoAtualizado={onTextoAtualizado} publicacaoAtiva={publicacaoAtiva} />
      </div>
    </>
  );
}
