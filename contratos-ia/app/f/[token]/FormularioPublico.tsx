"use client";
// Formulário público genérico (marca do app, título, campos declarados, botão "Enviar"), renderizado
// a partir do que o app registrou em lib/formularios.ts. Copie este arquivo junto com page.tsx sem alterar.
import { useState, type FormEvent } from "react";
import type { CampoFormulario } from "@/lib/formularios";

type Props = { token: string; marca: string; nome: string; titulo: string; descricao?: string; campos: CampoFormulario[] };

type Fase = "preenchendo" | "enviando" | "enviado" | "erro";

export function FormularioPublico({ token, marca, nome, titulo, descricao, campos }: Props) {
  const [dados, setDados] = useState<Record<string, string>>(() => Object.fromEntries(campos.map((c) => [c.chave, ""])));
  const [nomesArquivo, setNomesArquivo] = useState<Record<string, string>>({});
  const [armadilha, setArmadilha] = useState("");
  const [fase, setFase] = useState<Fase>("preenchendo");
  const [mensagemErro, setMensagemErro] = useState("");

  const set = (chave: string) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [chave]: e.target.value }));

  async function setArquivo(chave: string, arquivo: File | null) {
    if (!arquivo) return;
    const texto = await arquivo.text();
    setDados((d) => ({ ...d, [chave]: texto }));
    setNomesArquivo((n) => ({ ...n, [chave]: arquivo.name }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFase("enviando");
    try {
      const r = await fetch(`/api/f/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dados, armadilha }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível enviar sua resposta.");
      setFase("enviado");
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : "Erro inesperado.");
      setFase("erro");
    }
  }

  return (
    <div className="max-w-[560px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8">
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>

      {fase === "enviado" ? (
        <div className="card p-7 max-md:p-[22px] text-center">
          <h1 className="text-xl font-extrabold mb-1.5">Obrigado, sua resposta foi enviada.</h1>
          <p className="text-muted">Você já pode fechar esta página.</p>
        </div>
      ) : (
        <div className="card p-7 max-md:p-[22px]">
          <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">{titulo}</h1>
          {descricao && <p className="text-muted mb-6">{descricao}</p>}

          <form onSubmit={onSubmit}>
            {/* Honeypot: campo invisível para pessoas, atrativo para bots que preenchem tudo. */}
            <label className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
              Deixe este campo em branco
              <input tabIndex={-1} autoComplete="off" value={armadilha} onChange={(e) => setArmadilha(e.target.value)} />
            </label>

            {campos.map((campo) => (
              <div className="flex flex-col gap-1.5 mb-4" key={campo.chave}>
                <label htmlFor={campo.chave} className="text-[13px] font-semibold">{campo.rotulo}{!campo.obrigatorio && " (opcional)"}</label>
                {campo.tipo === "arquivo" ? (
                  <>
                    <input
                      id={campo.chave}
                      type="file"
                      className="input"
                      accept={campo.aceitar}
                      required={campo.obrigatorio}
                      onChange={(e) => setArquivo(campo.chave, e.target.files?.[0] ?? null)}
                    />
                    {nomesArquivo[campo.chave] && <p className="text-muted text-[12.5px]">Arquivo selecionado: {nomesArquivo[campo.chave]}</p>}
                  </>
                ) : campo.tipo === "textarea" ? (
                  <textarea id={campo.chave} className="input min-h-24 resize-y" required={campo.obrigatorio} maxLength={4000} value={dados[campo.chave]} onChange={set(campo.chave)} />
                ) : (
                  <input id={campo.chave} className="input" required={campo.obrigatorio} maxLength={4000} value={dados[campo.chave]} onChange={set(campo.chave)} />
                )}
              </div>
            ))}

            {fase === "erro" && <p className="text-danger text-sm mb-4">{mensagemErro}</p>}

            <button type="submit" className="btn-primary" disabled={fase === "enviando"}>{fase === "enviando" ? "Enviando" : "Enviar"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
