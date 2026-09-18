// Tipo do elemento do widget oficial da ElevenLabs, para o TypeScript reconhecer <elevenlabs-convai>
// como elemento JSX válido. O script que define o elemento é embutido pela própria sala do agente
// (components/SalaAgenteCandidato.tsx); aqui só se declara a forma dele.
//
// Ao contrário de lib/fala.d.ts, este arquivo TEM import/export: ele aumenta o módulo "react", e é
// esse aumento — não o escopo global — que o JSX consulta.
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
