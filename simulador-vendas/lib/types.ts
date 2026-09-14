// Tipos do domínio: time de vendas, cenários de cliente simulado, conversas coladas e a análise gerada.

export interface Vendedor {
  id: string;
  nome: string;
  email?: string;
  equipe?: string;
  criadoEm: string;
}

export interface Cenario {
  id: string;
  titulo: string;
  cliente: {
    nome: string;
    cargo: string;
    empresa: string;
    contexto: string;
  };
  objetivo: string;
  objecoes: string[];
  tom: string;
}

export interface LinhaTranscricao {
  papel: "vendedor" | "cliente";
  texto: string;
  /** Segundo da gravação em que a fala aconteceu; presente só quando a conversa vem de voz. */
  segundo?: number;
}

export interface Conversa {
  id: string;
  vendedorId?: string;
  cenarioId?: string;
  origem: "voz" | "texto" | "colada";
  transcricao: LinhaTranscricao[];
  duracaoSeg?: number;
  criadoEm: string;
}

export interface CriterioAnalise {
  nome: string;
  nota: number;
  evidencia: string;
  comoMelhorar: string;
}

export interface Analise {
  nota: number;
  criterios: CriterioAnalise[];
  pontosFortes: string[];
  oQueMelhorar: string[];
  momentos: string[];
  resumo: string;
}

/** Dados enviados pelo painel para pedir uma análise: a conversa colada mais, opcionalmente, quem vendeu e em qual cenário. */
export interface DadosAnalise {
  conversaColada: string;
  vendedorId?: string;
  cenarioId?: string;
  criterios?: string[];
}

/** Uma conversa já analisada de um vendedor, resumida para a lista "Ver conversas" do painel da equipe. */
export interface ConversaResumoVendedor {
  resultadoId: string;
  titulo: string;
  cenario?: string;
  nota: number;
  criadoEm: string;
}

export interface VendedorPainel {
  vendedorId: string;
  nome: string;
  conversas: number;
  notaMedia: number;
  tendencia: "subindo" | "estavel" | "caindo";
  /** notaMedia do vendedor menos a do período anterior; null quando não há conversas no período anterior. */
  variacao: number | null;
  criterioMaisFraco: string;
  ultimaConversa: string | null;
  conversasRecentes: ConversaResumoVendedor[];
}

export interface CriterioFraco {
  nome: string;
  notaMedia: number;
}

/** Painel da equipe: recalculado a cada clique de "Ver o painel da equipe" (US-017). */
export interface PainelEquipe {
  dias: number;
  notaMedia: number;
  notaMediaAnterior: number | null;
  vendedores: VendedorPainel[];
  criteriosFracos: CriterioFraco[];
}

/** Único parâmetro do painel: a janela de dias considerada (padrão 30). */
export interface DadosPainel {
  dias: number;
}
