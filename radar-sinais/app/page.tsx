import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/ui";
import { Grafo } from "@/components/Grafo";
import { listarPorTipo } from "@/lib/historico";
import { lerPesquisa } from "@/lib/pesquisa-store";
import { radarDemo } from "@/lib/demo";
import { aiEnabled, modelName, type Meta } from "@/lib/ai";
import type { DadosRadar, Radar } from "@/lib/types";
import { data } from "@/lib/formato";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  if (params.exemplo || params.temas) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string") query.set(k, v);
    redirect(`/radar?${query}`);
  }
  const pesquisa = lerPesquisa();
  const ultimo = listarPorTipo<DadosRadar, Radar, Meta>("radar", 30).find(
    (h) => !h.meta.demo,
  );
  const radar = ultimo?.saida || radarDemo(30);
  const termos = pesquisa.termos.filter((t) => t.ativo).length;
  return (
    <>
      <Topbar
        marca="R"
        nome="Radar de Sinais"
        area="Estratégia"
        status={{ ai: aiEnabled(), demo: !aiEnabled(), model: modelName() }}
      />
      <main className="max-w-[1300px] mx-auto px-5 py-8">
        <header className="flex flex-wrap items-center justify-between gap-5 mb-7">
          <div>
            <p className="sobretitulo">Seu horizonte estratégico</p>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-2">
              Antecipe seu próximo movimento.
            </h1>
            <p className="text-muted mt-3 text-sm">
              Conecte os sinais do mercado às decisões do seu negócio.
            </p>
          </div>
          <Link href="/radar" className="btn-primary !w-auto">
            Explorar radar →
          </Link>
        </header>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            [termos, "Termos ativos"],
            [ultimo ? radar.sinais.length : "—", "Sinais identificados"],
            [ultimo ? radar.arestas.length : "—", "Conexões mapeadas"],
          ].map(([valor, titulo]) => (
            <div className="card !shadow-none p-4" key={titulo}>
              <strong className="block text-2xl text-accent-ink">
                {valor}
              </strong>
              <span className="text-xs text-muted">{titulo}</span>
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <section className="card p-5 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 items-center mb-4">
              <h2 className="font-bold">Seu mapa de sinais</h2>
              <span className="text-xs text-muted">
                {ultimo
                  ? `Atualizado em ${data(ultimo.criadoEm, { comHora: true })}`
                  : "Demonstração · dados ilustrativos"}
              </span>
            </div>
            <Grafo
              nos={radar.nos}
              arestas={radar.arestas}
              sinais={radar.sinais}
            />
          </section>
          <aside className="space-y-4">
            <section className="card p-5">
              <h2 className="font-bold mb-2">Em foco</h2>
              <p className="text-xs text-muted mb-3">
                {ultimo
                  ? "Sinais da última pesquisa"
                  : "Exemplos do que você pode investigar"}
              </p>
              {radar.sinais.slice(0, 3).map((s) => (
                <Link
                  key={s.id}
                  href={`/radar?foco=${encodeURIComponent(s.id)}`}
                  className="block border-t border-line py-3 text-sm hover:text-accent"
                >
                  {s.titulo}
                  <span className="block text-xs text-accent mt-1">
                    Investigar →
                  </span>
                </Link>
              ))}
            </section>
            <section className="rounded-2xl bg-accent-soft p-5">
              <h2 className="font-bold text-sm">
                {termos ? "Refine seu foco" : "Comece com um tema"}
              </h2>
              <p className="text-sm text-muted mt-2">
                {termos
                  ? "Acompanhe os temas e concorrentes que importam para o seu negócio."
                  : "Conecte a IA e escolha o que deseja acompanhar. As fontes públicas já estão disponíveis."}
              </p>
              <Link
                href={termos ? "/termos" : "/setup"}
                className="btn-link text-sm inline-block mt-3"
              >
                {termos ? "Gerenciar termos" : "Configurar o essencial"} →
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
