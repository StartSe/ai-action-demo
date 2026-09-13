"use client";
// Rascunhos aprovados pelo link de aprovação (lib/rascunhos.ts), listados no painel com "Copiar" e
// "Agendar" (.ics) por post, mesmo padrão de botões já usado em components/PreviaPost.tsx.
import { useEffect, useState } from "react";
import { REDES, textoDoPost } from "@/components/PreviaPost";
import { baixarArquivo, gerarIcsPost } from "@/lib/agenda";
import { data } from "@/lib/formato";
import type { Post } from "@/lib/types";

type ItemAprovado = { id: string; titulo: string; criadoEm: string; posts: Post[] };

export function Aprovados() {
  const [itens, setItens] = useState<ItemAprovado[] | null>(null);
  const [copiadoChave, setCopiadoChave] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/posts/aprovados")
      .then((r) => r.json())
      .then((d) => setItens(d.itens))
      .catch(() => setItens([]));
  }, []);

  async function copiar(chave: string, post: Post) {
    try {
      await navigator.clipboard.writeText(textoDoPost(post));
      setCopiadoChave(chave);
      setTimeout(() => setCopiadoChave(null), 1800);
    } catch {
      alert(textoDoPost(post));
    }
  }

  function agendar(titulo: string, post: Post) {
    const conteudo = gerarIcsPost({
      titulo: `Publicar no ${REDES[post.rede]?.nome || post.rede} — ${titulo}`,
      descricao: textoDoPost(post),
      melhorHorario: post.melhor_horario,
    });
    baixarArquivo(`post-${post.rede}.ics`, conteudo, "text/calendar;charset=utf-8");
  }

  if (itens === null) return <p className="text-muted text-sm">Carregando...</p>;
  if (itens.length === 0) return <p className="text-muted text-sm">Nenhum rascunho aprovado ainda.</p>;

  return (
    <div className="flex flex-col gap-4">
      {itens.map((item) => (
        <div key={item.id}>
          <div className="flex justify-between gap-3 mb-1.5">
            <span className="text-sm font-semibold truncate">{item.titulo}</span>
            <span className="text-muted text-[12.5px] shrink-0">{data(item.criadoEm)}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {item.posts.map((post) => {
              const chave = `${item.id}-${post.rede}`;
              return (
                <li key={chave} className="flex items-center justify-between gap-2.5 border border-line rounded-md px-3 py-2">
                  <span className="text-[13px] font-medium">{REDES[post.rede]?.nome || post.rede}</span>
                  <span className="flex gap-3 shrink-0">
                    <button type="button" className="btn-link text-[12.5px]" onClick={() => copiar(chave, post)}>
                      {copiadoChave === chave ? "Copiado" : "Copiar"}
                    </button>
                    <button type="button" className="btn-link text-[12.5px]" onClick={() => agendar(item.titulo, post)}>
                      Agendar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
