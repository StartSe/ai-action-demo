import type { ChatAccount, DeviceLogin } from "./chatgpt";

export type EstadoChatGPT = {
  account: ChatAccount;
  login: DeviceLogin | null;
  error: string | null;
  models: { id: string; name: string }[];
};
export type PreferenciasIA = {
  provedor: "openrouter" | "chatgpt";
  modelo: string;
  provedorFixo: boolean;
  modeloFixo: boolean;
};
