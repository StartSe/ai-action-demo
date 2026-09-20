"use client";
import { useEffect, useState } from "react";
import { requisitar } from "@/lib/http-cliente";
import type { AssessmentPainel } from "@/lib/painel";
import type { Resposta } from "@/lib/types";

export function RespostasGrupo({
  assessment,
}: {
  assessment: AssessmentPainel;
}) {
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<{
    respostas: Resposta[] | null;
    carregando: boolean;
    erro: string;
  }>({ respostas: null, carregando: true, erro: "" });

  useEffect(() => {
    const controlador = new AbortController();
    const inicio = setTimeout(() => {
      setEstado((anterior) => ({ ...anterior, carregando: true }));
      requisitar<{ respostas: Resposta[] }>(
        `/api/bussola/link/${assessment.codigo}/respostas`,
        { signal: controlador.signal },
      )
        .then(({ respostas }) => {
          if (!controlador.signal.aborted)
            setEstado({ respostas, carregando: false, erro: "" });
        })
        .catch(() => {
          if (!controlador.signal.aborted)
            setEstado((anterior) => ({
              ...anterior,
              carregando: false,
              erro: "Não foi possível carregar as respostas deste grupo.",
            }));
        });
    }, 0);
    return () => {
      clearTimeout(inicio);
      controlador.abort();
    };
  }, [assessment, tentativa]);

  return (
    <>
      <h4>Respostas do grupo</h4>
      <p className="small-note">
        Contagem de envios, sem identificação individual. Não representa pessoas
        únicas verificadas.
      </p>
      {estado.erro && (
        <div className="obs-alert error" role="alert">
          <div>
            <p>{estado.erro}</p>
            {estado.respostas !== null && (
              <p>Exibindo as respostas da última consulta bem-sucedida.</p>
            )}
          </div>
          <button
            disabled={estado.carregando}
            onClick={() => setTentativa((anterior) => anterior + 1)}
          >
            {estado.carregando
              ? "Tentando novamente…"
              : "Tentar carregar respostas"}
          </button>
        </div>
      )}
      {estado.respostas === null ? (
        estado.carregando && <p role="status">Carregando respostas…</p>
      ) : estado.respostas.length === 0 ? (
        <p className="small-note">O grupo ainda não respondeu.</p>
      ) : (
        <div className="response-list" aria-label="Respostas recebidas">
          {estado.respostas.map((resposta, indice) => (
            <div key={resposta.id}>
              <span>{String(indice + 1).padStart(2, "0")}</span>
              <strong>
                {resposta.respondente?.area || "Área não informada"}
              </strong>
              <span>
                {resposta.respondente?.cargo || "Cargo não informado"}
              </span>
              <time dateTime={resposta.criadoEm}>
                {new Date(resposta.criadoEm).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                })}
              </time>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
