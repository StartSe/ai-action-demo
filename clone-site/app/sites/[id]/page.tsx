"use client";
// Workspace do site, centrado na prévia. Por estado:
//  gerando → acompanhamento etapa a etapa com a prévia parcial (components/ProgressoGeracao.tsx), consulta a cada 2,5 s;
//  falhou  → motivo, as etapas até a falha e "Tentar de novo"; rascunho → gerar/editar o pedido;
//  pronto  → abas Prévia · Versões · Imagens · Marca · Métricas · Publicação, com a prévia em largura total e o agente
//            numa bolha flutuante (components/ChatAgente.tsx): enquanto ele trabalha, a prévia mostra o rascunho ao vivo.
// Publicar é explícito: a prévia da última versão pode diferir do que está no ar.
import Link from "next/link";
import { EditorTelaCheia } from "@/components/EditorTelaCheia";
import { MateriaisProjeto } from "@/components/MateriaisProjeto";
import { HistoricoPublicacoes } from "@/components/HistoricoPublicacoes";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BolhaAgente, ChatAgente } from "@/components/ChatAgente";
import { Icone } from "@/components/Icones";
import { ChipEstado, TempoGerando, inicioDaGeracao } from "@/components/MeusSites";
import { PainelDominio } from "@/components/PainelDominio";
import { PainelImagens } from "@/components/PainelImagens";
import { PainelMarca } from "@/components/PainelMarca";
import { PainelMetricas } from "@/components/PainelMetricas";
import { PainelRender } from "@/components/PainelRender";
import { PainelNetlify } from "@/components/PainelNetlify";
import { PreviaPagina } from "@/components/PreviaPagina";
import { ListaEtapas, ProgressoGeracao } from "@/components/ProgressoGeracao";
import { rotuloFormato } from "@/components/ResultadoPagina";
import { TopbarSite } from "@/components/TopbarSite";
import { Aviso, ErrorBox, MaisDetalhes, Origem, lerErro } from "@/components/ui";
import { FaixaPublicacao, LinkPublico, NomeEditavel, PainelVersoes, type AoAtualizar } from "@/components/Workspace";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { data } from "@/lib/formato";
import type { Pagina, Projeto } from "@/lib/types";

type Detalhe = { projeto: Projeto; pagina: Pagina | null; meta: Meta | null; htmlParcial: string | null };
type Aba = "materiais" | "previa" | "versoes" | "imagens" | "marca" | "metricas" | "publicacao";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "previa", rotulo: "Prévia" },
  { valor: "versoes", rotulo: "Versões" },
  { valor: "imagens", rotulo: "Imagens" },
  { valor: "marca", rotulo: "Marca" },
  { valor: "materiais", rotulo: "Materiais" },
  { valor: "metricas", rotulo: "Métricas" },
  { valor: "publicacao", rotulo: "Publicação" },
];

const INTERVALO_GERANDO_MS = 2500;
const ROTULO_ORIGEM = { referencia: "clonado da captura", endereco: "clonado do endereço", briefing: "criado pela descrição" } as const;

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const parametros = useSearchParams();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editorAberto, setEditorAberto] = useState(false);
  const [selecionada, setSelecionada] = useState<number | null>(null);
  // Atalhos de URL: ?aba=<nome> abre numa aba; ?agente=1 abre o agente (demonstrações e capturas).
  const [aba, setAba] = useState<Aba>(() => (ABAS.some((a) => a.valor === parametros.get("aba")) ? (parametros.get("aba") as Aba) : "previa"));
  const [chatAberto, setChatAberto] = useState(() => parametros.get("agente") === "1");
  const [trabalhando, setTrabalhando] = useState(false);
  // O rascunho que o agente está editando agora (prévia ao vivo); null fora de um pedido.
  const [htmlAoVivo, setHtmlAoVivo] = useState<string | null>(null);
  // Instrução vinda de "Aplicar" numa sugestão ou da marca: vai para o chat do agente.
  const [pedidoExterno, setPedidoExterno] = useState<{ texto: string; chave: number } | null>(null);
  const gerando = detalhe?.projeto.estado === "gerando";

  useEffect(() => {
    let ativo = true;
    const carregar = () =>
      fetch(`/api/sites/${id}`)
        .then(async (r) => {
          if (r.status === 401) { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return null; }
          if (!r.ok) throw new Error((await lerErro(r)).mensagem);
          return r.json() as Promise<Detalhe>;
        })
        .then((d) => { if (ativo && d) { setDetalhe(d); setErro(null); } })
        .catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    carregar();
    if (!gerando) return () => { ativo = false; };
    const t = setInterval(carregar, INTERVALO_GERANDO_MS);
    return () => { ativo = false; clearInterval(t); };
  }, [id, gerando, router]);

  // A pessoa abriu o site: o aviso do sino deixa de contar (só quando já terminou).
  const terminou = detalhe?.projeto.estado === "pronto" || detalhe?.projeto.estado === "falhou";
  useEffect(() => {
    if (terminou) fetch(`/api/sites/${id}/visto`, { method: "POST" }).catch(() => {});
  }, [id, terminou]);

  const aoAtualizar: AoAtualizar = ({ projeto, pagina }) => {
    setDetalhe((d) => (d ? { ...d, ...(projeto ? { projeto } : {}), ...(pagina ? { pagina } : {}) } : d));
  };

  async function gerar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sites/${id}/gerar`, { method: "POST" });
      if (!r.ok && r.status !== 409) { setErro((await lerErro(r)).mensagem); return; }
      const corpo = await r.json();
      setDetalhe((d) => (d ? { ...d, projeto: corpo.projeto, htmlParcial: null } : d));
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!detalhe) return;
    if (!window.confirm(`Apagar o site «${detalhe.projeto.nome}»? O link público, as versões e as imagens deixam de existir. Essa ação não pode ser desfeita.${detalhe.projeto.render || detalhe.projeto.netlify ? " Publicações externas continuam ativas: remova-as no painel do Render ou da Netlify." : ""}`)) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/sites/${id}`, { method: "DELETE" });
      if (!r.ok) { setErro((await lerErro(r)).mensagem); return; }
      router.push("/");
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  function pedirAoAgente(texto: string) {
    setChatAberto(true);
    setAba("previa");
    setPedidoExterno({ texto, chave: Date.now() });
  }

  const p = detalhe?.projeto;
  const pagina = detalhe?.pagina ?? null;
  const ultima = pagina ? pagina.versoes[pagina.versoes.length - 1] : null;
  const versaoSelecionada = pagina && ultima ? (pagina.versoes.find((v) => v.n === selecionada) ?? ultima) : null;
  const semCaptura = !parametros.get("captura");

  return (
    <>
      <TopbarSite />
      <main className="max-w-[1400px] mx-auto px-8 pt-6 pb-24 max-md:px-4 max-md:pt-5 max-md:pb-28">
        <p className="mb-3 text-[13px]"><Link href="/" className="btn-link inline-flex items-center gap-1"><Icone nome="seta" tamanho={13} className="rotate-180" />Meus sites</Link></p>
        {!detalhe && !erro && <p className="text-muted text-sm" role="status">Carregando o site...</p>}
        {erro && !detalhe && <Aviso tom="danger">{erro}</Aviso>}

        {p && (
          <>
            <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <NomeEditavel projeto={p} aoAtualizar={aoAtualizar} />
                  <ChipEstado estado={p.estado} publicado={Boolean(p.versaoPublicada || p.render?.versao || p.netlify?.versao)} />
                  {trabalhando && <span className="faixa-ao-vivo">Editando ao vivo</span>}
                </div>
                <p className="text-muted text-[13px] mt-1">
                  {p.marca?.nome ? `${p.marca.nome} · ` : ""}{ROTULO_ORIGEM[p.origem]} em {data(p.criadoEm, { comHora: true })}
                  {p.estado === "gerando" && <> · gerando <TempoGerando desde={inicioDaGeracao(p)} /></>}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap shrink-0">
                {(p.versaoPublicada || p.render?.versao || p.netlify?.versao) && <a href={p.render?.versao ? p.render.url : p.netlify?.versao ? p.netlify.url : `/s/${p.slug}`} target="_blank" rel="noopener noreferrer" className="btn-compacto">Ver no ar<Icone nome="externo" tamanho={14} /></a>}
                <button type="button" className="btn-link !text-muted text-[13px]" disabled={ocupado} onClick={apagar}>Apagar site</button>
              </div>
            </header>

            {erro && <div className="mb-4"><Aviso tom="danger">{erro}</Aviso></div>}

            {p.estado === "rascunho" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 [&>*]:min-w-0">
                <div className="card p-6 flex flex-col gap-3 self-start">
                  <p className="text-ink-2">Este site ainda não foi gerado. Se quiser, envie o logo e as imagens ao lado; depois, gere.</p>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className="btn-primary !w-auto" disabled={ocupado} onClick={gerar}>{ocupado ? "Enviando..." : "Gerar o site"}</button>
                    <Link href={`/?site=${p.id}`} className="btn-ghost">Editar o pedido</Link>
                  </div>
                </div>
                <aside className="flex flex-col gap-4"><PainelImagens projetoId={p.id} /></aside>
              </div>
            )}

            {p.estado === "gerando" && <ProgressoGeracao projeto={p} htmlParcial={detalhe?.htmlParcial ?? null} />}

            {p.estado === "falhou" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 [&>*]:min-w-0">
                <div className="flex flex-col gap-4 self-start">
                  <ErrorBox
                    mensagem={p.erro?.mensagem ?? "Não foi possível gerar o site desta vez."}
                    codigo={p.erro?.codigo as CodigoErroIA | undefined}
                    acao={p.erro?.acao}
                    onTentarNovamente={ocupado ? undefined : gerar}
                  />
                  <div><Link href={`/?site=${p.id}`} className="btn-ghost">Editar o pedido</Link></div>
                  {p.progresso?.etapas?.length ? (
                    <div className="card p-4 flex flex-col gap-2">
                      <h2 className="font-bold text-[14px]">Até onde chegou</h2>
                      <ListaEtapas etapas={p.progresso.etapas} />
                    </div>
                  ) : null}
                </div>
                <aside className="flex flex-col gap-4"><PainelImagens projetoId={p.id} /></aside>
              </div>
            )}

            {p.estado === "pronto" && pagina && ultima && versaoSelecionada && detalhe?.meta && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div role="tablist" aria-label="Partes do site" className="abas-workspace">
                    {ABAS.map((a) => (
                      <button key={a.valor} type="button" role="tab" aria-selected={aba === a.valor} onClick={() => setAba(a.valor)}>{a.rotulo}</button>
                    ))}
                  </div>
                  <span className="text-muted text-[13px]">Versão {versaoSelecionada.n} de {ultima.n} · {rotuloFormato(versaoSelecionada.html)}</span>
                </div>

                {aba === "previa" && (
                  <div className="flex flex-col gap-4">
                    <FaixaPublicacao projeto={p} pagina={pagina} selecionada={versaoSelecionada.n} aoAtualizar={aoAtualizar} />
                    <div><button className="btn-compacto-primario" disabled={trabalhando} onClick={() => setEditorAberto(true)}>Editar página em tela cheia</button></div>
                    <Origem meta={detalhe.meta} demoTexto="Exemplo ilustrativo, sem usar inteligência artificial." />
                    <PreviaPagina aoAmpliar={() => setEditorAberto(true)} key={htmlAoVivo ? "ao-vivo" : versaoSelecionada.n} html={htmlAoVivo ?? versaoSelecionada.html} titulo={htmlAoVivo ? `${pagina.titulo} (rascunho ao vivo)` : pagina.titulo} alturaComputador={760} />
                    {p.progresso?.etapas?.length ? (
                      <MaisDetalhes titulo="Como este site foi construído">
                        <ListaEtapas etapas={p.progresso.etapas} compacta />
                      </MaisDetalhes>
                    ) : null}
                  </div>
                )}

                {aba === "versoes" && (
                  <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-6 [&>*]:min-w-0">
                    <PainelVersoes projeto={p} pagina={pagina} selecionada={versaoSelecionada.n} aoSelecionar={(n) => { setSelecionada(n); }} aoAtualizar={aoAtualizar} />
                    <div className="flex flex-col gap-4">
                      <FaixaPublicacao projeto={p} pagina={pagina} selecionada={versaoSelecionada.n} aoAtualizar={aoAtualizar} />
                      <PreviaPagina aoAmpliar={() => setEditorAberto(true)} key={versaoSelecionada.n} html={versaoSelecionada.html} titulo={`${pagina.titulo} · versão ${versaoSelecionada.n}`} alturaComputador={640} />
                    </div>
                  </div>
                )}

                {aba === "imagens" && (
                  <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] gap-6 [&>*]:min-w-0">
                    <PainelImagens projetoId={p.id} />
                    <div className="card p-5 self-start text-[13.5px] text-ink-2 flex flex-col gap-2">
                      <h3 className="font-bold text-ink text-[14px]">Como usar as imagens</h3>
                      <p>Depois de enviar, peça ao agente: &ldquo;coloque o logo no topo&rdquo;, &ldquo;use a foto da fachada no herói&rdquo;. Ele troca os blocos coloridos pelas imagens e a prévia muda ao vivo.</p>
                      <div><button type="button" className="btn-compacto" onClick={() => pedirAoAgente("Coloque o logo da empresa no cabeçalho e no rodapé, no lugar do bloco do logotipo.")}>Pedir para colocar o logo</button></div>
                    </div>
                  </div>
                )}

                {aba === "marca" && (
                  <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] gap-6 [&>*]:min-w-0">
                    <PainelMarca projeto={p} aoAtualizar={(novo) => aoAtualizar({ projeto: novo })} aoAplicar={pedirAoAgente} />
                    <PreviaPagina aoAmpliar={() => setEditorAberto(true)} key={`marca-${versaoSelecionada.n}`} html={htmlAoVivo ?? versaoSelecionada.html} titulo={pagina.titulo} alturaComputador={560} />
                  </div>
                )}

                {aba === "materiais" && <MateriaisProjeto projetoId={p.id} aoAplicar={pedirAoAgente} />}

                {aba === "metricas" && (
                  <div className="max-w-[720px]">
                    <PainelMetricas projetoId={p.id} publicado={Boolean(p.versaoPublicada)} versaoAtual={ultima.n} aoAplicar={pedirAoAgente} />
                  </div>
                )}

                {aba === "publicacao" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [&>*]:min-w-0 max-w-[1100px]">
                    <LinkPublico projeto={p} aoAtualizar={aoAtualizar} />
                    <PainelRender projeto={p} versao={pagina.versoes.at(-1)!.n} aoAtualizar={(novo) => aoAtualizar({ projeto: novo })} />
                    <PainelNetlify projeto={p} aoAtualizar={(novo) => aoAtualizar({ projeto: novo })} />
                    <div className="lg:col-span-2"><HistoricoPublicacoes projeto={p} aoAtualizar={(novo) => aoAtualizar({ projeto: novo })} aoVer={(n) => { setSelecionada(n); setAba("versoes"); }} /></div>
                    <div className="lg:col-span-2"><PainelDominio projeto={p} aoAtualizar={(novo) => aoAtualizar({ projeto: novo })} /></div>
                  </div>
                )}

                {editorAberto ? <EditorTelaCheia htmlAoVivo={htmlAoVivo} trabalhando={trabalhando} projetoId={p.id} versao={versaoSelecionada} ultimaVersao={ultima.n} titulo={pagina.titulo} aoSalvar={(nova) => { aoAtualizar({ pagina: nova }); setSelecionada(nova.versoes.at(-1)!.n); }} aoFechar={() => setEditorAberto(false)}>
                <BolhaAgente aberto={chatAberto} trabalhando={trabalhando} onClick={() => setChatAberto(true)} />
                <ChatAgente
                  projetoId={p.id}
                  demo={detalhe.meta.demo}
                  aberto={chatAberto}
                  aoFechar={() => setChatAberto(false)}
                  pedidoExterno={pedidoExterno}
                  aoResponder={({ pagina: nova, projeto: novo }) => aoAtualizar({ pagina: nova, projeto: novo })}
                  aoSelecionarVersao={(n) => { setSelecionada(n); if (semCaptura) setAba("previa"); }}
                  aoPrevia={setHtmlAoVivo}
                  aoTrabalhando={setTrabalhando}
                />
                </EditorTelaCheia> : <>
                <BolhaAgente aberto={chatAberto} trabalhando={trabalhando} onClick={() => setChatAberto(true)} />
                <ChatAgente
                  projetoId={p.id}
                  demo={detalhe.meta.demo}
                  aberto={chatAberto}
                  aoFechar={() => setChatAberto(false)}
                  pedidoExterno={pedidoExterno}
                  aoResponder={({ pagina: nova, projeto: novo }) => aoAtualizar({ pagina: nova, projeto: novo })}
                  aoSelecionarVersao={(n) => { setSelecionada(n); if (semCaptura) setAba("previa"); }}
                  aoPrevia={setHtmlAoVivo}
                  aoTrabalhando={setTrabalhando}
                />
                </>}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
