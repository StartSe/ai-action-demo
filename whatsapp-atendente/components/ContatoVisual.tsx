"use client";
// Como um contato aparece na tela de Conversas: o avatar por iniciais e o desenho de 16 px do canal
// por onde ele escreveu. Os dois nasceram na lista (US-012) e são usados também pela conversa aberta
// (US-013) e pelo painel do contato (US-014) — por isso moram num arquivo só, e não dentro de uma tela.
//
// Foto de perfil não é guardada em lugar nenhum deste app (ver "Não fazer" da PRD): o avatar é sempre
// as iniciais do nome, ou um desenho de pessoa quando só existe o número.
import type { ReactNode } from "react";
import { rotuloOrigem } from "@/lib/rotulos";
import type { CanalOrigem } from "@/lib/types";

/** Até duas iniciais do nome; vazio quando não há nome (aí o avatar mostra o desenho de pessoa). */
export function iniciais(nome?: string): string {
  const limpo = nome?.trim();
  if (!limpo) return "";
  return limpo.split(/\s+/).slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? "").join("");
}

export function Avatar({ nome, tamanho = 40 }: { nome?: string; tamanho?: number }) {
  const letras = iniciais(nome);
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full bg-accent-soft text-accent-ink grid place-items-center font-bold"
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }}
    >
      {letras || (
        <svg width={Math.round(tamanho * 0.5)} height={Math.round(tamanho * 0.5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      )}
    </span>
  );
}

/**
 * Avatar do atendente virtual, ao lado das respostas dele na conversa aberta. É um desenho fixo (e não
 * as iniciais do nome) de propósito: ele marca, numa olhada, qual bolha foi escrita pela IA e qual foi
 * escrita por uma pessoa da equipe — que continua aparecendo com o avatar de iniciais.
 */
export function AvatarAtendente({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full bg-accent-soft text-accent-ink grid place-items-center"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg width={Math.round(tamanho * 0.6)} height={Math.round(tamanho * 0.6)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="8" width="16" height="11" rx="3" />
        <path d="M12 4.5V8M9 13h.01M15 13h.01M9.5 16.2h5" />
      </svg>
    </span>
  );
}

/** Desenho de cada canal, 16 px, sem rótulo ao lado: na largura da lista não cabe a palavra. O verde da
 * marca do WhatsApp entra só aqui — nunca como acento da tela. */
const DESENHOS_ORIGEM: Record<CanalOrigem, ReactNode> = {
  whatsapp: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366">
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a12 12 0 0 1-5.5-4.6c-.4-.6-.9-1.5-.9-2.4 0-.9.5-1.4.7-1.6.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.3.4c-.1.1-.3.3-.1.6a8 8 0 0 0 3.5 2.9c.3.1.5.1.6 0l.8-1c.2-.2.3-.2.6-.1l1.6.8c.3.1.4.2.5.3 0 .1 0 .6-.2 1.2Z" />
    </svg>
  ),
  simulador: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  ),
  mcp: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
      <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
      <path d="m18 16 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </svg>
  ),
  exemplo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
      <path d="M8 3h8M9.5 3v6.2L5 18.4A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.6L14.5 9.2V3" />
    </svg>
  ),
};

export function DesenhoOrigem({ origem }: { origem: CanalOrigem }) {
  return (
    <span className="shrink-0 grid place-items-center" role="img" aria-label={rotuloOrigem(origem)} title={rotuloOrigem(origem)}>
      {DESENHOS_ORIGEM[origem] ?? DESENHOS_ORIGEM.simulador}
    </span>
  );
}
