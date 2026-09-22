"use client";
// Envio da planilha e conferência do que foi lido, antes de gerar o painel.
// A conferência é o ponto: a pessoa vê que "Valor da venda" virou número e "Data do pedido" virou
// data. Descobrir um erro de leitura aqui custa um clique; descobrir no gráfico custa a confiança
// no painel inteiro.
import { useRef, useState, type DragEvent } from "react";
import { Aviso } from "./ui";
import type { TipoColuna } from "@/lib/planilha";

export interface ColunaLida {
  chave: string;
  rotulo: string;
  tipo: TipoColuna;
  preenchidos: number;
  distintos: number;
  /** Células não vazias que não viraram número/data e ficaram de fora das contas. */
  descartados: number;
}

export interface PlanilhaEnviada {
  id: string;
  nome: string;
  linhas: number;
  totalLinhas: number;
  truncado: boolean;
  resumo: string;
  colunas: ColunaLida[];
}

const ROTULO_TIPO: Record<TipoColuna, string> = { numero: "número", data: "data", texto: "texto" };
const COR_TIPO: Record<TipoColuna, string> = {
  numero: "bg-accent-soft text-accent-ink",
  data: "bg-[#e8eefc] text-[#274690]",
  texto: "bg-line text-muted",
};

function IconePlanilha() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4h16v16H4z" />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}

export function EnvioPlanilha({
  planilha,
  onEnviada,
  onRemover,
  desabilitado,
}: {
  planilha: PlanilhaEnviada | null;
  onEnviada: (p: PlanilhaEnviada) => void;
  onRemover: () => void;
  desabilitado?: boolean;
}) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  async function enviar(arquivo: File) {
    setEnviando(true);
    setErro(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const r = await fetch("/api/dados", { method: "POST", body: corpo });
      const resposta = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(resposta.error || "Não consegui ler este arquivo.");
      onEnviada(resposta as PlanilhaEnviada);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler este arquivo.");
    } finally {
      setEnviando(false);
      // Zera o input para que escolher o MESMO arquivo de novo dispare o onChange.
      if (entradaRef.current) entradaRef.current.value = "";
    }
  }

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    if (desabilitado || enviando) return;
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) enviar(arquivo);
  }

  if (planilha) {
    // Dois avisos que valem mais que a lista de chips: coluna vazia não vira nada, e célula que
    // não converteu sai silenciosamente das somas se ninguém disser.
    const descartadas = planilha.colunas.filter((c) => c.descartados > 0);
    const vazias = planilha.colunas.filter((c) => c.preenchidos === 0);
    return (
      <div className="card p-5 mb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><IconePlanilha /></div>
            <div className="min-w-0">
              <h2 className="font-bold text-[15px] truncate">{planilha.nome}</h2>
              <p className="text-[12.5px] text-muted">
                {planilha.linhas.toLocaleString("pt-BR")} {planilha.linhas === 1 ? "linha" : "linhas"} · {planilha.colunas.length} colunas
              </p>
            </div>
          </div>
          <button type="button" className="btn-ghost shrink-0" onClick={onRemover} disabled={desabilitado}>Trocar arquivo</button>
        </div>

        {planilha.truncado && (
          <div className="mb-3">
            <Aviso tom="warn">
              O arquivo tem {planilha.totalLinhas.toLocaleString("pt-BR")} linhas e foi lido até a linha {planilha.linhas.toLocaleString("pt-BR")}. O painel usa esse recorte.
            </Aviso>
          </div>
        )}

        {descartadas.length > 0 && (
          <div className="mb-3">
            <Aviso tom="warn">
              Algumas células não viraram número ou data e ficam de fora das contas:{" "}
              {descartadas.map((c) => `${c.rotulo} (${c.descartados})`).join(", ")}.
            </Aviso>
          </div>
        )}
        {vazias.length > 0 && (
          <div className="mb-3">
            <Aviso tom="warn">
              {vazias.length === 1 ? "A coluna" : "As colunas"} {vazias.map((c) => `"${c.rotulo}"`).join(", ")}{" "}
              {vazias.length === 1 ? "está vazia" : "estão vazias"} e não {vazias.length === 1 ? "vai virar" : "vão virar"} nenhum gráfico.
            </Aviso>
          </div>
        )}
        <p className="text-[12.5px] text-muted mb-2">Confira se as colunas foram entendidas:</p>
        <ul className="flex flex-wrap gap-1.5">
          {planilha.colunas.map((c) => (
            <li key={c.chave} className={`text-[12px] px-2 py-1 rounded-[7px] ${COR_TIPO[c.tipo]} ${c.preenchidos === 0 ? "opacity-50" : ""}`} title={`${c.preenchidos} preenchidos · ${c.distintos} valores distintos${c.descartados > 0 ? ` · ${c.descartados} ignorados` : ""}`}>
              <span className="font-semibold">{c.rotulo}</span> <span className="opacity-75">{ROTULO_TIPO[c.tipo]}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><IconePlanilha /></div>
        <h2 className="font-bold text-[15px]">Usar os seus dados</h2>
      </div>
      <p className="text-[12.5px] text-muted mb-3">
        Envie uma planilha em CSV e o painel é montado com os números dela. Sem arquivo, o painel sai com números de exemplo.
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
        className={`rounded-[10px] border border-dashed px-4 py-6 text-center transition-colors ${arrastando ? "border-accent bg-accent-soft" : "border-line"}`}
      >
        <input
          ref={entradaRef}
          id="arquivo-planilha"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="sr-only"
          disabled={desabilitado || enviando}
          onChange={(e) => { const a = e.target.files?.[0]; if (a) enviar(a); }}
        />
        <button type="button" className="btn-ghost" disabled={desabilitado || enviando} onClick={() => entradaRef.current?.click()}>
          {enviando ? "Lendo o arquivo…" : "Escolher arquivo CSV"}
        </button>
        <p className="text-[12px] text-muted mt-2">ou arraste o arquivo até aqui · até 8 MB</p>
      </div>
      <p className="text-[12px] text-muted mt-2">
        Está no Excel ou no Google Sheets? Use <strong>Salvar como</strong> (ou <strong>Baixar</strong>) e escolha CSV.
      </p>
      {erro && <div className="mt-3"><Aviso tom="danger">{erro}</Aviso></div>}
    </div>
  );
}
