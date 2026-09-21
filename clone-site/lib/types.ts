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
export type EntradaPagina = Omit<Pedido, "imagem"> & { tamanhoImagem: number; briefing?: string; url?: string };

// ---------------------------------------------------------------------------------------------------------
// Site = projeto (lib/projetos.ts). Um projeto tem nome, marca, origem, estado e aponta para a página
// (com as versões) gravada no histórico; a versão publicada é a que /s/<slug> serve.
// ---------------------------------------------------------------------------------------------------------

/** rascunho → gerando → pronto | falhou; falhou → gerando ("Tentar de novo"). Nenhuma outra transição. */
export type EstadoProjeto = "rascunho" | "gerando" | "pronto" | "falhou";

/** De onde o site nasce: da captura de uma página de referência, do endereço de um site ou de um briefing em texto. */
export type OrigemProjeto = "referencia" | "endereco" | "briefing";

/** Falha gravada no projeto, no mesmo formato de ErroIA (lib/ai.ts): mensagem em português, nunca o texto cru do provedor. */
export type ErroProjeto = { mensagem: string; codigo?: string; acao?: { rotulo: string; url: string } };

/** Uma etapa da construção (lib/construtor.ts): o plano e depois uma seção da página por vez. */
export type EstadoEtapa = "pendente" | "andamento" | "pronta" | "falhou";
export interface EtapaGeracao {
  id: string;
  titulo: string;
  estado: EstadoEtapa;
  /** Uma linha sobre o que a etapa produziu ou por que falhou. */
  detalhe?: string;
  iniciadoEm?: string;
  terminadoEm?: string;
}

/** O andamento da geração, gravado no projeto a cada etapa: a tela mostra a lista e a prévia parcial. */
export interface ProgressoGeracao {
  etapas: EtapaGeracao[];
  atualizadoEm: string;
}

/** Publicação em hospedagem externa (Netlify): o site criado lá e a versão que foi enviada. */
export interface PublicacaoExterna {
  siteId: string;
  url: string;
  versao?: number;
  publicadoEm?: string;
}

/** O projeto devolvido às telas: nunca carrega a imagem (pesada; fica no banco só até `pronto`). */
export interface Projeto {
  id: string;
  nome: string;
  /** Parte legível do link público: /s/<slug>. Único na instância; editável. */
  slug: string;
  estado: EstadoProjeto;
  origem: OrigemProjeto;
  stack: Stack;
  instrucoes?: string;
  briefing?: string;
  /** Endereço do site de referência, quando a origem é "endereco". */
  url?: string;
  marca?: Marca;
  tamanhoImagem: number;
  /** Id da página no histórico (resultados), quando `pronto`. */
  paginaId?: string;
  /** Número da versão que está no ar em /s/<slug>; as edições criam versões novas sem mexer nela até "Publicar". */
  versaoPublicada?: number;
  /** Domínio próprio (ex.: www.minhaempresa.com.br) que a instância serve na raiz para esse Host. */
  dominio?: string;
  /** Andamento da última geração (etapas), mantido também depois de pronto para a pessoa rever o que foi feito. */
  progresso?: ProgressoGeracao;
  /** Site publicado em hospedagem externa (Netlify). */
  netlify?: PublicacaoExterna;
  erro?: ErroProjeto;
  criadoEm: string;
  atualizadoEm: string;
  terminadoEm?: string;
  /** Quando a pessoa abriu o resultado (o sino do cabeçalho deixa de contar). */
  vistoEm?: string;
}
