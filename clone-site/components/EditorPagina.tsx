"use client";
// Edição por instrução e versões, abaixo da prévia: campo "O que mudar" com "Aplicar", o atalho "Trocar os
// textos pelos da minha empresa" (uma edição por instrução pré-montada no servidor) e a lista "Versões" com
// "Voltar para esta". Toda mudança vira uma versão nova gravada no histórico; a prévia mostra sempre a última.
import { useState, type FormEvent } from "react";
import { Aviso, Field } from "./ui";
import { data } from "@/lib/formato";
import type { Meta } from "@/lib/ai";
import type { Pagina, Versao } from "@/lib/types";

type Ocupado = null | "aplicar" | "trocar" | number;

export function EditorPagina({ pagina, demo = false, onAtualizada }: { pagina: Pagina; demo?: boolean; onAtualizada: (pagina: Pagina, meta?: Meta) => void }) {
  const [instrucao, setInstrucao] = useState("");
  const [trocarAberto, setTrocarAberto] = useState(false);
  const [empresa, setEmpresa] = useState("");
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const atual = pagina.versoes[pagina.versoes.length - 1];
  const versoes = [...pagina.versoes].reverse();

  async function chamar(caminho: string, corpo: unknown, marcador: Ocupado) {
    setOcupado(marcador);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch(`/api/pagina/${pagina.id}/${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível aplicar a mudança.");
      onAtualizada(resposta.pagina, resposta.meta);
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function aplicar(e: FormEvent) {
    e.preventDefault();
    if (!instrucao.trim()) { setAviso("Escreva o que mudar na página."); return; }
    if (await chamar("editar", { instrucao, html: atual.html }, "aplicar")) setInstrucao("");
  }

  async function trocarTextos(e: FormEvent) {
    e.preventDefault();
    if (!empresa.trim()) { setAviso("Conte em uma frase o que a sua empresa faz."); return; }
    if (await chamar("editar", { empresa, html: atual.html }, "trocar")) setTrocarAberto(false);
  }

  function voltar(v: Versao) {
    chamar("voltar", { n: v.n }, v.n);
  }

  const bloqueado = ocupado !== null;

  return (
    <section className="mt-6 flex flex-col gap-5" aria-label="Editar a página">
      {/* Em demonstração a mudança é fixa (lib/demo.ts), não vem da instrução: dizer isso antes do clique
          evita a pessoa concluir que a IA ignorou o que ela escreveu. */}
      {demo && (
        <Aviso>
          Sem a inteligência artificial conectada, a mudança aplicada é só ilustrativa: ela mostra como funcionam as versões, mas não segue o que você escrever.{" "}
          <a className="btn-link text-[13px]" href="/setup#openrouter">Conectar a inteligência artificial</a>
        </Aviso>
      )}
      <form onSubmit={aplicar} className="bg-surface border border-line rounded-card p-4">
        <Field label="O que mudar" htmlFor="instrucao-edicao" hint="Descreva a mudança em português. A página inteira é reescrita mantendo o que você não citou.">
          <textarea
            id="instrucao-edicao"
            className="input min-h-20 resize-y"
            placeholder="Ex.: deixe o cabeçalho escuro e troque o botão principal por 'Fale com a gente'."
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            disabled={bloqueado}
          />
        </Field>
        <div className="flex gap-2 max-md:flex-col">
          <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={bloqueado}>{ocupado === "aplicar" ? "Aplicando a mudança" : "Aplicar"}</button>
          <button type="button" className="btn-ghost" disabled={bloqueado} aria-expanded={trocarAberto} aria-controls="trocar-textos" onClick={() => { setTrocarAberto((a) => !a); setAviso(null); }}>
            Trocar os textos pelos da minha empresa
          </button>
        </div>
        {aviso && <p className="text-danger text-[13px] mt-2" role="alert">{aviso}</p>}
      </form>

      {trocarAberto && (
        <form id="trocar-textos" onSubmit={trocarTextos} className="bg-surface border border-line rounded-card p-4">
          <Field label="O que a empresa faz" htmlFor="empresa-edicao" hint="Títulos, subtítulos e chamadas são reescritos para a sua empresa. A estrutura e as cores ficam como estão.">
            <textarea
              id="empresa-edicao"
              className="input min-h-20 resize-y"
              placeholder="Ex.: clínica odontológica em Curitiba, com foco em implantes e atendimento no mesmo dia."
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              disabled={bloqueado}
            />
          </Field>
          <div className="flex gap-2 max-md:flex-col">
            <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={bloqueado}>{ocupado === "trocar" ? "Reescrevendo os textos" : "Reescrever os textos"}</button>
            <button type="button" className="btn-ghost" disabled={bloqueado} onClick={() => setTrocarAberto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {bloqueado && <p className="text-muted text-[13.5px]" role="status">{typeof ocupado === "number" ? `Voltando para a versão ${ocupado}...` : "A página está sendo reescrita. Isso leva alguns segundos."}</p>}
      {erro && <p className="text-danger text-[13.5px]" role="alert">{erro}</p>}

      <div>
        <h3 className="text-[14px] font-bold mb-2">Versões</h3>
        <ol className="flex flex-col divide-y divide-line border border-line rounded-card bg-surface" aria-label="Versões da página">
          {versoes.map((v) => {
            const ehAtual = v.n === atual.n;
            return (
              <li key={v.n} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] max-md:flex-wrap">
                <div className="min-w-0 flex-1">
                  <span className="font-bold">Versão {v.n}</span>
                  {ehAtual && <span className="ml-2 text-[11.5px] font-bold uppercase tracking-wide text-accent-ink">atual</span>}
                  <p className="text-ink truncate" title={v.instrucao}>{v.instrucao}</p>
                </div>
                <span className="text-muted shrink-0">{data(v.criadoEm, { comHora: true })}</span>
                {!ehAtual && (
                  <button type="button" className="btn-ghost !px-3 !py-1.5 !text-[13px] shrink-0" disabled={bloqueado} onClick={() => voltar(v)}>
                    Voltar para esta
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
