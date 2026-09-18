"use client";
// Passo 4 do assistente de nova prospecção (US-012): os campos mudam conforme o modo escolhido no
// passo 3, sempre pré-preenchidos com os valores do ICP escolhido no passo 1 — alterar aqui nunca
// altera o ICP salvo (é por isso que este componente recebe `icp` só para ler o valor inicial, nunca
// para escrever de volta nele). `CriteriosBusca`/`criteriosIniciais` ainda não persistem em lugar
// nenhum: a entidade `Prospeccao` só nasce na US-013, que decide como este objeto entra em `criterios`.
import { useState, type KeyboardEvent } from "react";
import { CampoLista } from "@/components/CampoLista";
import { Field } from "@/components/ui";
import type { ICP, Jornada, ModoProspeccao } from "@/lib/types";

export type CriteriosBusca = {
  segmento: string;
  localizacao: string;
  porte: string;
  cargo: string;
  empresaNome: string;
  ocupacao: string;
  interesses: string[];
  contexto: string;
  recorte: string;
  sinais: string[];
  somenteRecentes: boolean;
};

export function criteriosIniciais(icp: ICP, modo: ModoProspeccao, jornada: Jornada): CriteriosBusca {
  const c = icp.criterios;
  return {
    segmento: c.setor ?? "",
    localizacao: c.localizacao ?? "",
    porte: c.porte ?? "",
    cargo: icp.personas[0] ?? "",
    empresaNome: "",
    ocupacao: c.ocupacao ?? "",
    interesses: c.interesses ?? [],
    contexto: c.contexto ?? "",
    recorte: jornada === "b2b" ? c.setor ?? "" : c.localizacao ?? "",
    sinais: [...icp.sinais],
    somenteRecentes: modo === "oportunidades",
  };
}

function SinaisSelecionaveis({ opcoes, selecionados, onChange }: { opcoes: string[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  const [novo, setNovo] = useState("");
  const todos = Array.from(new Set([...opcoes, ...selecionados]));

  function alternar(sinal: string) {
    onChange(selecionados.includes(sinal) ? selecionados.filter((s) => s !== sinal) : [...selecionados, sinal]);
  }

  function adicionar() {
    const v = novo.trim();
    if (v && !selecionados.includes(v)) onChange([...selecionados, v]);
    setNovo("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    adicionar();
  }

  return (
    <div className="flex flex-col gap-2">
      {todos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {todos.map((sinal) => (
            <button
              key={sinal}
              type="button"
              aria-pressed={selecionados.includes(sinal)}
              className={`cursor-pointer ${selecionados.includes(sinal) ? "chip-positivo" : "chip-cinza"}`}
              onClick={() => alternar(sinal)}
            >
              {sinal}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input className="input" placeholder="Outro sinal" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={aoTeclar} />
        <button type="button" className="btn-secundario !w-auto shrink-0" onClick={adicionar}>+ Adicionar</button>
      </div>
    </div>
  );
}

export function CriteriosProspeccaoForm({
  modo,
  jornada,
  icp,
  valor,
  onChange,
}: {
  modo: ModoProspeccao;
  jornada: Jornada;
  icp: ICP;
  valor: CriteriosBusca;
  onChange: (v: CriteriosBusca) => void;
}) {
  function campo<K extends keyof CriteriosBusca>(chave: K, novoValor: CriteriosBusca[K]) {
    onChange({ ...valor, [chave]: novoValor });
  }

  const mostrarSinais = modo === "empresas" || modo === "oportunidades";

  return (
    <div className="card p-6 flex flex-col gap-4">
      {modo === "empresas" && (
        <>
          <Field label="Segmento" htmlFor="segmento" hint="Preenchido a partir do perfil ideal.">
            <input id="segmento" className="input" value={valor.segmento} onChange={(e) => campo("segmento", e.target.value)} />
          </Field>
          <Field label="Localização" htmlFor="localizacao">
            <input id="localizacao" className="input" value={valor.localizacao} onChange={(e) => campo("localizacao", e.target.value)} />
          </Field>
          <Field label="Porte" htmlFor="porte">
            <input id="porte" className="input" value={valor.porte} onChange={(e) => campo("porte", e.target.value)} />
          </Field>
        </>
      )}

      {modo === "pessoas" && jornada === "b2b" && (
        <>
          <Field label="Cargo" htmlFor="cargo">
            <input id="cargo" className="input" value={valor.cargo} onChange={(e) => campo("cargo", e.target.value)} />
          </Field>
          <Field label="Empresa ou segmento" htmlFor="segmento">
            <input id="segmento" className="input" value={valor.segmento} onChange={(e) => campo("segmento", e.target.value)} />
          </Field>
          <Field label="Localização" htmlFor="localizacao">
            <input id="localizacao" className="input" value={valor.localizacao} onChange={(e) => campo("localizacao", e.target.value)} />
          </Field>
        </>
      )}

      {modo === "pessoas" && jornada === "b2c" && (
        <>
          <Field label="Localização" htmlFor="localizacao">
            <input id="localizacao" className="input" value={valor.localizacao} onChange={(e) => campo("localizacao", e.target.value)} />
          </Field>
          <Field label="Profissão ou ocupação" htmlFor="ocupacao">
            <input id="ocupacao" className="input" value={valor.ocupacao} onChange={(e) => campo("ocupacao", e.target.value)} />
          </Field>
          <CampoLista id="interesses" label="Interesses" placeholder="Ex.: finanças pessoais" valores={valor.interesses} onChange={(v) => campo("interesses", v)} />
          <Field label="Contexto relevante" htmlFor="contexto">
            <textarea id="contexto" className="input min-h-[80px] resize-y" value={valor.contexto} onChange={(e) => campo("contexto", e.target.value)} />
          </Field>
        </>
      )}

      {modo === "empresa_unica" && (
        <Field label="Nome da empresa" htmlFor="empresaNome" hint="A empresa que você quer explorar.">
          <input id="empresaNome" className="input" placeholder="Ex.: Zetta Manutenção Industrial" value={valor.empresaNome} onChange={(e) => campo("empresaNome", e.target.value)} />
        </Field>
      )}

      {modo === "oportunidades" && (
        <Field label={jornada === "b2b" ? "Segmento" : "Localização"} htmlFor="recorte">
          <input id="recorte" className="input" value={valor.recorte} onChange={(e) => campo("recorte", e.target.value)} />
        </Field>
      )}

      {mostrarSinais && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Sinais de intenção</span>
          <SinaisSelecionaveis opcoes={icp.sinais} selecionados={valor.sinais} onChange={(v) => campo("sinais", v)} />
        </div>
      )}

      {mostrarSinais && (
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={valor.somenteRecentes} onChange={(e) => campo("somenteRecentes", e.target.checked)} />
          Incluir apenas quem tem sinais recentes (90 dias)
        </label>
      )}
    </div>
  );
}
