export type Fonte = "apollo" | "demo";

export interface DadosBusca {
  segmento: string;
  cargo: string;
  localizacao: string;
  porte: string;
  proposta: string;
  quantidade: string;
}

export interface Lead {
  id: string;
  nome: string;
  cargo: string;
  empresa: string;
  setor: string;
  porte: string;
  cidade: string;
  linkedin: string;
  site: string;
  sinal: string;
}

export interface Abordagem {
  gancho: string;
  email: { assunto: string; corpo: string };
  linkedin: string;
  whatsapp: string;
  proximo_passo: string;
}

export interface ResultadoBusca {
  fonte: Fonte;
  leads: Lead[];
}
