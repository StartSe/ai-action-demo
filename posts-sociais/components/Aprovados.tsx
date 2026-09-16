"use client";
// Rascunhos semanais (lib/rascunhos.ts) no painel: aprovados, aguardando resposta e com ajuste pedido (com o
// comentário e "Reescrever com esse comentário"). "Copiar" e "Lembrete no calendário" por post reaproveitam
// textoDoPost/gerarIcsPost, sem duplicar lógica de components/PreviaPost.tsx.
import Link from "next/link";
import { useEffect, useState } from "react";
import { REDES, textoDoPost } from "@/components/PreviaPost";
import { Aviso, Chip, lerErro, type ErroLido } from "@/components/ui";
import { baixarArquivo, gerarIcsPost } from "@/lib/agenda";
import { data } from "@/lib/formato";
import type { Aprovacao, Post } from "@/lib/types";

type ItemRascunho = { id: string; titulo: string; criadoEm: string; empresa: string; status: Exclude<Aprovacao["status"], "descartado">; comentario: string; posts: Post[] };

const ROTULO_STATUS: Record<ItemRascunho["status"], { texto: string; nivel: string }> = {
  aprovado: { texto: "Aprovado", nivel: "positivo" },
  pendente: { texto: "Aguardando", nivel: "neutral" },
  ajuste: { texto: "Ajuste pedido", nivel: "neutro" },
};

export function Aprovados() {
  const [itens, setItens] = useState<ItemRascunho[] | null>(null);
  const [copiadoChave, setCopiadoChave] = useState<string | null>(null);
  const [falhaCopia, setFalhaCopia] = useState(false);
  const [reescrevendo, setReescrevendo] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Record<string, { tom: "ok" | "danger"; texto: string; acao?: ErroLido["acao"] }>>({});

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
      setFalhaCopia(true);
      setTimeout(() => setFalhaCopia(false), 4000);
    }
  }

  function lembrete(titulo: string, post: Post) {
    const conteudo = gerarIcsPost({
      titulo: `Publicar no ${REDES[post.rede]?.nome || post.rede} — ${titulo}`,
      descricao: textoDoPost(post),
      melhorHorario: post.melhor_horario,
    });
    baixarArquivo(`post-${post.rede}.ics`, conteudo, "text/calendar;charset=utf-8");
  }

  async function reescreverComComentario(item: ItemRascunho) {
    setReescrevendo(item.id);
    setAvisos((a) => {
      const novo = { ...a };
      delete novo[item.id];
      return novo;
    });
    try {
      const r = await fetch(`/api/posts/${item.id}/reescrever`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comentario: item.comentario }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setAvisos((a) => ({ ...a, [item.id]: { tom: "danger", texto: info.mensagem, acao: info.acao } }));
        return;
      }
      const d = (await r.json()) as { posts: Post[]; aprovacao: Aprovacao };
      setItens((lista) => (lista ?? []).map((i) => (i.id === item.id ? { ...i, posts: d.posts, status: "pendente", comentario: d.aprovacao.comentario || "" } : i)));
      setAvisos((a) => ({ ...a, [item.id]: { tom: "ok", texto: "Rascunhos reescritos com o comentário. Eles voltam a aguardar aprovação pelo mesmo link enviado." } }));
    } catch (e) {
      const info = await lerErro(e);
      setAvisos((a) => ({ ...a, [item.id]: { tom: "danger", texto: info.mensagem } }));
    } finally {
      setReescrevendo(null);
    }
  }

  if (itens === null) return <p className="text-muted text-sm">Carregando...</p>;
  if (itens.length === 0) return <p className="text-muted text-sm">Nenhum rascunho semanal ainda. Cadastre os temas do trimestre em Configurações para receber rascunhos toda semana.</p>;

  return (
    <div className="flex flex-col gap-5">
      {falhaCopia && <Aviso tom="danger">Não foi possível copiar automaticamente. Abra o rascunho e copie o texto com Ctrl+C (ou Cmd+C no Mac).</Aviso>}
      {itens.map((item) => {
        const rotulo = ROTULO_STATUS[item.status];
        const aviso = avisos[item.id];
        return (
          <div key={item.id}>
            <div className="flex items-start justify-between gap-3 mb-1.5 flex-wrap">
              <div className="min-w-0">
                <Link href={`/r/${item.id}`} className="text-sm font-semibold text-accent-ink hover:underline block truncate">{item.titulo}</Link>
                <span className="text-muted text-[12.5px]">{data(item.criadoEm)}</span>
              </div>
              <Chip nivel={rotulo.nivel}>{rotulo.texto}</Chip>
            </div>
            {item.status === "ajuste" && (
              <div className="mb-2.5 border-l-2 border-warn pl-3">
                <p className="text-sm text-ink-2 italic">{item.comentario ? `“${item.comentario}”` : "Ajuste pedido sem comentário."}</p>
                {item.comentario && (
                  <button type="button" className="btn-link text-[13px] mt-1.5" disabled={reescrevendo === item.id} onClick={() => reescreverComComentario(item)}>
                    {reescrevendo === item.id ? "Reescrevendo..." : "Reescrever com esse comentário"}
                  </button>
                )}
              </div>
            )}
            {aviso && <div className="mb-2.5"><Aviso tom={aviso.tom} acao={aviso.acao}>{aviso.texto}</Aviso></div>}
            <ul className="flex flex-col gap-2">
              {item.posts.map((post) => {
                const chave = `${item.id}-${post.rede}`;
                return (
                  <li key={chave} className="flex items-center justify-between gap-2.5 border border-line rounded-md px-3 py-2 flex-wrap">
                    <span className="text-[13px] font-medium">{REDES[post.rede]?.nome || post.rede}</span>
                    <span className="flex gap-3 flex-wrap">
                      <button type="button" className="btn-link text-[12.5px]" onClick={() => copiar(chave, post)}>
                        {copiadoChave === chave ? "Copiado" : "Copiar"}
                      </button>
                      <button type="button" className="btn-link text-[12.5px]" onClick={() => lembrete(item.titulo, post)}>
                        Lembrete no calendário
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
