"use client";

import { useState } from "react";
import { desenhoFonte, rotuloMidiaLida, tempoCurto } from "@/lib/rotulos";
import { rotuloMotivo } from "@/lib/transferencia";
import type { DetalhesResposta, FonteDaResposta } from "@/lib/types";

/**
 * "Por que respondeu assim": o que o atendente leu e fez para escrever aquela resposta, recolhido
 * embaixo da bolha dele. Aparece só nas respostas do atendente virtual — o que uma pessoa escreveu
 * não tem fonte, e a mensagem do cliente muito menos.
 *
 * Tudo aqui vem de `mensagens.detalhes` (lib/atendente.ts o monta na hora de responder): são as fontes
 * que o app ENVIOU ao atendente e as ferramentas que ele EXECUTOU, não uma medição de dentro do
 * modelo. Os textos falam nesses termos de propósito — "enviei isto" é verdade, "ele usou isto" não
 * seria. O objetivo é um só: a pessoa descobre ONDE corrigir a base em vez de adivinhar.
 */
export function PorQueRespondeu({ detalhes, claro = false }: { detalhes: DetalhesResposta | undefined; claro?: boolean }) {
  const [aberto, setAberto] = useState(false);
  if (!detalhes) return null;

  return (
    <span className="block px-1 w-full">
      <button
        type="button"
        className={`text-[11px] font-semibold underline underline-offset-2 ${claro ? "text-white/80" : "text-muted hover:text-ink"}`}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        Por que respondeu assim
      </button>
      {aberto && <Bloco detalhes={detalhes} />}
    </span>
  );
}

function Bloco({ detalhes }: { detalhes: DetalhesResposta }) {
  const { fontes, ferramentas, transferencia, midia, rajada, tempoMs, modelo } = detalhes;
  return (
    <span className="mt-1.5 block rounded-lg border border-line bg-surface p-2.5 text-[11.5px] leading-snug text-ink">
      {fontes.length > 0 ? (
        <span className="block">
          <span className="block font-semibold mb-1">O que ele leu para responder</span>
          {fontes.map((f, i) => (
            <Fonte key={`${f.tipo}-${i}`} fonte={f} />
          ))}
        </span>
      ) : (
        <span className="block text-muted">Nada da base foi usado: ele respondeu sem material de apoio.</span>
      )}

      {ferramentas.length > 0 && (
        <span className="mt-2 block">
          <span className="block font-semibold mb-1">O que ele consultou</span>
          {ferramentas.map((f, i) => (
            <span key={`${f.nome}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5">
              <span>🔎 {f.nome}</span>
              <span className={f.ok ? "text-accent-ink font-semibold" : "text-danger font-semibold"}>
                {f.ok ? "respondeu" : "não respondeu"}
              </span>
              {f.resumo && <span className="text-muted italic">{f.resumo}</span>}
            </span>
          ))}
        </span>
      )}

      {transferencia && (
        <span className="mt-2 block">
          <span className="font-semibold">Pediu ajuda de uma pessoa:</span> {rotuloMotivo(transferencia.motivo)}
        </span>
      )}

      {midia?.length ? (
        <span className="mt-2 block text-muted">{midia.map(rotuloMidiaLida).join(" · ")}</span>
      ) : null}

      {rajada > 1 && (
        <span className="mt-2 block text-muted">Respondeu {rajada} mensagens do cliente de uma vez.</span>
      )}

      {/* Linha discreta do fim: o tempo que ele levou e com o que a resposta foi escrita. É o único
          lugar da tela com um nome técnico, e é o que a equipe pede quando uma resposta sai estranha. */}
      <span className="mt-2 block text-[11px] text-muted">
        {tempoCurto(tempoMs)} · {modelo}
      </span>
    </span>
  );
}

/** O que cada tipo de fonte oferece como atalho: corrigir a base, ou ver o material importado. */
const ACAO_DA_FONTE: Partial<Record<FonteDaResposta["tipo"], string>> = {
  base: "Editar base",
  documento: "Ver documento",
};

function Fonte({ fonte }: { fonte: FonteDaResposta }) {
  const acao = ACAO_DA_FONTE[fonte.tipo];
  return (
    <span className="mb-1 block last:mb-0">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span>
          {desenhoFonte(fonte.tipo)} {fonte.nome}
        </span>
        {acao && (
          <a className="font-semibold text-accent-ink underline underline-offset-2" href="/assistente#conhecimento">
            {acao}
          </a>
        )}
      </span>
      {/* `line-clamp-2` já define o display; um `block` junto brigaria com ele na ordem do CSS gerado
          (e o trecho sairia com seis linhas dentro do celular do simulador). */}
      {fonte.trecho && <span className="line-clamp-2 text-muted italic">{fonte.trecho}</span>}
    </span>
  );
}
