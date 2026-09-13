export type Fonte = "apollo" | "demo";

export interface DadosBusca {
  segmento: string;
  cargo: string;
  localizacao: string;
  porte: string;
  proposta: string;
  quantidade: string;
  remetenteNome?: string;
  remetenteEmpresa?: string;
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
  /** true depois de "Enviar para o CRM" ter criado o contato (e, quando identificado, o negócio) com sucesso. */
  noCRM?: boolean;
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
  /** Abordagens já escritas para esses leads (rotina "leads novos toda semana"); ausente numa busca manual comum. */
  abordagens?: Record<string, Abordagem>;
}
