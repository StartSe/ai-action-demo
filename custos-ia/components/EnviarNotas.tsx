"use client";
// Envio de notas em PDF/imagem (US-020), em duas partes usadas pela página principal:
// - EnviarNotas: área de arrastar-e-soltar com vários arquivos (a Dropzone compartilhada de ui.tsx é de
//   um arquivo só e não pode ser alterada — é comparada byte a byte entre os apps), botão "Ler as notas"
//   que chama POST /api/faturas/upload e devolve a prévia para o pai.
// - PreviaNotas: tabela editável do que foi reconhecido (Editar por linha, Remover) e a lista de arquivos
//   ignorados com o motivo; "Confirmar tudo" chama POST /api/faturas com { faturas } e só então grava.
import { useRef, useState } from "react";
import { Chip, Section, numero } from "@/components/ui";
import type { Fatura } from "@/lib/types";

export type Ignorado = { arquivo: string; motivo: string };
export type ResultadoUpload = { reconhecidas: Fatura[]; ignoradas: Ignorado[] };

const ACEITAR = ".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain";
const MAXIMO_ARQUIVOS = 10;
const LIMITE_MB = 5;

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${numero(bytes / (1024 * 1024), 1)} MB`;
}

export function EnviarNotas({ onInicio, onLido, onErro }: { onInicio: () => void; onLido: (resultado: ResultadoUpload) => void; onErro: (mensagem: string) => void }) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionar(lista: FileList | File[] | null) {
    if (!lista) return;
    const novos = Array.from(lista);
    setAviso(null);
    setArquivos((atuais) => {
      const grandes = novos.filter((f) => f.size > LIMITE_MB * 1024 * 1024).map((f) => f.name);
      const aceitos = novos.filter((f) => f.size <= LIMITE_MB * 1024 * 1024 && !atuais.some((a) => a.name === f.name && a.size === f.size));
      const juntos = [...atuais, ...aceitos];
      const avisos: string[] = [];
      if (grandes.length) avisos.push(`Fora por passar de ${LIMITE_MB} MB: ${grandes.join(", ")}.`);
      if (juntos.length > MAXIMO_ARQUIVOS) avisos.push(`Só os primeiros ${MAXIMO_ARQUIVOS} arquivos serão lidos.`);
      if (avisos.length) setAviso(avisos.join(" "));
      return juntos.slice(0, MAXIMO_ARQUIVOS);
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function remover(indice: number) {
    setArquivos((atuais) => atuais.filter((_, i) => i !== indice));
  }

  async function ler() {
    if (arquivos.length === 0) return;
    setEnviando(true);
    onInicio();
    try {
      const form = new FormData();
      arquivos.forEach((a) => form.append("arquivos", a));
      const r = await fetch("/api/faturas/upload", { method: "POST", body: form });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível ler as notas.");
      onLido({ reconhecidas: resposta.reconhecidas || [], ignoradas: resposta.ignoradas || [] });
      setArquivos([]);
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Erro inesperado ao ler as notas.");
    } finally {
      setEnviando(false);
    }
  }

  const ativo = arrastando || arquivos.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor="notas-arquivos"
        onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={(e) => { e.preventDefault(); setArrastando(false); }}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-1.5 text-center py-7 px-4 rounded-card border-[1.5px] border-dashed cursor-pointer transition-colors ${ativo ? "border-accent bg-accent-soft" : "border-line text-muted"}`}
      >
        <input ref={inputRef} id="notas-arquivos" type="file" accept={ACEITAR} multiple hidden onChange={(e) => adicionar(e.target.files)} />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={ativo ? "text-accent" : "text-muted"}>
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <strong className="text-ink text-[14.5px] font-bold">Arraste as notas aqui ou selecione</strong>
        <span className="text-[12.5px]">PDF, PNG ou JPG, até {MAXIMO_ARQUIVOS} arquivos de {LIMITE_MB} MB</span>
      </label>

      {arquivos.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[13px]">
          {arquivos.map((a, i) => (
            <li key={`${a.name}-${a.size}`} className="flex items-center gap-2 min-w-0">
              <span className="truncate font-semibold text-ink" title={a.name}>{a.name}</span>
              <span className="text-muted shrink-0">{tamanho(a.size)}</span>
              <button type="button" className="ml-auto shrink-0 text-muted hover:text-danger text-[12.5px] underline" onClick={() => remover(i)} disabled={enviando}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {aviso && <p className="text-warn text-[12.5px]">{aviso}</p>}

      <button type="button" className="btn-primary !w-auto" onClick={ler} disabled={enviando || arquivos.length === 0}>
        {enviando ? "Lendo as notas" : arquivos.length > 1 ? `Ler ${arquivos.length} notas` : "Ler a nota"}
      </button>
      <p className="text-muted text-[12.5px]">Nada é gravado antes de você conferir e confirmar a prévia.</p>
    </div>
  );
}

const MOEDAS: Fatura["moeda"][] = ["BRL", "USD", "EUR"];
const SIMBOLO: Record<Fatura["moeda"], string> = { BRL: "R$", USD: "US$", EUR: "€" };

type Linha = Fatura & { editando?: boolean };

export function PreviaNotas({ resultado, onConfirmado, onCancelar }: { resultado: ResultadoUpload; onConfirmado: (gravadas: number) => void; onCancelar: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>(() => resultado.reconhecidas.map((f) => ({ ...f })));
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function atualizar(id: string, mudanca: Partial<Linha>) {
    setLinhas((atuais) => atuais.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
  }

  function remover(id: string) {
    setLinhas((atuais) => atuais.filter((l) => l.id !== id));
  }

  async function confirmar() {
    if (linhas.length === 0) return;
    setConfirmando(true);
    setErro(null);
    try {
      const faturas = linhas.map((l) => {
        const copia: Linha = { ...l, valor: Number(l.valor), origem: "upload" };
        delete copia.editando;
        return copia;
      });
      const r = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faturas }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível gravar as faturas.");
      onConfirmado(Number(resposta.gravadas) || faturas.length);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado ao confirmar.");
    } finally {
      setConfirmando(false);
    }
  }

  const exemplo = linhas.some((l) => /modo demonstração/i.test(l.categoria) || /Exemplo de demonstração/i.test(l.referencia || ""));

  return (
    <article className="reveal">
      <header className="mb-5">
        <h2 className="text-[22px] font-bold text-ink leading-tight">Confira o que foi reconhecido</h2>
        <p className="text-muted text-sm mt-1">
          {linhas.length === 0
            ? "Nenhuma nota reconhecida nos arquivos enviados."
            : `${linhas.length} ${linhas.length === 1 ? "nota reconhecida" : "notas reconhecidas"}. Corrija o que precisar e confirme para lançar.`}
        </p>
        {exemplo && <p className="text-warn text-[12.5px] mt-1">Modo demonstração: sem uma chave de IA, cada arquivo vira uma fatura de exemplo, rotulada como tal.</p>}
      </header>

      {linhas.length > 0 && (
        <Section titulo="Notas reconhecidas">
          <ul className="flex flex-col gap-2.5">
            {linhas.map((l) => (
              <li key={l.id} className="rounded-card border border-line p-3.5 flex flex-col gap-2.5">
                {l.editando ? (
                  <>
                    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-2.5">
                      <input className="input" aria-label="Fornecedor" placeholder="Fornecedor" value={l.fornecedor} onChange={(e) => atualizar(l.id, { fornecedor: e.target.value })} />
                      <input className="input" aria-label="Ferramenta" placeholder="Ferramenta" value={l.ferramenta} onChange={(e) => atualizar(l.id, { ferramenta: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 max-md:grid-cols-1 gap-2.5">
                      <input className="input" aria-label="Valor" type="number" min={0.01} step="0.01" value={l.valor} onChange={(e) => atualizar(l.id, { valor: e.target.value as unknown as number })} />
                      <select className="input" aria-label="Moeda" value={l.moeda} onChange={(e) => atualizar(l.id, { moeda: e.target.value as Fatura["moeda"] })}>
                        {MOEDAS.map((m) => (
                          <option key={m} value={m}>{m === "BRL" ? "Real (BRL)" : m === "USD" ? "Dólar (USD)" : "Euro (EUR)"}</option>
                        ))}
                      </select>
                      <input className="input" aria-label="Data" type="date" value={l.data} onChange={(e) => atualizar(l.id, { data: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" className="btn-ghost !w-auto" onClick={() => atualizar(l.id, { editando: false })}>Pronto</button>
                      <button type="button" className="text-[12.5px] text-muted hover:text-danger underline ml-auto" onClick={() => remover(l.id)}>Remover</button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1 max-md:basis-full">
                      <div className="font-bold text-ink text-[14.5px] break-words">{l.fornecedor} <span className="text-muted font-normal">· {l.ferramenta}</span></div>
                      <div className="text-muted text-[12.5px] mt-0.5 break-words" title={l.referencia}>
                        {l.data.split("-").reverse().join("/")}
                        {l.referencia ? ` · ${l.referencia}` : ""}
                      </div>
                    </div>
                    <Chip nivel={exemplo ? "media" : "baixa"}>
                      {SIMBOLO[l.moeda]} {numero(Number(l.valor), 2)}
                    </Chip>
                    <div className="flex items-center gap-3 shrink-0">
                      <button type="button" className="text-[12.5px] font-bold text-accent-ink underline" onClick={() => atualizar(l.id, { editando: true })}>Editar</button>
                      <button type="button" className="text-[12.5px] text-muted hover:text-danger underline" onClick={() => remover(l.id)}>Remover</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {resultado.ignoradas.length > 0 && (
        <Section titulo="Arquivos ignorados">
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {resultado.ignoradas.map((i) => (
              <li key={i.arquivo} className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:gap-2">
                <span className="font-semibold text-ink truncate" title={i.arquivo}>{i.arquivo}</span>
                <span className="text-muted">{i.motivo}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {erro && <p className="text-danger text-sm mb-3">{erro}</p>}

      <div className="flex items-center gap-3 flex-wrap mt-2">
        <button type="button" className="btn-primary !w-auto" onClick={confirmar} disabled={confirmando || linhas.length === 0}>
          {confirmando ? "Gravando" : linhas.length === 1 ? "Confirmar" : "Confirmar tudo"}
        </button>
        <button type="button" className="btn-ghost !w-auto" onClick={onCancelar} disabled={confirmando}>
          Descartar
        </button>
      </div>
    </article>
  );
}
