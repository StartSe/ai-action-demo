"use client";
// Diálogo "Colar ata": a IA propõe ações a partir do texto colado, mas nunca salva sozinha — a pessoa
// revisa cada proposta (e pode editar ou tirar da lista) antes de confirmar. Nasce e morre a cada
// abertura (o pai só monta este componente quando aberto), então o estado já começa limpo sem efeito
// de reset nenhum.
import { useRef, useState } from "react";
import { Aviso, Loading, lerErro, type ErroLido } from "./ui";
import { ataExemplo } from "@/lib/demo";
import type { AcaoProposta } from "@/lib/types";

type Proposta = AcaoProposta & { incluir: boolean };

type Fase = "colar" | "extraindo" | "revisar" | "confirmando";

export function ColarAta({ onFechar, onConfirmado }: { onFechar: () => void; onConfirmado: (info: { resultadoId?: string; quantidade: number }) => void }) {
  const [fase, setFase] = useState<Fase>("colar");
  const [texto, setTexto] = useState("");
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [demo, setDemo] = useState(false);
  const [erro, setErro] = useState<ErroLido | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function extrair() {
    if (!texto.trim()) return;
    setErro(null);
    setFase("extraindo");
    try {
      const r = await fetch("/api/acoes/extrair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      if (!r.ok) {
        setErro(await lerErro(r));
        setFase("colar");
        return;
      }
      const d = (await r.json()) as { demo: boolean; acoes: AcaoProposta[] };
      setDemo(d.demo);
      setPropostas(d.acoes.map((a) => ({ ...a, incluir: true })));
      setFase("revisar");
    } catch (e) {
      setErro(await lerErro(e));
      setFase("colar");
    }
  }

  function atualizar(indice: number, campo: keyof AcaoProposta, valor: string) {
    setPropostas((lista) => lista.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  }

  function alternarInclusao(indice: number) {
    setPropostas((lista) => lista.map((p, i) => (i === indice ? { ...p, incluir: !p.incluir } : p)));
  }

  async function confirmar() {
    const escolhidas = propostas.filter((p) => p.incluir && p.titulo.trim());
    if (escolhidas.length === 0) return;
    setErro(null);
    setFase("confirmando");
    try {
      const r = await fetch("/api/acoes/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acoes: escolhidas, demo }) });
      if (!r.ok) {
        setErro(await lerErro(r));
        setFase("revisar");
        return;
      }
      const d = (await r.json()) as { acoes: unknown[]; resultadoId?: string };
      onConfirmado({ resultadoId: d.resultadoId, quantidade: d.acoes.length });
      onFechar();
    } catch (e) {
      setErro(await lerErro(e));
      setFase("revisar");
    }
  }

  const incluidas = propostas.filter((p) => p.incluir).length;

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 py-6" role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Colar ata" className="card w-full max-w-[640px] max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-1">Colar ata</h2>

        {fase === "colar" && (
          <>
            <p className="text-muted text-sm mb-3">Cole o texto de uma ata ou trecho de reunião: a IA propõe as ações, e você confirma antes de qualquer coisa ser cadastrada.</p>
            {erro && <div className="mb-3"><Aviso tom="danger" acao={erro.acao}>{erro.mensagem}</Aviso></div>}
            <textarea
              className="input min-h-56 resize-y"
              placeholder="Cole aqui o texto da ata..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoFocus
            />
            <button type="button" className="btn-link text-[13px] mt-2" onClick={() => setTexto(ataExemplo)}>Preencher com um exemplo</button>
            <div className="flex gap-2.5 justify-end mt-5">
              <button type="button" className="btn-ghost !w-auto" onClick={onFechar}>Cancelar</button>
              <button type="button" className="btn-primary !w-auto" onClick={extrair} disabled={!texto.trim()}>Extrair ações</button>
            </div>
          </>
        )}

        {fase === "extraindo" && <Loading texto="Lendo a ata e identificando as ações..." />}

        {fase === "revisar" && (
          <>
            <p className="text-muted text-sm mb-3">
              {propostas.length === 0
                ? "A IA não identificou nenhuma ação nesse texto."
                : "Revise cada ação antes de confirmar. Quando o texto não deixa claro quem é o dono ou qual o prazo, o campo fica vazio — preencha à mão se souber."}
            </p>
            {erro && <div className="mb-3"><Aviso tom="danger" acao={erro.acao}>{erro.mensagem}</Aviso></div>}
            <div className="flex flex-col gap-3.5">
              {propostas.map((p, i) => (
                <div key={i} className={`card shadow-none p-4 ${p.incluir ? "" : "opacity-50"}`}>
                  <label className="flex items-start gap-2.5 mb-2.5 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 mt-1" checked={p.incluir} onChange={() => alternarInclusao(i)} />
                    <input
                      className="input flex-1 font-semibold"
                      value={p.titulo}
                      onChange={(e) => atualizar(i, "titulo", e.target.value)}
                      aria-label="Título da ação"
                    />
                  </label>
                  <div className="grid grid-cols-2 max-md:grid-cols-1 gap-2.5 pl-[26px]">
                    <div>
                      <input className="input" placeholder="Dono (opcional)" value={p.dono} onChange={(e) => atualizar(i, "dono", e.target.value)} aria-label="Dono da ação" />
                      {p.evidenciaDono && <p className="text-[12px] text-muted mt-1">A partir de: &ldquo;{p.evidenciaDono}&rdquo;</p>}
                      {!p.evidenciaDono && <p className="text-[12px] text-muted mt-1">Não ficou claro no texto quem é o dono.</p>}
                    </div>
                    <div>
                      <input className="input" type="date" value={p.prazo} onChange={(e) => atualizar(i, "prazo", e.target.value)} aria-label="Prazo da ação" />
                      {p.evidenciaPrazo && <p className="text-[12px] text-muted mt-1">A partir de: &ldquo;{p.evidenciaPrazo}&rdquo;</p>}
                      {!p.evidenciaPrazo && <p className="text-[12px] text-muted mt-1">Não ficou claro no texto qual o prazo.</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2.5 justify-end mt-5">
              <button type="button" className="btn-ghost !w-auto" onClick={() => setFase("colar")}>Voltar</button>
              <button type="button" className="btn-primary !w-auto" onClick={confirmar} disabled={incluidas === 0}>
                Confirmar {incluidas > 0 ? `(${incluidas})` : ""}
              </button>
            </div>
          </>
        )}

        {fase === "confirmando" && <Loading texto="Cadastrando as ações confirmadas..." />}
      </div>
    </div>
  );
}
