// lib/types.ts — tipos do domínio de toolkit-dash-builder.
// Nenhum import node:*: este arquivo é lido também pelo client component app/page.tsx.

/**
 * Os SETE tipos de componente que a IA pode gerar. Não existe outro.
 * "pizza" e "rosca" são duas apresentações da mesma distribuição (mesmo `dados`, mesmo renderizador).
 */
export type TipoComponente = "indicador" | "linha" | "area" | "barra" | "pizza" | "rosca" | "tabela";

/** Como um número é escrito na tela. */
export type Formato = "moeda" | "numero" | "percentual";

/**
 * Posição na grade de 4 colunas.
 * linha: 0, 1, 2 ou 3. coluna: 0 a 3. largura: 1 a 4.
 * Invariante: em cada linha, a soma das larguras é no máximo 4 e nenhum intervalo se sobrepõe.
 */
export interface Posicao {
  linha: number;
  coluna: number;
  largura: 1 | 2 | 3 | 4;
}

/** indicador — um número grande com comparação e, opcionalmente, meta. */
export interface DadosIndicador {
  valor: number;
  /**
   * Valor do período anterior, para a variação. Opcional desde os dados externos: quando o painel
   * vem de uma planilha sem coluna de data não existe período anterior, e o cartão então omite a
   * linha de comparação em vez de repetir o próprio valor (variação de 0% seria mentira).
   * O caminho da IA continua obrigado a preenchê-lo pelo prompt.
   */
  anterior?: number;
  formato: Formato;
  /** Só para formato "moeda". Sempre "R$" nesta versão. */
  prefixo?: string;
  /** Quando presente, o cartão mostra uma barra de progresso de valor sobre meta. */
  meta?: number;
  /** "aumentar" (padrão) ou "diminuir": define se uma variação positiva é boa (verde) ou ruim (vermelho). */
  direcaoBoa?: "aumentar" | "diminuir";
}

/** Um ponto de uma série: o rótulo do eixo X e o valor do eixo Y. */
export interface Ponto {
  rotulo: string;
  valor: number;
}

/** linha, area e barra — uma série de 4 a 12 pontos. */
export interface DadosSerie {
  /** Nome do eixo horizontal, para a legenda (ex.: "Mês", "Vendedor"). */
  eixoX: string;
  /** Nome do eixo vertical (ex.: "Receita"). */
  eixoY: string;
  formato: Formato;
  prefixo?: string;
  /** Só para "barra". "vertical" para comparação simples, "horizontal" para ranking com nomes longos. */
  orientacao?: "vertical" | "horizontal";
  pontos: Ponto[];
}

/** pizza e rosca — 3 a 6 fatias (o validador agrupa o excedente em "Outros"). */
export interface DadosDistribuicao {
  formato: Formato;
  prefixo?: string;
  fatias: Ponto[];
}

export interface ColunaTabela {
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "moeda" | "percentual" | "data";
}

/** tabela — 3 a 6 colunas, 3 a 10 linhas. */
export interface DadosTabela {
  colunas: ColunaTabela[];
  linhas: Array<Record<string, string | number>>;
}

interface Base {
  /** "c1", "c2", ... Único dentro do painel e estável entre refinamentos. */
  id: string;
  /** Até 40 caracteres, em português, sem sigla solta. */
  titulo: string;
  posicao: Posicao;
}

/**
 * União discriminada por `tipo`: um único campo `dados` por componente.
 * (A origem tinha `config` e `mockData` duplicados, com fallback `mockData?.data ?? config?.data ?? []`.)
 */
export type ComponentePainel =
  | (Base & { tipo: "indicador"; dados: DadosIndicador })
  | (Base & { tipo: "linha" | "area" | "barra"; dados: DadosSerie })
  | (Base & { tipo: "pizza" | "rosca"; dados: DadosDistribuicao })
  | (Base & { tipo: "tabela"; dados: DadosTabela });

export interface EspecPainel {
  /** Até 60 caracteres, em português. */
  titulo: string;
  /** Uma frase explicando o que o painel acompanha, até 25 palavras. */
  resumo: string;
  /** Setor identificado pela IA, usado no rodapé e no histórico. */
  setor: string;
  /** 5 a 8 componentes. */
  componentes: ComponentePainel[];
  /**
   * Data ISO do último refinamento. Preenchido SÓ por `refinarPainel()` (nunca pela IA, que não
   * conhece o campo) e gravado junto com a `saida` por `atualizarSaida`. Um painel com `refinadoEm`
   * é excluído do cache por hash (RF-12 a6): `atualizarSaida` sobrescreve só a `saida`, então sem
   * esta marca um pedido idêntico receberia o painel já refinado como se fosse a geração original.
   * Mesmo padrão de `PDI.acompanhamento` (US-070 do CLAUDE.md do pdi-time).
   */
  refinadoEm?: string;
}

/** O pedido do usuário, guardado como `entrada` no histórico. */
export interface PedidoPainel {
  descricao: string;
  /** Respostas do gate de esclarecimento: pergunta -> resposta. */
  esclarecimentos?: Record<string, string>;
  /** SHA-256 do pedido normalizado, para o cache (RF-12). */
  hash?: string;
}

export interface PerguntaEsclarecimento {
  id: string;
  pergunta: string;
  /** 2 a 4 respostas sugeridas, mostradas como chips. */
  sugestoes: string[];
}

export interface RespostaEsclarecimento {
  precisaEsclarecer: boolean;
  perguntas: PerguntaEsclarecimento[];
}

export interface RespostaRefinamento {
  painel: EspecPainel;
  /** Uma frase sobre o que foi feito. */
  mensagem: string;
  /** Ids alterados, removidos ou acrescentados (o id do componente novo, como o prompt exige). */
  componentesAlterados: string[];
}

export type TipoObservacao = "anomalia" | "tendencia" | "sugestao";

export interface Observacao {
  tipo: TipoObservacao;
  mensagem: string;
}

/** Uma fala da conversa de refinamento (só no cliente; não é persistida na v1). */
export interface Fala {
  autor: "voce" | "ia";
  texto: string;
  em: string;
}
