"use client";
/**
 * Atualização em tempo real das telas (0.3.0, US-004). O servidor avisa "esta conversa mudou" por
 * `GET /api/eventos` (`EventSource`), e quem escuta consulta a rota que já usava — o aviso nunca traz
 * dados, só o número da conversa. Sem isso, uma mensagem nova só aparecia na consulta seguinte.
 *
 * Uma conexão por ABA, não por componente: a tela de Conversas tem a lista e a conversa aberta
 * escutando ao mesmo tempo, e o navegador limita quantas conexões abrir por endereço. Por isso o
 * `EventSource` mora no módulo e os componentes só entram e saem da lista de ouvintes.
 *
 * Quando o fluxo cai, a reconexão espera 1, 2, 5 e 10 s; depois de três falhas seguidas o módulo avisa
 * quem escuta para voltar a consultar de tempos em tempos (`INTERVALO_RESERVA_MS`), que é o
 * comportamento que as telas tinham antes desta história. O fluxo também é fechado enquanto a aba está
 * escondida: uma aba esquecida aberta não deve segurar uma conexão a noite inteira.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type EventoDaTela =
  | { tipo: "conversa"; numero: string }
  | { tipo: "conexao" }
  | { tipo: "atencao"; numero: string };

/** De quanto em quanto tempo consultar quando o fluxo não está de pé. */
export const INTERVALO_RESERVA_MS = 30_000;

/** Espera antes de cada nova tentativa de ligar o fluxo (a última se repete). */
const ESPERAS_MS = [1000, 2000, 5000, 10_000];

/** Quantas falhas seguidas antes de avisar as telas para voltarem a consultar sozinhas. */
const FALHAS_ATE_RESERVA = 3;

const TIPOS = ["conversa", "conexao", "atencao"] as const;

/**
 * A prévia do catálogo (`?exemplo=1&captura=1`, o workflow de publicação) é uma FOTO: o Chromium
 * headless só salva a imagem quando a página para de carregar, e um `text/event-stream` nunca termina
 * — com o fluxo aberto a captura ficava pendurada até alguém cancelar a execução. Na captura a tela
 * nasce completa e nada muda enquanto ela é tirada, então não há o que escutar. Sem fluxo e sem falha,
 * `reserva` também fica em `false`: nenhuma consulta de reserva atrás da foto.
 */
export function fluxoDesligado(busca: string): boolean {
  return new URLSearchParams(busca).has("captura");
}

type Estado = { aoVivo: boolean; reserva: boolean };

const ouvintes = new Set<(evento: EventoDaTela) => void>();
const observadores = new Set<(estado: Estado) => void>();

let fonte: EventSource | null = null;
let tentativa: ReturnType<typeof setTimeout> | null = null;
let falhas = 0;
let estado: Estado = { aoVivo: false, reserva: false };
let escutandoAba = false;

function definirEstado(novo: Estado): void {
  if (estado.aoVivo === novo.aoVivo && estado.reserva === novo.reserva) return;
  estado = novo;
  for (const observador of observadores) observador(estado);
}

function fecharFluxo(): void {
  if (tentativa) {
    clearTimeout(tentativa);
    tentativa = null;
  }
  fonte?.close();
  fonte = null;
}

function abrirFluxo(): void {
  if (fonte || ouvintes.size === 0 || typeof document === "undefined" || document.hidden) return;
  if (fluxoDesligado(location.search)) return;
  const nova = new EventSource("/api/eventos");
  fonte = nova;

  nova.onopen = () => {
    falhas = 0;
    definirEstado({ aoVivo: true, reserva: false });
  };

  const receber = (ev: MessageEvent<string>) => {
    let evento: EventoDaTela;
    try {
      evento = JSON.parse(ev.data) as EventoDaTela;
    } catch {
      return; // Linha estranha no fluxo: a próxima vale.
    }
    for (const ouvinte of [...ouvintes]) ouvinte(evento);
  };
  for (const tipo of TIPOS) nova.addEventListener(tipo, receber as EventListener);

  nova.onerror = () => {
    // O `EventSource` reconecta sozinho, mas no ritmo do navegador: aqui a espera é nossa, para uma
    // queda do servidor não virar uma rajada de tentativas.
    nova.close();
    if (fonte === nova) fonte = null;
    falhas += 1;
    definirEstado({ aoVivo: false, reserva: falhas >= FALHAS_ATE_RESERVA });
    if (ouvintes.size === 0 || document.hidden) return;
    tentativa = setTimeout(() => {
      tentativa = null;
      abrirFluxo();
    }, ESPERAS_MS[Math.min(falhas - 1, ESPERAS_MS.length - 1)]);
  };
}

function aoTrocarDeAba(): void {
  if (document.hidden) {
    fecharFluxo();
    definirEstado({ aoVivo: false, reserva: estado.reserva });
  } else {
    abrirFluxo();
  }
}

function entrar(ouvinte: (evento: EventoDaTela) => void): () => void {
  ouvintes.add(ouvinte);
  if (!escutandoAba && typeof document !== "undefined") {
    escutandoAba = true;
    document.addEventListener("visibilitychange", aoTrocarDeAba);
  }
  abrirFluxo();
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0) {
      fecharFluxo();
      falhas = 0;
      definirEstado({ aoVivo: false, reserva: false });
    }
  };
}

/**
 * Escuta os avisos do servidor. `aoVivo` diz se o fluxo está de pé (é o que o rodapé da lista mostra) e
 * `reserva` diz que ele não está e a tela deve voltar a consultar de `INTERVALO_RESERVA_MS` em
 * `INTERVALO_RESERVA_MS`.
 */
export function useEventos(aoEvento: (evento: EventoDaTela) => void): Estado {
  const [atual, setAtual] = useState<Estado>(estado);
  const aoEventoRef = useRef(aoEvento);
  useEffect(() => {
    aoEventoRef.current = aoEvento;
  }, [aoEvento]);

  useEffect(() => {
    const observador = (novo: Estado) => setAtual(novo);
    observadores.add(observador);
    const sair = entrar((evento) => aoEventoRef.current(evento));
    return () => {
      observadores.delete(observador);
      sair();
    };
  }, []);

  return atual;
}

/**
 * Junta uma rajada de avisos numa recarga só: uma mensagem que chega grava a mensagem, mexe no status e
 * marca a entrega, e cada gravação é um aviso. Sem isso a tela consultaria três vezes o mesmo estado.
 */
export function useRecargaJunta(carregar: () => void, esperaMs = 150): () => void {
  const carregarRef = useRef(carregar);
  useEffect(() => {
    carregarRef.current = carregar;
  }, [carregar]);

  const agendado = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (agendado.current) clearTimeout(agendado.current);
    },
    []
  );

  return useCallback(() => {
    if (agendado.current) clearTimeout(agendado.current);
    agendado.current = setTimeout(() => {
      agendado.current = null;
      carregarRef.current();
    }, esperaMs);
  }, [esperaMs]);
}
