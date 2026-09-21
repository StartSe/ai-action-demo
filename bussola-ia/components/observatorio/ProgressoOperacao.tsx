"use client";

import { useEffect, useRef, useState } from "react";

/** Mostra apenas a espera observada pelo navegador, sem simular etapas da IA. */
export function ProgressoOperacao({
  titulo,
  descricao,
  aoCancelar,
}: {
  titulo: string;
  descricao: string;
  aoCancelar?: () => void;
}) {
  const [inicio] = useState(() => Date.now());
  const [segundos, setSegundos] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current?.getClientRects().length) ref.current.focus();
    const timer = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio) / 1000));
    }, 1000);
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", aoSair);
    };
  }, [inicio]);
  return (
    <div className="operation-progress" tabIndex={-1} ref={ref}>
      <span className="loading-orbit" aria-hidden="true" />
      <div className="operation-progress-copy">
        <div role="status" aria-live="polite" aria-atomic="true">
          <strong>{titulo}</strong>
          <p>{descricao}</p>
          {segundos >= 30 && (
            <p className="operation-delay">
              Ainda aguardamos a resposta. Está levando mais tempo que o
              habitual.
              {aoCancelar
                ? " Você pode continuar aguardando ou cancelar a espera."
                : " Mantenha esta página aberta para conferir o resultado."}
            </p>
          )}
        </div>
        <span className="operation-timer" role="timer" aria-live="off">
          Tempo de espera: {Math.floor(segundos / 60)}:
          {String(segundos % 60).padStart(2, "0")}
        </span>
        {aoCancelar && (
          <button type="button" className="text-link" onClick={aoCancelar}>
            Cancelar espera
          </button>
        )}
      </div>
    </div>
  );
}
