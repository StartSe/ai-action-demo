// Declaração de tipo do elemento customizado do widget oficial da ElevenLabs (script embutido por
// components/SalaAgente.tsx e components/SalaSimulacao.tsx), para o TypeScript reconhecer <elevenlabs-convai> como elemento JSX válido.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "agent-id": string;
        "dynamic-variables"?: string;
      };
    }
  }
}
