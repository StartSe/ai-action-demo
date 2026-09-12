export type Tom = "cordial" | "direto" | "descontraido";
export type NaoSei = "humano" | "contato" | "site";
export type Origem = "simulador" | "whatsapp";

export interface Config {
  negocio: string;
  atendente: string;
  tom: Tom;
  horario: string;
  baseConhecimento: string;
  naoSei: NaoSei;
}

export interface Conversa {
  numero: string;
  ultima_mensagem: string;
  hora: string;
  transferir: boolean;
  origem: Origem;
}

export interface MensagemChat {
  papel: "cliente" | "atendente";
  texto: string;
}
