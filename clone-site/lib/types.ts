/** Formato do arquivo gerado: um único HTML, estilizado com Tailwind (CDN) ou com CSS próprio em <style>. */
export type Stack = "html-tailwind" | "html-css";

export interface Marca {
  nome: string;
  corPrimaria: string;
  corSecundaria?: string;
}

/** O que o usuário envia para gerar a página: a captura (data URL PNG/JPG) e o que mudar em relação a ela. */
export interface Pedido {
  imagem: string;
  stack: Stack;
  instrucoes?: string;
  marca?: Marca;
}

/** Cada geração ou edição vira uma versão nova; a atual é sempre a última da lista. */
export interface Versao {
  n: number;
  html: string;
  instrucao: string;
  criadoEm: string;
}

export interface Pagina {
  id: string;
  titulo: string;
  versoes: Versao[];
  marca?: Marca;
}

/** O que fica salvo como "entrada" no histórico: o pedido sem a imagem (pesada e sem uso depois de gerar). */
export type EntradaPagina = Omit<Pedido, "imagem"> & { tamanhoImagem: number };
