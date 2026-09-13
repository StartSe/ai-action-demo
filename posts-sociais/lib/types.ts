export type Rede = "linkedin" | "instagram" | "x";

export interface Post {
  rede: Rede;
  texto: string;
  hashtags: string[];
  melhor_horario: string;
  prompt_imagem: string;
}

/** Status de aprovação de um rascunho semanal (lib/rascunhos.ts); ausente quando os posts não vieram de uma rotina. */
export type Aprovacao = { status: "pendente" | "aprovado" | "ajuste" | "descartado"; comentario?: string };

export interface ResultadoPosts {
  ideia_central: string;
  posts: Post[];
  aprovacao?: Aprovacao;
}

export interface DadosPosts {
  empresa: string;
  tema: string;
  objetivo: string;
  tom: string;
  redes: Rede[];
  publico?: string;
}

/** Imagem associada a um post: `demo` indica se veio do cartaz local (sem gerador de imagens configurado). */
export interface ImagemGerada {
  url: string;
  demo: boolean;
}
