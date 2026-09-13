"use client";

import { useState } from "react";
import { ConteudoPosts } from "../../page";
import type { ImagemGerada, Post, ResultadoPosts } from "@/lib/types";

/** ConteudoPosts precisa de estado local (imagens geradas, texto reescrito); esta página é um Server Component, por isso o estado vive aqui. */
export function ConteudoImpresso({ resultado, empresa }: { resultado: ResultadoPosts; empresa: string }) {
  const [posts, setPosts] = useState<Post[]>(resultado.posts || []);
  const [imagens, setImagens] = useState<Record<number, ImagemGerada>>({});

  return (
    <ConteudoPosts
      posts={posts}
      empresa={empresa}
      ideiaCentral={resultado.ideia_central}
      imagens={imagens}
      onImagemGerada={(i, imagem) => setImagens((m) => ({ ...m, [i]: imagem }))}
      onTextoAtualizado={(i, texto) => setPosts((ps) => ps.map((p, idx) => (idx === i ? { ...p, texto } : p)))}
    />
  );
}
