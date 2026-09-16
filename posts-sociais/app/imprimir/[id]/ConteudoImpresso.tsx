"use client";

import { useState } from "react";
import { useImagensPosts } from "@/components/PreviaPost";
import { ConteudoPosts } from "../../page";
import type { Post, ResultadoPosts } from "@/lib/types";

/** ConteudoPosts precisa de estado local (imagens geradas, texto reescrito); esta página é um Server Component, por isso o estado vive aqui. */
export function ConteudoImpresso({ resultado, empresa }: { resultado: ResultadoPosts; empresa: string }) {
  const [posts, setPosts] = useState<Post[]>(resultado.posts || []);
  const imagens = useImagensPosts({ posts, empresa, ideiaCentral: resultado.ideia_central });

  return (
    <ConteudoPosts
      posts={posts}
      empresa={empresa}
      ideiaCentral={resultado.ideia_central}
      imagens={imagens}
      onTextoAtualizado={(i, texto) => setPosts((ps) => ps.map((p, idx) => (idx === i ? { ...p, texto } : p)))}
    />
  );
}
