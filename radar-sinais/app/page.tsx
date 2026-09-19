import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/ui";
import { Grafo } from "@/components/Grafo";
import { listarPorTipo } from "@/lib/historico";
import { lerPesquisa } from "@/lib/pesquisa-store";
import { COLETORES } from "@/lib/pesquisa";
import { getConfig } from "@/lib/store";
import { radarDemo } from "@/lib/demo";
import { aiEnabled, modelName, type Meta } from "@/lib/ai";
import type { DadosRadar, Radar } from "@/lib/types";
import { data } from "@/lib/formato";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  if (params.exemplo || params.temas) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string") query.set(k, v);
    redirect(`/radar?${query}`);
  }
  const pesquisa = lerPesquisa();
  const historico = listarPorTipo<DadosRadar, Radar, Meta>("radar", 30);
  const ultimo = historico.find(h => !h.meta.demo);
  const radar = ultimo?.saida || radarDemo(30);
  const demo = !ultimo;
  const coletores = COLETORES.filter(p => pesquisa.provedores.includes(p.id) && (!p.chave || getConfig(p.chave)));
  const evidencias = new Set(radar.sinais.flatMap(s => s.fontes.map(f => f.url))).size;
  return <><Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={{ ai: aiEnabled(), demo: !aiEnabled(), model: modelName() }} />
    <main className="max-w-[1400px] mx-auto px-5 pb-12">
      <section className="radar-hero grid md:grid-cols-[1.25fr_1fr] items-center gap-7 py-10 md:py-14">
        <div><p className="sobretitulo mb-4">Informação hoje. Oportunidades amanhã.</p><h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.12]">Antecipe movimentos,<br/><span className="text-accent">crie oportunidades.</span></h1><p className="text-muted text-lg mt-5 max-w-xl">Conecte os termos do seu negócio às notícias, comunidades e fontes que importam. Transforme evidências em uma visão estratégica.</p><div className="flex gap-3 flex-wrap mt-6"><Link className="btn-primary !w-auto" href="/radar">Explorar radar →</Link><Link className="btn-ghost" href="/termos">Configurar termos</Link></div></div>
        <div className="relative min-h-64 rounded-3xl bg-gradient-to-br from-accent-soft to-white p-7 border border-white shadow-sm"><p className="sobretitulo">Seu ecossistema de inteligência</p><div className="flex flex-wrap gap-2 mt-5">{COLETORES.map(p => <span key={p.id} className={`rounded-full border px-3 py-2 text-sm ${coletores.includes(p) ? "bg-white border-accent/20 text-accent-ink" : "border-line text-muted"}`}>{p.nome}</span>)}</div><div className="mt-6 bg-white/90 p-4 rounded-xl border border-line"><strong>Dos seus termos à próxima decisão</strong><p className="text-sm text-muted mt-1">Busca recente → evidências → conexões → ação de negócio</p></div><Link href="/setup#fontes-pesquisa" className="btn-link inline-block mt-4 text-sm">Personalizar fontes e conexões →</Link></div>
      </section>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">{[
        [pesquisa.termos.filter(t => t.ativo).length, "Termos ativos", "Seu foco de pesquisa"],
        [coletores.length, "Buscadores habilitados", "Fontes públicas ou com chave"],
        [pesquisa.fontes.filter(f => f.ativa).length, "Sites prioritários", "Referências do seu negócio"],
        [demo ? "—" : evidencias, "Evidências citadas", "Na última pesquisa real"],
        [demo ? "—" : radar.sinais.length, "Sinais identificados", ultimo ? data(ultimo.criadoEm, { comHora: true }) : "Faça sua primeira pesquisa"],
      ].map(([numero, titulo, detalhe]) => <div className="card p-5" key={titulo}><p className="text-3xl text-accent-ink font-extrabold">{numero}</p><p className="font-semibold text-sm mt-1">{titulo}</p><p className="text-xs text-muted mt-2">{detalhe}</p></div>)}</div>
      <div className="flex gap-3 items-center mb-4"><span className={demo ? "chip-status chip-status-demonstracao" : "chip-neutral"}>{demo ? "Demonstração ilustrativa" : "Último radar gerado"}</span><p className="text-sm text-muted">{demo ? "Veja o potencial do mapa. Estes sinais são exemplos, não dados coletados." : `Pesquisa de ${data(ultimo!.criadoEm, { comHora: true })} · últimos ${radar.periodoDias} dias`}</p></div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5"><section className="card p-5 min-w-0"><div className="flex justify-between items-center gap-3 mb-2"><h2 className="text-xl font-bold">Mapa de sinais</h2><Link className="btn-link text-sm" href={ultimo ? `/r/${ultimo.id}` : "/radar?exemplo=1"}>Explorar →</Link></div><p className="text-sm text-muted mb-5">Selecione um nó para investigar suas conexões e fontes.</p><Grafo nos={radar.nos} arestas={radar.arestas} sinais={radar.sinais} /></section>
      <section className="card p-5"><h2 className="text-xl font-bold mb-2">Insights para sua próxima decisão</h2><div className="divide-y divide-line">{radar.sinais.slice(0, 3).map((s, i) => <article className="py-5 flex gap-3" key={s.id}><span className="rounded-xl bg-accent-soft text-accent w-9 h-9 flex items-center justify-center shrink-0 font-bold">{i + 1}</span><div><h3 className="font-bold">{s.titulo}</h3><p className="text-sm text-muted mt-2">{s.resumo}</p><p className="text-sm text-accent-ink mt-3"><strong>Próximo passo:</strong> {s.oQueFazer}</p><p className="text-xs text-muted mt-2">{s.fontes.length} fonte(s) · {demo ? "Exemplo" : `Força ${s.forca}`}</p></div></article>)}</div><Link className="btn-secundario" href={ultimo ? `/r/${ultimo.id}` : "/radar?exemplo=1"}>{demo ? "Experimentar demonstração" : "Ver relatório completo"} →</Link></section></div>
      <section className="card p-5 mt-5"><h2 className="font-bold mb-4">Comece por aqui</h2><div className="grid sm:grid-cols-3 gap-3">{[["/termos", "01 · Defina seu foco", "Cadastre temas, concorrentes e tecnologias."], ["/setup", "02 · Conecte suas fontes", "Escolha buscadores, sites e o modelo de análise."], ["/radar", "03 · Investigue os sinais", "Cruze evidências e decida o que validar."]].map(([href, titulo, descricao]) => <Link key={href} href={href} className="rounded-xl border border-line p-4 hover:bg-accent-soft"><strong className="text-accent-ink">{titulo} →</strong><p className="text-sm text-muted mt-1">{descricao}</p></Link>)}</div></section>
    </main></>;
}
