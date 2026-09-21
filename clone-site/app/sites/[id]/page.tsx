"use client";
// Workspace do site: nome, estado e link à esquerda do cabeçalho; prévia da versão selecionada à esquerda e os
// painéis (agente, versões, imagens, métricas, domínio) à direita — empilhados no celular. Por estado:
// rascunho → gerar/editar o pedido; gerando → acompanhar (consulta a cada 5 s); falhou → motivo e tentar de novo;
// pronto → o workspace completo. Publicar é explícito: a prévia da última versão pode diferir do que está no ar.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Aviso, ErrorBox, Loading, Origem, lerErro } from "@/components/ui";
import { EditorPagina } from "@/components/EditorPagina";
import { ChipEstado, INTERVALO_ACOMPANHAMENTO_MS, TempoGerando } from "@/components/MeusSites";
import { PainelImagens } from "@/components/PainelImagens";
import { PreviaPagina } from "@/components/PreviaPagina";
import { rotuloFormato } from "@/components/ResultadoPagina";
import { TopbarSite } from "@/components/TopbarSite";
import { FaixaPublicacao, LinkPublico, NomeEditavel, PainelVersoes, type AoAtualizar } from "@/components/Workspace";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { data } from "@/lib/formato";
import type { Pagina, Projeto } from "@/lib/types";

type Detalhe = { projeto: Projeto; pagina: Pagina | null; meta: Meta | null };

const ETAPAS_CARREGANDO = ["Lendo a referência...", "Reconhecendo a estrutura da página...", "Escrevendo o código com a sua marca...", "Conferindo o arquivo gerado..."];

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [selecionada, setSelecionada] = useState<number | null>(null);
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
    const t = setInterval(carregar, INTERVALO_ACOMPANHAMENTO_MS);
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
      setDetalhe((d) => (d ? { ...d, projeto: corpo.projeto } : d));
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!detalhe) return;
    if (!window.confirm(`Apagar o site «${detalhe.projeto.nome}»? O link público, as versões e as imagens deixam de existir. Essa ação não pode ser desfeita.`)) return;
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

  const p = detalhe?.projeto;
  const pagina = detalhe?.pagina ?? null;
  const ultima = pagina ? pagina.versoes[pagina.versoes.length - 1] : null;
  const versaoSelecionada = pagina && ultima ? (pagina.versoes.find((v) => v.n === selecionada) ?? ultima) : null;

  return (
    <>
      <TopbarSite />
      <main className="max-w-[1400px] mx-auto px-8 pt-6 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <p className="mb-3 text-[13px]"><Link href="/" className="btn-link">Meus sites</Link></p>
        {!detalhe && !erro && <p className="text-muted text-sm" role="status">Carregando o site...</p>}
        {erro && !detalhe && <Aviso tom="danger">{erro}</Aviso>}

        {p && (
          <>
            <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <NomeEditavel projeto={p} aoAtualizar={aoAtualizar} />
                  <ChipEstado estado={p.estado} />
                </div>
                <p className="text-muted text-[13px] mt-1">
                  {p.marca?.nome ? `${p.marca.nome} · ` : ""}{p.origem === "briefing" ? "criado pelo briefing" : "clonado da referência"} em {data(p.criadoEm, { comHora: true })}
                </p>
              </div>
              <button type="button" className="btn-link !text-muted text-[13px] shrink-0" disabled={ocupado} onClick={apagar}>Apagar site</button>
            </header>

            {erro && <div className="mb-4"><Aviso tom="danger">{erro}</Aviso></div>}

            {p.estado === "rascunho" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 [&>*]:min-w-0">
                <div className="card p-6 flex flex-col gap-3 self-start">
                  <p className="text-ink-2">Este site ainda não foi gerado. Confira o pedido e as imagens; depois, gere.</p>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className="btn-primary !w-auto" disabled={ocupado} onClick={gerar}>{ocupado ? "Enviando..." : "Gerar o site"}</button>
                    <Link href={`/?site=${p.id}`} className="btn-ghost">Editar o pedido</Link>
                  </div>
                </div>
                <aside className="flex flex-col gap-4"><PainelImagens projetoId={p.id} /></aside>
              </div>
            )}

            {p.estado === "gerando" && (
              <div className="card p-6 flex flex-col gap-3 max-w-[760px]">
                <Loading etapas={ETAPAS_CARREGANDO} />
                <p className="text-muted text-[13px]"><TempoGerando desde={p.atualizadoEm} /> · Você pode fechar esta tela ou ir para outra parte do app: avisamos no sino quando terminar.</p>
              </div>
            )}

            {p.estado === "falhou" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 [&>*]:min-w-0">
                <div className="flex flex-col gap-3 self-start">
                  <ErrorBox
                    mensagem={p.erro?.mensagem ?? "Não foi possível gerar o site desta vez."}
                    codigo={p.erro?.codigo as CodigoErroIA | undefined}
                    acao={p.erro?.acao}
                    onTentarNovamente={ocupado ? undefined : gerar}
                  />
                  <div><Link href={`/?site=${p.id}`} className="btn-ghost">Editar o pedido</Link></div>
                </div>
                <aside className="flex flex-col gap-4"><PainelImagens projetoId={p.id} /></aside>
              </div>
            )}

            {p.estado === "pronto" && pagina && ultima && versaoSelecionada && detalhe?.meta && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 [&>*]:min-w-0">
                <div className="flex flex-col gap-4">
                  <FaixaPublicacao projeto={p} pagina={pagina} selecionada={versaoSelecionada.n} aoAtualizar={aoAtualizar} />
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">{pagina.titulo}</h2>
                    <span className="text-muted text-[13px]">Versão {versaoSelecionada.n} · {rotuloFormato(versaoSelecionada.html)}</span>
                  </div>
                  <Origem meta={detalhe.meta} demoTexto="Exemplo ilustrativo, sem usar inteligência artificial." />
                  <PreviaPagina key={versaoSelecionada.n} html={versaoSelecionada.html} titulo={pagina.titulo} />
                  {/* Até o agente chegar (US-007), as edições por instrução continuam aqui. */}
                  <EditorPagina pagina={pagina} demo={detalhe.meta.demo} onAtualizada={(nova) => { aoAtualizar({ pagina: nova }); setSelecionada(nova.versoes[nova.versoes.length - 1].n); }} />
                </div>
                <aside className="flex flex-col gap-4">
                  <LinkPublico projeto={p} aoAtualizar={aoAtualizar} />
                  <PainelVersoes projeto={p} pagina={pagina} selecionada={versaoSelecionada.n} aoSelecionar={setSelecionada} aoAtualizar={aoAtualizar} />
                  <PainelImagens projetoId={p.id} />
                </aside>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
