"use client";
/**
 * O som de "alguém está esperando" (US-017). Desligado por padrão e lembrado no navegador
 * (`localStorage`), porque quem trabalha com o painel aberto o dia inteiro não quer decidir isso a cada
 * carga — e quem divide a sala com outras pessoas não quer um toque que ninguém pediu.
 *
 * O toque é gerado na hora por `AudioContext`: são dois tons curtos, sem arquivo para baixar e sem
 * pedido de permissão de notificação. Um navegador que não deixa tocar (aba escondida, som bloqueado
 * até o primeiro clique) simplesmente não toca — nunca vira erro na tela.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CHAVE = "whatsapp-atendente:som-aviso";

/** Os dois tons do toque, em hertz, e quanto cada um dura. */
const TONS = [880, 1174.7];
const DURACAO_S = 0.16;

function tocarToque(): void {
  try {
    const ctx = new AudioContext();
    const inicio = ctx.currentTime;
    TONS.forEach((frequencia, i) => {
      const quando = inicio + i * DURACAO_S;
      const oscilador = ctx.createOscillator();
      const ganho = ctx.createGain();
      oscilador.type = "sine";
      oscilador.frequency.value = frequencia;
      // A rampa existe para o toque não estalar: um volume que começa e termina em zero soa como um
      // aviso, um que liga e desliga de uma vez soa como um defeito.
      ganho.gain.setValueAtTime(0.0001, quando);
      ganho.gain.exponentialRampToValueAtTime(0.16, quando + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, quando + DURACAO_S);
      oscilador.connect(ganho).connect(ctx.destination);
      oscilador.start(quando);
      oscilador.stop(quando + DURACAO_S);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 1000);
  } catch {
    // Som bloqueado pelo navegador: o vermelho da lista e o título da aba continuam avisando.
  }
}

function IconeSom({ ligado }: { ligado: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      {ligado ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="m16.5 9.5 5 5m0-5-5 5" />}
    </svg>
  );
}

/**
 * Devolve o botão pronto para a tela e o `tocar()` que ela chama quando alguém começa a esperar. O
 * estado mora aqui: quem usa não precisa saber que ele veio do `localStorage`.
 */
export function useSomDeAviso(): { Botao: React.ReactNode; tocar: () => void } {
  const [ligado, setLigado] = useState(false);
  const ligadoRef = useRef(false);

  // A leitura sai do corpo do efeito por um setTimeout(0) pela regra react-hooks/set-state-in-effect, e
  // acontece no navegador (o servidor não tem localStorage, e o primeiro desenho precisa bater com ele).
  useEffect(() => {
    const t = setTimeout(() => setLigado(localStorage.getItem(CHAVE) === "1"), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    ligadoRef.current = ligado;
  }, [ligado]);

  const tocar = useCallback(() => {
    if (ligadoRef.current) tocarToque();
  }, []);

  function alternar() {
    const novo = !ligado;
    setLigado(novo);
    localStorage.setItem(CHAVE, novo ? "1" : "0");
    // Ligar já toca uma vez: é assim que a pessoa confere que vai ouvir (e que o volume está bom).
    if (novo) tocarToque();
  }

  const Botao = (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={ligado}
      title={ligado ? "Tocar um som quando alguém começar a esperar: ligado" : "Tocar um som quando alguém começar a esperar: desligado"}
      className={`shrink-0 inline-grid place-items-center w-9 h-9 rounded-md border border-line cursor-pointer transition-colors ${ligado ? "text-accent bg-accent-soft border-accent" : "text-muted hover:text-ink hover:bg-bg"}`}
    >
      <IconeSom ligado={ligado} />
      <span className="sr-only">{ligado ? "Desligar o som de aviso" : "Ligar o som de aviso"}</span>
    </button>
  );

  return { Botao, tocar };
}
