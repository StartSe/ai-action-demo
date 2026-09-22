"use client";
/**
 * Quem está esperando uma pessoa, para o cabeçalho de qualquer tela (US-017). O cabeçalho precisa do
 * número em TODA tela — o título da aba é o aviso de quem está no Assistente ou em Relatórios com a aba
 * em segundo plano —, então quem consulta é o próprio `Topbar`, e não cada tela.
 *
 * Uma consulta por ABA, não por componente, no mesmo desenho de useEventos.ts: o estado mora no módulo e
 * os componentes só entram e saem da lista de observadores. Ela é refeita a cada aviso do servidor (uma
 * conversa mudou) e a cada minuto — o cruzamento do limite é passagem de tempo, não evento, então sem o
 * temporizador o vermelho só apareceria quando alguém escrevesse.
 */
import { useEffect, useState } from "react";
import { useEventos, type EventoDaTela } from "./useEventos";
import { AVISO_ESPERA_PADRAO } from "@/lib/types";

export type Espera = {
  /** Conversas que a IA passou para uma pessoa e ninguém assumiu (o contador do cabeçalho). */
  atencao: number;
  /** Todas as conversas paradas esperando alguém (inclui as assumidas com mensagem por ler). */
  esperando: number;
  /** Quantas dessas já passaram do limite da operação. */
  atrasadas: number;
  limiteMin: number;
};

/** De quanto em quanto tempo reconferir quem cruzou o limite sem nada ter acontecido no servidor. */
const INTERVALO_MS = 60_000;

const VAZIO: Espera = { atencao: 0, esperando: 0, atrasadas: 0, limiteMin: AVISO_ESPERA_PADRAO };

let estado: Espera = VAZIO;
const observadores = new Set<(e: Espera) => void>();
let relogio: ReturnType<typeof setInterval> | null = null;
let agendado: ReturnType<typeof setTimeout> | null = null;

function publicar(novo: Espera): void {
  if (estado.atencao === novo.atencao && estado.esperando === novo.esperando && estado.atrasadas === novo.atrasadas && estado.limiteMin === novo.limiteMin) return;
  estado = novo;
  for (const observador of observadores) observador(estado);
}

async function consultar(): Promise<void> {
  try {
    const r = await fetch("/api/conversas/esperando");
    if (!r.ok) return; // Sem sessão ou servidor fora do ar: o cabeçalho fica como estava, sem erro na tela.
    const dados = (await r.json()) as Partial<Espera>;
    publicar({
      atencao: Number(dados.atencao) || 0,
      esperando: Number(dados.esperando) || 0,
      atrasadas: Number(dados.atrasadas) || 0,
      limiteMin: Number(dados.limiteMin) || AVISO_ESPERA_PADRAO,
    });
  } catch {
    // Rede caiu: a próxima consulta resolve.
  }
}

/** Junta a rajada de avisos de uma mensagem só (gravação, status, entrega) numa consulta só. */
function recarregar(): void {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    consultar();
  }, 150);
}

function entrar(observador: (e: Espera) => void): () => void {
  observadores.add(observador);
  if (observadores.size === 1) {
    relogio = setInterval(() => {
      if (document.visibilityState === "visible") consultar();
    }, INTERVALO_MS);
  }
  recarregar();
  return () => {
    observadores.delete(observador);
    if (observadores.size === 0 && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  };
}

export function useEspera(): Espera {
  const [atual, setAtual] = useState<Espera>(estado);

  useEffect(() => entrar(setAtual), []);

  // Qualquer mudança numa conversa pode criar ou encerrar uma espera (transferir, assumir, responder,
  // resolver), então vale para o aviso tudo o que não é o da conexão do WhatsApp.
  useEventos((evento: EventoDaTela) => {
    if (evento.tipo === "conexao") return;
    recarregar();
  });

  return atual;
}
