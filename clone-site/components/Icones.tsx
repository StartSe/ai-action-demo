// Ícones de traço (24x24, 1,7 px) próprios deste app: configuração, caixa de criação, workspace e chat.
// Mesmo desenho dos ícones do Build Agentflows, sem dependência.
import type { ReactNode } from "react";

export type NomeIcone =
  | "faisca" | "elo" | "nuvem" | "globo" | "robo" | "conversa" | "check" | "fechar" | "seta" | "imagem" | "texto"
  | "mais" | "engrenagem" | "olho" | "enviar" | "lixeira" | "copiar" | "externo" | "relogio" | "camadas" | "grafico" | "pincel" | "foguete";

const TRACOS: Record<NomeIcone, ReactNode> = {
  faisca: <path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z" />,
  elo: <path d="m10 14 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" />,
  nuvem: <path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" />,
  globo: (<><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>),
  robo: (<><rect x="4" y="7" width="16" height="13" rx="4" /><path d="M12 3v4M8 12v1m8-1v1m-7 4h6M2 11v5m20-5v5" /></>),
  conversa: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-7a9 9 0 1 1 18-4Z" />,
  check: <path d="m5 12 4 4L19 6" />,
  fechar: <path d="m6 6 12 12M6 18 18 6" />,
  seta: <path d="m9 6 6 6-6 6" />,
  imagem: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></>),
  texto: <path d="M4 6h16M4 12h10M4 18h14" />,
  mais: <path d="M12 5v14M5 12h14" />,
  engrenagem: (<><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z" /></>),
  olho: (<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  enviar: <path d="M12 20V4m-7 7 7-7 7 7" />,
  lixeira: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
  copiar: (<><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>),
  externo: <path d="M14 4h6v6m0-6-9 9M11 5H5v14h14v-6" />,
  relogio: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  camadas: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5" />,
  grafico: <path d="M4 20V10m6 10V4m6 16v-8m4 8H2" />,
  pincel: <path d="M14 4 20 10 9 21H3v-6L14 4Zm-3 3 6 6" />,
  foguete: <path d="M5 15c-1 2-1 4-1 5 1 0 3 0 5-1m-2-6 6-6c2-2 5-3 8-3 0 3-1 6-3 8l-6 6-5-5Zm7-4h.01M6 14l4 4" />,
};

export function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {TRACOS[nome]}
    </svg>
  );
}
