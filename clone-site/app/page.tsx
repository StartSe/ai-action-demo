"use client";
// Tela inicial: a caixa de criação com o mínimo de fricção (components/CriarSite.tsx) no topo e a grade "Meus
// sites" embaixo. Criar não espera: vai direto ao workspace do site (/sites/[id]), que mostra a construção
// etapa a etapa com a prévia parcial. Atalhos: /?exemplo=1 cria o site de exemplo; /?site=<id> edita o pedido
// de um site em rascunho/falhou.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CriarSite, EXEMPLO, capturaDeExemplo } from "@/components/CriarSite";
import { MeusSites, buscarSites } from "@/components/MeusSites";
import { TopbarSite } from "@/components/TopbarSite";
import { Aviso, Hero, lerErro } from "@/components/ui";
import type { Projeto } from "@/lib/types";

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20 — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Marketing e Produto",
  titulo: "O site da sua empresa, no ar hoje",
  apoio: "Cole um endereço, solte uma captura ou descreva a empresa. Refine depois conversando com o agente.",
};

export default function Page() {
  const router = useRouter();
  const [sites, setSites] = useState<Projeto[] | null>(null);
  const [editando, setEditando] = useState<Projeto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const autoEnviado = useRef(false);

  // "Editar o pedido" (/?site=<id>): a caixa nasce preenchida com o site em rascunho/falhou.
  useEffect(() => {
    const siteId = new URLSearchParams(location.search).get("site");
    if (!siteId) return;
    fetch(`/api/sites/${siteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { projeto: Projeto } | null) => {
        const s = d?.projeto;
        if (s && (s.estado === "rascunho" || s.estado === "falhou")) setEditando(s);
      })
      .catch(() => {});
  }, []);

  // Atalho para demonstrações: /?exemplo=1 carrega a captura de exemplo, cria o site e abre o acompanhamento.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        capturaDeExemplo()
          .then((imagem) => fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origem: "referencia", imagem, nome: EXEMPLO.nomeSite, marca: { nome: EXEMPLO.marcaNome, corPrimaria: EXEMPLO.corPrimaria }, stack: "html-tailwind", gerar: true }) }))
          .then(async (r) => {
            if (!r.ok) throw new Error((await lerErro(r)).mensagem);
            const { projeto } = (await r.json()) as { projeto: Projeto };
            const captura = new URLSearchParams(location.search).get("captura");
            router.push(`/sites/${projeto.id}${captura ? "?captura=1" : ""}`);
          })
          .catch(async (e) => setAviso((await lerErro(e)).mensagem));
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const temSites = Boolean(sites && sites.length);

  return (
    <>
      <TopbarSite />
      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing" />

      <main className="px-8 pt-2 pb-12 max-md:px-4 max-md:pb-10 max-w-[1400px] mx-auto flex flex-col gap-9">
        <section aria-label="Criar um site" className="max-w-[860px]">
          {aviso && <div className="mb-3"><Aviso tom="danger">{aviso}</Aviso></div>}
          <CriarSite editando={editando} aoCancelarEdicao={() => { setEditando(null); history.replaceState(null, "", "/"); }} />
        </section>

        <MeusSites
          sites={sites}
          aoMudar={setSites}
          rodape={temSites ? (
            <div className="flex items-center gap-4 pt-1">
              <Link href="/historico" className="btn-link text-[13px]">Ver o histórico</Link>
              <button
                type="button"
                className="btn-link !text-muted text-[13px]"
                onClick={() => {
                  if (!window.confirm("Apagar todos os sites e páginas salvos? Essa ação não pode ser desfeita.")) return;
                  fetch("/api/pagina", { method: "DELETE" }).then(() => buscarSites()).then(setSites).catch(() => {});
                }}
              >
                Apagar tudo
              </button>
            </div>
          ) : undefined}
        />
      </main>
    </>
  );
}
