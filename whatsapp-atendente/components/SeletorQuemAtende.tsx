"use client";

// O seletor "Quem atende" do cabeçalho da conversa aberta: em um clique, o atendimento passa do
// atendente virtual para a pessoa e volta. Ele substituiu os botões "Assumir atendimento" e
// "Devolver para a IA" espalhados pela tela — quem está no comando é um estado, não duas ações
// opostas em cantos diferentes. Escrever no campo de resposta também assume (ConversaAberta), e é por
// isso que este seletor só precisa mostrar e trocar, nunca explicar.
import { useRef } from "react";
import { AvatarAtendente } from "./ContatoVisual";
import { classeStatus } from "@/lib/rotulos";
import type { StatusConversa } from "@/lib/types";

/** Ícone de quem atende do lado de cá: uma pessoa, do mesmo tamanho do desenho do atendente. */
function IconePessoa({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full bg-[#e8effb] text-[#1c4f9c] grid place-items-center"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg width={Math.round(tamanho * 0.62)} height={Math.round(tamanho * 0.62)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 19.5a7 7 0 0 1 14 0" />
      </svg>
    </span>
  );
}

export function SeletorQuemAtende({
  status,
  atendente,
  agindo,
  onAssumir,
  onDevolver,
}: {
  status: StatusConversa;
  /** O nome que a empresa deu ao atendente virtual; vazio cai numa expressão neutra. */
  atendente: string;
  /** Uma ação da conversa já está em andamento: o seletor espera a vez. */
  agindo: boolean;
  onAssumir: () => void;
  /** Devolver para o atendente virtual — é também o que "Reabrir" faz numa conversa resolvida. */
  onDevolver: () => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const nomeAtendente = atendente.trim() || "Atendente virtual";
  const resolvida = status === "resolvida";
  const daPessoa = status === "humano";
  // Numa conversa resolvida ninguém está atendendo: nenhuma das duas opções aparece marcada, e o
  // caminho de volta é "Reabrir" — dizer que a IA está cuidando de algo que ninguém está cuidando
  // seria mentira na tela.
  const opcoes = [
    { chave: "ia" as const, rotulo: nomeAtendente, marcada: !resolvida && !daPessoa, icone: <AvatarAtendente tamanho={22} />, aoEscolher: onDevolver },
    { chave: "voce" as const, rotulo: "Você", marcada: daPessoa, icone: <IconePessoa />, aoEscolher: onAssumir },
  ];

  /** Setas andam entre as duas opções e já trocam quem atende, como num grupo de opções comum. */
  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(evento.key)) return;
    evento.preventDefault();
    const proximo = indice === 0 ? 1 : 0;
    refs.current[proximo]?.focus();
    if (!opcoes[proximo].marcada) opcoes[proximo].aoEscolher();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        role="radiogroup"
        aria-label="Quem atende"
        aria-disabled={resolvida || undefined}
        className={`flex items-center gap-1 rounded-chip border border-line bg-bg p-1 ${resolvida ? "opacity-60" : ""}`}
      >
        {opcoes.map((opcao, i) => (
          <button
            key={opcao.chave}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={opcao.marcada}
            disabled={resolvida || agindo}
            tabIndex={opcao.marcada || (resolvida && i === 0) ? 0 : -1}
            onKeyDown={(e) => aoTeclar(e, i)}
            onClick={() => {
              if (!opcao.marcada) opcao.aoEscolher();
            }}
            className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-chip text-[13px] font-semibold whitespace-nowrap transition-colors disabled:cursor-default ${
              opcao.marcada ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {opcao.icone}
            <span className="max-w-[140px] truncate">{opcao.rotulo}</span>
          </button>
        ))}
      </div>

      {status === "atencao" && <span className={classeStatus("atencao")}>precisa de você</span>}
      {resolvida && (
        <>
          <span className={classeStatus("resolvida")}>Resolvida</span>
          <button type="button" className="btn-link" onClick={onDevolver} disabled={agindo}>
            Reabrir
          </button>
        </>
      )}
    </div>
  );
}
