"use client";
// Os três componentes base que o desenho deste app pede e que a suíte não tinha: campo numérico com
// unidade embutida, o "por quê?" inline e a etiqueta de estado.
import { useId, useState, type ReactNode } from "react";
import { EXPLICACAO_ESTADO, ROTULO_ESTADO } from "@/lib/rotulos";
import type { Estado } from "@/lib/precificacao";

/** "12,50" e "12.50" viram 12,5. String vazia vira 0 — nunca NaN chegando no motor. */
export function lerNumero(texto: string): number {
  const limpo = texto.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** O número como a pessoa digitaria: vírgula decimal. Com `fixo`, sempre com as casas pedidas —
 * dinheiro se escreve "R$ 17,00", não "R$ 17". Sem `fixo`, corta zeros à toa: uma quantidade de
 * 500 g não vira "500,000". */
function escrever(n: number | undefined, casas: number, fixo: boolean): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "";
  if (fixo) return n.toFixed(casas).replace(".", ",");
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(casas).replace(/0+$/, "").replace(/\.$/, "");
  return texto.replace(".", ",");
}

/**
 * Campo numérico com a unidade dentro da moldura e teclado numérico no celular.
 *
 * Guarda o texto digitado enquanto o campo está em foco: sem isso, digitar "1," reformata para "1"
 * e come a vírgula que a pessoa acabou de apertar. Ao sair do campo, volta a mostrar o valor
 * formatado a partir do número de verdade.
 */
export function CampoNumero({
  valor,
  onValor,
  unidade,
  unidadeAntes = false,
  casas = 2,
  id,
  placeholder,
  disabled,
  rotuloAcessivel,
  className = "",
  grande = false,
}: {
  valor: number | undefined;
  onValor: (n: number) => void;
  unidade: string;
  /** Unidades de dinheiro vêm antes do número ("R$ 12,50"); as demais, depois ("120 g"). */
  unidadeAntes?: boolean;
  casas?: number;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  rotuloAcessivel?: string;
  className?: string;
  /** O preço escolhido da Bancada: número grande, o único desse tamanho na tela. */
  grande?: boolean;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  // Dinheiro (a unidade vem antes) mostra sempre os centavos; quantidade e percentual, não.
  const texto = rascunho ?? escrever(valor, casas, unidadeAntes);
  const sufixo = <span className={`unidade ${grande ? "!text-[18px] font-semibold" : ""}`}>{unidade}</span>;

  return (
    <div className={`campo-unidade ${disabled ? "opacity-60" : ""} ${grande ? "!py-2" : ""} ${className}`}>
      {unidadeAntes && sufixo}
      <input
        id={id}
        className={grande ? "cifra-grande" : undefined}
        type="text"
        inputMode="decimal"
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={rotuloAcessivel}
        onChange={(e) => {
          setRascunho(e.target.value);
          onValor(lerNumero(e.target.value));
        }}
        onBlur={() => setRascunho(null)}
      />
      {!unidadeAntes && sufixo}
    </div>
  );
}

/** Campo de percentual: a pessoa digita 20 e o app guarda 0,2. */
export function CampoPercentual({ valor, onValor, id, disabled, rotuloAcessivel }: { valor: number | undefined; onValor: (fracao: number) => void; id?: string; disabled?: boolean; rotuloAcessivel?: string }) {
  return (
    <CampoNumero
      id={id}
      unidade="%"
      casas={2}
      disabled={disabled}
      rotuloAcessivel={rotuloAcessivel}
      valor={valor === undefined ? undefined : valor * 100}
      onValor={(n) => onValor(n / 100)}
    />
  );
}

/**
 * O "por quê?" de um número derivado: um disclosure inline que abre a conta com os valores do
 * próprio usuário. Sem tooltip e sem modal, por decisão de produto — uma conta que some quando o
 * ponteiro sai não é uma conta que dá para conferir.
 */
export function PorQue({ children, rotulo = "por quê?" }: { children: ReactNode; rotulo?: string }) {
  return (
    <details className="porque">
      <summary>{rotulo}</summary>
      <div className="conta">{children}</div>
    </details>
  );
}

/** Etiqueta de estado. A cor vem do atributo `data-estado`; nenhum componente escolhe cor na mão. */
export function Estampa({ estado, titulo }: { estado: Estado; titulo?: boolean }) {
  return (
    <span className="estado" data-estado={estado} title={titulo ? EXPLICACAO_ESTADO[estado] : undefined}>
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

/** Rótulo de campo com uma única linha de ajuda (o limite que o padrão da suíte estabelece). */
export function Campo({ rotulo, para, ajuda, children }: { rotulo: string; para?: string; ajuda?: string; children: ReactNode }) {
  const gerado = useId();
  const alvo = para ?? gerado;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={alvo} className="text-[13px] font-semibold text-ink">
        {rotulo}
      </label>
      {children}
      {ajuda && <p className="apoio">{ajuda}</p>}
    </div>
  );
}
