"use client";
// Tela de Relatórios: "a IA está resolvendo, e quanto?" respondido com quatro números, um gráfico por
// dia, os assuntos mais falados e as conversas que ainda esperam uma pessoa.
//
// Todos os números vêm de `GET /api/metricas?periodo=` (lib/metricas.ts é a fonte única; as definições
// de cada um estão no topo daquele arquivo). Esta tela não calcula nenhum deles — ela só escolhe o
// período, e o período escolhido mora na barra de endereço (`?periodo=`), no mesmo padrão
// `history.pushState` + `popstate` de Conversas e do Assistente: recarregar, voltar no navegador ou
// mandar o endereço para alguém cai no mesmo relatório.
//
// O conteúdo fica neste componente, e não em `app/relatorios/page.tsx`, porque é `components/*.tsx`
// que `scripts/verificar-jargao.mjs` varre (ver CLAUDE.md).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "./ContatoVisual";
import { MenuExportar, RelatorioDiario } from "./ExportarRelatorio";
import { GraficoLinhas } from "./GraficoLinhas";
import { Indicadores, numerosEmTexto } from "./Indicadores";
import { Aviso, ErrorBox, lerErro, Topbar, useStatus, type ErroLido } from "./ui";
import { ASSUNTO_OUTROS } from "@/lib/assuntos";
import { ACAO_CONECTAR_NUMERO, AVISO_CONVERSAS_EXEMPLO, soConversasDeExemplo } from "@/lib/demo";
import { numero as formatarNumero } from "@/lib/formato";
import { navegacaoComContador } from "@/lib/navegacao";
import { contextoComparacao, horaOuDia, lerPeriodoMetricas, PERIODOS_METRICAS, PERIODO_PADRAO, rotuloContato, rotuloPeriodo } from "@/lib/rotulos";
import type { AssuntoMetricas, Conversa, Metricas, PeriodoMetricas } from "@/lib/types";

/** Quantas barras o cartão "Principais assuntos" desenha, contando a de "Outros". */
const MAXIMO_ASSUNTOS = 5;

/** Quantas conversas esperando uma pessoa cabem no cartão antes do link "Ver todas". */
const MAXIMO_ATENCAO = 5;

/** O rótulo das conversas ainda sem assunto; o mesmo que lib/metricas.ts já devolve. */
const OUTROS = ASSUNTO_OUTROS;

function conversaLink(numeroDaConversa: string): string {
  return `/conversas?numero=${encodeURIComponent(numeroDaConversa)}`;
}

/**
 * Os assuntos como as barras os mostram: os mais falados primeiro e, quando não cabem todos, o resto
 * somado numa barra "Outros" no fim. As conversas que ainda não têm assunto já chegam como "Outros"
 * de `lib/metricas.ts`, e entram na mesma soma — duas barras com o mesmo nome confundiriam.
 */
function principaisAssuntos(assuntos: AssuntoMetricas[]): AssuntoMetricas[] {
  const nomeados = assuntos.filter((a) => a.assunto !== OUTROS).sort((a, b) => b.total - a.total);
  const semAssunto = assuntos.filter((a) => a.assunto === OUTROS).reduce((soma, a) => soma + a.total, 0);
  const vaiSobrar = semAssunto > 0 || nomeados.length > MAXIMO_ASSUNTOS;
  const cabem = vaiSobrar ? MAXIMO_ASSUNTOS - 1 : MAXIMO_ASSUNTOS;
  const topo = nomeados.slice(0, cabem);
  const sobra = semAssunto + nomeados.slice(cabem).reduce((soma, a) => soma + a.total, 0);
  return sobra > 0 ? [...topo, { assunto: OUTROS, total: sobra }] : topo;
}

/**
 * O que o "Copiar resumo" cola: os quatro números do período e os assuntos, exatamente como a tela
 * mostra (os mesmos rótulos dos indicadores e as mesmas cinco barras).
 */
function resumoEmTexto(metricas: Metricas | null, periodo: PeriodoMetricas): string {
  if (!metricas) return "";
  const assuntos = principaisAssuntos(metricas.assuntos);
  const linhas = [`Desempenho do seu atendente — ${rotuloPeriodo(periodo)}`, "", ...numerosEmTexto(metricas)];
  if (assuntos.length > 0 && !assuntos.every((a) => a.assunto === OUTROS)) {
    linhas.push("", "Principais assuntos", ...assuntos.map((a) => `${a.assunto}: ${formatarNumero(a.total)}`));
  }
  return linhas.join("\n");
}

/** Uma barra horizontal por assunto, em CSS: o rótulo e o total em cima, a barra embaixo. */
function BarrasDeAssunto({ assuntos }: { assuntos: AssuntoMetricas[] }) {
  const maior = Math.max(...assuntos.map((a) => a.total), 1);
  return (
    <ul className="flex flex-col gap-3.5">
      {assuntos.map((a) => (
        <li key={a.assunto}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-[14px] font-semibold min-w-0 truncate">{a.assunto}</span>
            <span className="text-[13px] text-muted shrink-0">{formatarNumero(a.total)}</span>
          </div>
          <div className="h-2 rounded-full bg-accent-soft overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((a.total / maior) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Até cinco conversas paradas esperando uma pessoa; não é filtrado pelo período (ver lib/metricas.ts). */
function ListaDeAtencao({ conversas }: { conversas: Conversa[] }) {
  if (conversas.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-[13px] text-muted">
        <p className="text-ink font-bold mb-1">Nenhuma conversa aguardando</p>
        <p>A IA está dando conta.</p>
      </div>
    );
  }
  return (
    <ul className="[&>li:last-child>a]:border-b-0">
      {conversas.slice(0, MAXIMO_ATENCAO).map((c) => (
        <li key={c.numero}>
          <Link
            href={conversaLink(c.numero)}
            className="flex items-start gap-3 px-5 py-3.5 border-b border-line transition-colors hover:bg-bg"
          >
            <Avatar nome={c.nome} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <strong className="min-w-0 flex-1 truncate text-[14.5px]">{rotuloContato(c.numero, c.nome)}</strong>
                <span className="shrink-0 text-[12px] text-muted">{horaOuDia(c.atualizado_em)}</span>
              </span>
              <span className="block truncate text-[13px] text-ink-2 mt-0.5">
                {(c.ultima_mensagem || "").split("\n")[0] || "Sem mensagem ainda"}
              </span>
              <span className="inline-block chip-media mt-1.5">Aguardando</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Relatorios() {
  const { status, erro } = useStatus();

  const [pronto, setPronto] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodoMetricas>(PERIODO_PADRAO);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [erroNumeros, setErroNumeros] = useState<ErroLido | null>(null);

  /** O endereço é a fonte da verdade do período: a escolha passa por aqui antes de virar estado. */
  function irPara(novo: PeriodoMetricas) {
    const params = new URLSearchParams(location.search);
    params.set("periodo", novo);
    history.pushState(null, "", `${location.pathname}?${params}`);
    setPeriodo(novo);
  }

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/metricas?periodo=${periodo}`);
      if (!r.ok) throw r;
      setMetricas(await r.json());
      setErroNumeros(null);
    } catch (e) {
      setErroNumeros(await lerErro(e));
    }
  }, [periodo]);

  // Abertura da tela: o que vale é o que está na barra de endereço. A carga inicial sai do corpo do
  // efeito por um setTimeout(0), mesmo padrão de components/setup.tsx (regra set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(() => {
      setPeriodo(lerPeriodoMetricas(new URLSearchParams(location.search).get("periodo")));
      setPronto(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Voltar/avançar do navegador: o período vem do endereço, nunca só do estado local.
  useEffect(() => {
    function aoNavegar() {
      setPeriodo(lerPeriodoMetricas(new URLSearchParams(location.search).get("periodo")));
    }
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [pronto, carregar]);

  // A lista serve só para saber se o que está na tela é a demonstração: os números do relatório não
  // saem dela. Uma falha aqui não tira o aviso de lugar nenhum — ela só deixa de mostrá-lo.
  useEffect(() => {
    if (!pronto) return;
    fetch("/api/conversas?periodo=tudo").then((r) => r.json()).then((d) => setConversas(d.itens ?? [])).catch(() => setConversas([]));
  }, [pronto]);

  const atencao = metricas?.atencao ?? [];
  const assuntos = principaisAssuntos(metricas?.assuntos ?? []);
  const semClassificacao = assuntos.length === 0 || assuntos.every((a) => a.assunto === OUTROS);

  return (
    <>
      <Topbar
        marca="W"
        nome="Atendente no WhatsApp"
        area="Atendimento e Vendas"
        status={status}
        erro={erro}
        usuario={status?.usuario}
        navegacao={navegacaoComContador(atencao.length)}
      />

      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-end justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 mb-6">
          <div className="min-w-0">
            <p className="sobretitulo mb-1">Relatórios</p>
            <h1 className="titulo-painel mb-1.5">Desempenho do seu atendente</h1>
            <p className="apoio">Acompanhe como seu atendente está atendendo e resolvendo dúvidas.</p>
          </div>
          <div className="shrink-0 flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
            <label className="sr-only" htmlFor="periodo-relatorios">Período</label>
            <select
              id="periodo-relatorios"
              className="input !w-auto max-md:!w-full !py-2.5 text-[14px]"
              value={periodo}
              onChange={(e) => irPara(lerPeriodoMetricas(e.target.value))}
            >
              {PERIODOS_METRICAS.map((p) => (
                <option key={p} value={p}>{rotuloPeriodo(p)}</option>
              ))}
            </select>
            {/* Só depois que os números chegam: exportar uma tela ainda em branco não levaria nada. */}
            {metricas && <MenuExportar periodo={periodo} resumo={() => resumoEmTexto(metricas, periodo)} />}
          </div>
        </div>

        {erroNumeros && (
          <div className="mb-4">
            <ErrorBox mensagem={erroNumeros.mensagem} acao={erroNumeros.acao} onTentarNovamente={carregar} />
          </div>
        )}

        {soConversasDeExemplo(conversas ?? []) && (
          <div className="mb-4">
            <Aviso acao={ACAO_CONECTAR_NUMERO}>{AVISO_CONVERSAS_EXEMPLO}</Aviso>
          </div>
        )}

        <div className="mb-6">
          <Indicadores metricas={metricas} contexto={contextoComparacao(periodo)} />
        </div>

        <div className="grid gap-5 items-start grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
          <section className="card px-5 py-[18px] min-w-0" aria-label="Conversas ao longo do tempo">
            <h2 className="section-title">Conversas ao longo do tempo</h2>
            {metricas === null ? (
              <span className="skeleton block !h-[250px] max-md:!h-[200px] w-full" aria-hidden="true" />
            ) : (
              <GraficoLinhas dias={metricas.porDia} />
            )}
          </section>

          <section className="card px-5 py-[18px]" aria-label="Principais assuntos">
            <h2 className="section-title">Principais assuntos</h2>
            {metricas === null ? (
              <div aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="skeleton block w-full mt-4 first:mt-0" />
                ))}
              </div>
            ) : semClassificacao ? (
              <div className="py-6 text-center text-[13px] text-muted">
                <p className="text-ink font-bold mb-1">Sem classificação ainda</p>
                <p>Quando o atendente separar as conversas por assunto, os mais falados aparecem aqui.</p>
              </div>
            ) : (
              <BarrasDeAssunto assuntos={assuntos} />
            )}
          </section>

          <section className="card overflow-hidden min-[1100px]:col-span-2" aria-label="Conversas que precisam de atenção">
            <div className="flex items-baseline justify-between gap-4 px-5 pt-[18px] pb-3">
              <h2 className="section-title !mb-0">Conversas que precisam de atenção</h2>
              <Link href="/conversas?aba=atencao" className="btn-link text-[13px]">Ver todas</Link>
            </div>
            {metricas === null ? (
              <div className="px-5 pb-5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton block w-full mt-3 first:mt-0" />
                ))}
              </div>
            ) : (
              <ListaDeAtencao conversas={atencao} />
            )}
          </section>

          <div className="min-[1100px]:col-span-2">
            <RelatorioDiario />
          </div>
        </div>
      </main>
    </>
  );
}
