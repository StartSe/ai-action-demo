"use client";
// Os cartões da seção "Ferramentas" do passo 1 do Assistente: um por coisa que o atendente consegue
// fazer além de escrever. Cada cartão tem sempre a mesma forma (ícone no acento suave, título,
// interruptor à direita, uma frase de apoio de altura fixa e uma linha de estado embaixo), para a lista
// ser lida de uma vez, mesmo com os cartões em estados diferentes. Fica em `components/` — e não dentro
// de `Assistente.tsx` — porque é reaproveitado e porque todo texto de tela precisa passar pelo
// `scripts/verificar-jargao.mjs`, que varre este diretório.
import type { ReactNode } from "react";

/** Os desenhos dos cartões, um por ferramenta. Traço simples, herdando a cor do quadrado do acento. */
export type IconeFerramenta = "pessoa" | "contato" | "agenda" | "sistemas" | "midia";

const DESENHOS: Record<IconeFerramenta, ReactNode> = {
  pessoa: (
    <>
      <path d="M8 9a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 8 9Z" />
      <path d="M2.8 14.2c0-2.3 2.3-3.8 5.2-3.8s5.2 1.5 5.2 3.8" />
    </>
  ),
  contato: (
    <>
      <path d="M2.8 4.5h10.4v7.6H6.2L3.4 14v-1.9H2.8z" />
      <path d="M6 7.6h4" />
      <path d="M6 9.8h2.4" />
    </>
  ),
  agenda: (
    <>
      <path d="M3 4.4h10v9.2H3z" />
      <path d="M3 7h10" />
      <path d="M5.6 2.8v2.4M10.4 2.8v2.4" />
      <path d="M5.8 10.2h1.6" />
    </>
  ),
  sistemas: (
    <>
      <path d="M2.8 3.6h10.4v3.2H2.8z" />
      <path d="M2.8 9.2h10.4v3.2H2.8z" />
      <path d="M5 5.2h.01M5 10.8h.01" />
    </>
  ),
  midia: (
    <>
      <path d="M8 2.8v7.4" />
      <path d="M5.6 5.6v1.8M10.4 5.6v1.8" />
      <path d="M3.2 12.8h9.6" />
    </>
  ),
};

function Icone({ nome }: { nome: IconeFerramenta }) {
  return (
    <span className="w-9 h-9 shrink-0 rounded-[10px] bg-accent-soft text-accent-ink grid place-items-center" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {DESENHOS[nome]}
      </svg>
    </span>
  );
}

/**
 * Uma escolha de sim ou não com cara de interruptor: um `checkbox` de verdade por baixo (foco, teclado e
 * leitor de tela saem de graça) com o desenho por cima. Usado tanto à direita do título de um cartão
 * (sem texto) quanto em lista dentro dele (com título e apoio, nos três tipos de anexo).
 */
export function Interruptor({
  id,
  titulo,
  apoio,
  rotulo,
  ligado,
  onMudar,
}: {
  id: string;
  titulo?: string;
  apoio?: string;
  /** O que o leitor de tela ouve quando o interruptor não tem texto ao lado (o do topo do cartão). */
  rotulo?: string;
  ligado: boolean;
  onMudar: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 cursor-pointer ${titulo ? "" : "shrink-0"}`}>
      <input id={id} type="checkbox" className="sr-only peer" aria-label={titulo ? undefined : rotulo} checked={ligado} onChange={(e) => onMudar(e.target.checked)} />
      {/* O botão redondo é irmão do <input> só no desenho: quem manda na posição dele é o estado, não uma
          variante `peer-checked` — ela só alcança irmãos diretos, e ele é neto. O anel de foco, esse sim,
          vem do `peer` (a caixa está escondida, e sem ele ninguém veria onde o teclado parou). */}
      <span
        className={`mt-0.5 w-9 h-5 shrink-0 rounded-full transition-colors relative peer-focus-visible:outline-[3px] peer-focus-visible:outline-accent-soft ${ligado ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {titulo && (
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold">{titulo}</span>
          {apoio && <span className="block text-[12px] text-muted">{apoio}</span>}
        </span>
      )}
    </label>
  );
}

/** A linha de estado do rodapé do cartão: um ponto colorido e uma frase curta, mais o link quando falta
 * conectar alguma coisa. `tom` só muda a cor do ponto — a frase é que conta o que está acontecendo. */
export function EstadoFerramenta({ tom, texto, link }: { tom: "ok" | "falta" | "fixo"; texto: string; link?: { url: string; rotulo: string } }) {
  const cor = tom === "ok" ? "bg-ok" : tom === "falta" ? "bg-warn" : "bg-muted";
  return (
    <p className="text-[12px] flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-line">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cor}`} aria-hidden="true" />
      <span className="text-muted">{texto}</span>
      {link && (
        <a href={link.url} className="font-semibold text-accent-ink underline">
          {link.rotulo}
        </a>
      )}
    </p>
  );
}

/**
 * Um cartão da lista. `onMudar` ausente = ferramenta sem interruptor (é o caso de pedir ajuda de uma
 * pessoa, que é sempre ligada: transferir é o que impede o atendente de inventar uma resposta).
 * `children` é para o cartão que tem mais coisa dentro (os três tipos de anexo).
 */
export function CartaoFerramenta({
  icone,
  titulo,
  apoio,
  id,
  ligado,
  onMudar,
  estado,
  children,
}: {
  icone: IconeFerramenta;
  titulo: string;
  apoio: string;
  id?: string;
  ligado: boolean;
  onMudar?: (v: boolean) => void;
  estado?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex items-start gap-3">
        <Icone nome={icone} />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[14px]">{titulo}</h3>
          {/* Altura fixa: com frases de tamanhos diferentes, os interruptores de uma lista de cartões
              ficariam em alturas diferentes e a coluna deixaria de ser lida de cima a baixo. */}
          <p className="text-[12.5px] text-muted mt-1 min-h-[32px]">{apoio}</p>
        </div>
        {onMudar && id && <Interruptor id={id} rotulo={titulo} ligado={ligado} onMudar={onMudar} />}
      </div>
      {children}
      {estado}
    </div>
  );
}
