import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/ui";
import { DestaquesRadar } from "@/components/DestaquesRadar";
import { Monitoramentos } from "@/components/Monitoramentos";
import { Grafo } from "@/components/Grafo";
import { SinalChips } from "@/components/SinalChips";
import { exemplosVisiveis, ultimoRadarReal } from "@/lib/radar-historico";
import { listarRadares, obterRadar, analisesRadar } from "@/lib/radares";
import { radarDemo } from "@/lib/demo";
import { aiEnabled, modelName } from "@/lib/ai";
import { DESTINO_CONECTAR_IA, DESTINO_RADAR, DESTINO_TEMAS } from "@/lib/destinos";
import { ordenarSinais, resumoRadar } from "@/lib/sinais";
import type { Radar } from "@/lib/types";
import { data } from "@/lib/formato";
export const dynamic = "force-dynamic";

// Limites de texto do PADRAO.md, medidos: título 6 palavras (≤ 8); apoio 17 palavras (≤ 20).
const TITULO = "Veja o mercado se mover antes";
const APOIO = "Os temas que você acompanha, lidos pela IA e ligados em um mapa de sinais, força e tendência.";

export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  if (params.exemplo || params.temas) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string") query.set(k, v);
    redirect(`${DESTINO_RADAR}?${query}`);
  }
  const radares = listarRadares();
  const iaLigada = await aiEnabled();
  const recente = ultimoRadarReal();
  const cadastro = obterRadar(typeof params.radarId === "string" && radares.some(r => r.id === params.radarId) ? params.radarId : recente?.entrada.radarId);
  const ultimo = analisesRadar(cadastro.id, 1, true)[0];
  const pesquisa = cadastro.pesquisa;
  const destino = `${DESTINO_RADAR}?radarId=${cadastro.id}`;
  const exemplo = exemplosVisiveis(iaLigada);
  const radar: Radar = ultimo?.saida || (exemplo ? radarDemo(30) : { periodoDias: 30, sinais: [], nos: [], arestas: [], conexoes: [] });
  const termos = pesquisa.termos.filter((t) => t.ativo).length;
  const resumo = resumoRadar(radar);
  const emFoco = ordenarSinais(radar.sinais).slice(0, 3);
  const leituras = (radar.conexoes ?? []).map((c, indice) => ({ ...c, indice })).slice(0, 3);
  const proximo = !iaLigada
    ? { href: DESTINO_CONECTAR_IA, rotulo: "Conectar a IA", titulo: "Comece conectando a IA", texto: "Um clique e o radar passa a ler os seus temas. As fontes públicas já estão disponíveis." }
    : termos === 0
      ? { href: DESTINO_TEMAS, rotulo: "Escolher meus temas", titulo: "Comece com um tema", texto: "Escolha os temas e concorrentes que importam para o seu negócio." }
      : { href: destino, rotulo: "Abrir o radar", titulo: "Refine seu foco", texto: "Acompanhe os temas e concorrentes que importam para o seu negócio." };
  const indicadores: { valor: string; rotulo: string }[] = [
    { valor: String(resumo.fortes), rotulo: "Sinais fortes" },
    { valor: String(resumo.subindo), rotulo: "Subindo" },
    { valor: String(resumo.leituras), rotulo: "Leituras" },
    ultimo ? { valor: data(ultimo.criadoEm), rotulo: "Última atualização" } : { valor: exemplo ? "Exemplo" : "—", rotulo: exemplo ? "Dados ilustrativos" : "Última atualização" },
  ];
  return (
    <>
      <Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={{ ai: iaLigada, demo: !iaLigada, exemplos: exemplo, model: modelName() }} />
      <main className="max-w-[1300px] mx-auto px-5 py-8">
        <header className="flex flex-wrap items-end justify-between gap-5 mb-6">
          <div className="max-w-2xl">
            <p className="sobretitulo">Radar de sinais</p>
            <h1 className="titulo-painel mt-2">{TITULO}</h1>
            <p className="text-muted mt-3">{APOIO}</p>
          </div>
          <Link href={proximo.href} className="btn-primary !w-auto">{proximo.rotulo}</Link>
        </header>
        <section className="mb-6" aria-label="Meus radares">
          <div className="flex justify-between items-center mb-3"><h2 className="font-bold">Meus radares</h2><Link className="btn-link text-sm" href="/radar?novo=1">+ Novo radar</Link></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{radares.map(r => <Link key={r.id} aria-current={r.id === cadastro.id ? "true" : undefined} className={`card p-4 hover:border-accent ${r.id === cadastro.id ? "!border-accent !bg-accent-soft" : ""}`} href={`/?radarId=${r.id}`}><strong className="block">{r.nome}</strong><span className="text-xs text-muted">{r.pesquisa.termos.filter(t => t.ativo).map(t => t.termo).join(" · ") || "Adicione temas para começar"}</span></Link>)}</div>
        </section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {indicadores.map((i) => (
            <div className="card !shadow-none p-4" key={i.rotulo}>
              <strong className="block text-2xl text-accent-ink leading-tight">{i.valor}</strong>
              <span className="text-xs text-muted">{i.rotulo}</span>
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <section className="card p-5 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 items-center mb-4">
              <h2 className="font-bold">{cadastro.nome}</h2>
              <span className="text-xs text-muted">{ultimo ? `Atualizado em ${data(ultimo.criadoEm, { comHora: true })}` : exemplo ? "Demonstração · dados ilustrativos" : "Nenhum radar gerado"}</span>
            </div>
            {!ultimo && !exemplo && <p className="py-12 text-center text-muted">Seu radar está pronto para começar. Escolha seus temas e gere a primeira análise.</p>}
            {(ultimo || exemplo) && <Grafo nos={radar.nos} arestas={radar.arestas} sinais={radar.sinais} destinoDoNo={`${destino}&foco=`} />}
            <Link href={destino} className="btn-link text-sm inline-block mt-3">Explorar o mapa completo</Link>
          </section>
          <aside className="space-y-4">
            <section className="card p-5">
              <h2 className="font-bold mb-1">Em foco</h2>
              <p className="text-xs text-muted mb-2">{ultimo ? "Os sinais mais fortes da última pesquisa" : exemplo ? "Exemplos do que você pode investigar" : "Os sinais aparecerão após sua primeira pesquisa"}</p>
              {emFoco.map((s) => (
                <Link key={s.id} href={`${destino}&foco=${encodeURIComponent(s.id)}`} className="block border-t border-line py-3 text-sm hover:text-accent">
                  <span className="block leading-snug">{s.titulo}</span>
                  <SinalChips forca={s.forca} tendencia={s.tendencia} className="mt-1.5" />
                </Link>
              ))}
            </section>
            {leituras.length > 0 && (
              <section className="card p-5">
                <h2 className="font-bold mb-1">Leituras</h2>
                <p className="text-xs text-muted mb-2">O que os sinais dizem juntos</p>
                {leituras.map((c) => (
                  <Link key={c.indice} href={`${destino}&insight=${c.indice}`} className="block border-t border-line py-3 text-sm hover:text-accent">
                    <span className="block font-semibold leading-snug">{c.titulo}</span>
                    <span className="block text-xs text-muted mt-1 line-clamp-2">{c.explicacao}</span>
                  </Link>
                ))}
              </section>
            )}
            <section className="rounded-2xl bg-accent-soft p-5">
              <h2 className="font-bold text-sm">{proximo.titulo}</h2>
              <p className="text-sm text-muted mt-2">{proximo.texto}</p>
              <Link href={proximo.href} className="btn-link text-sm inline-block mt-3">{proximo.rotulo}</Link>
            </section>
          </aside>
        </div>
        {ultimo && <DestaquesRadar radar={radar} radarId={cadastro.id} resultadoId={ultimo.id} />}
        <Monitoramentos dados={{ radarId: cadastro.id, temas: pesquisa.termos.filter(t => t.ativo).map(t => t.termo), periodoDias: pesquisa.periodoDias, setor: pesquisa.setor }} />
      </main>
    </>
  );
}
