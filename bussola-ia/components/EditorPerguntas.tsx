"use client";
// Editor de perguntas do questionário (US-011): editar texto, trocar dimensão, mudar tipo (e as
// opções, quando "escolha"), remover, adicionar e reordenar perguntas dentro de cada dimensão com
// os botões Subir/Descer. Sem arrastar.
import type { OpcaoPergunta, Pergunta, Questionario, TipoPergunta } from "@/lib/types";

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const ROTULO_TIPO: Record<TipoPergunta, string> = { escala: "Escala (1 a 5)", escolha: "Escolha", texto: "Texto livre" };

function opcoesPadrao(): OpcaoPergunta[] {
  return [
    { valor: "opcao-1", rotulo: "Opção 1" },
    { valor: "opcao-2", rotulo: "Opção 2" },
  ];
}

export function EditorPerguntas({ questionario, onChange }: { questionario: Questionario; onChange: (q: Questionario) => void }) {
  const perguntas = questionario.perguntas;
  const dimensoesEmUso = new Set(perguntas.map((p) => p.dimensao)).size;

  function atualizarPergunta(id: string, alteracoes: Partial<Pergunta>) {
    onChange({ ...questionario, perguntas: perguntas.map((p) => (p.id === id ? { ...p, ...alteracoes } : p)) });
  }

  function mudarTipo(id: string, tipo: TipoPergunta) {
    const atual = perguntas.find((p) => p.id === id);
    atualizarPergunta(id, { tipo, opcoes: tipo === "escolha" ? (atual?.opcoes ?? opcoesPadrao()) : undefined });
  }

  function mudarOpcaoRotulo(id: string, indice: number, rotulo: string) {
    const atual = perguntas.find((p) => p.id === id);
    if (!atual) return;
    atualizarPergunta(id, { opcoes: (atual.opcoes ?? []).map((op, i) => (i === indice ? { ...op, rotulo } : op)) });
  }

  function adicionarOpcao(id: string) {
    const atual = perguntas.find((p) => p.id === id);
    if (!atual) return;
    const opcoes = [...(atual.opcoes ?? [])];
    const n = opcoes.length + 1;
    opcoes.push({ valor: `opcao-${n}`, rotulo: `Opção ${n}` });
    atualizarPergunta(id, { opcoes });
  }

  function removerOpcao(id: string, indice: number) {
    const atual = perguntas.find((p) => p.id === id);
    if (!atual) return;
    atualizarPergunta(id, { opcoes: (atual.opcoes ?? []).filter((_, i) => i !== indice) });
  }

  function remover(id: string) {
    onChange({ ...questionario, perguntas: perguntas.filter((p) => p.id !== id) });
  }

  function adicionar(dimensao: string) {
    const nova: Pergunta = { id: novoId(), texto: "", dimensao, tipo: "escala" };
    onChange({ ...questionario, perguntas: [...perguntas, nova] });
  }

  /** Troca a pergunta de posição com a vizinha da MESMA dimensão (mesmo que não estejam lado a lado no array inteiro). */
  function mover(id: string, direcao: "subir" | "descer") {
    const idx = perguntas.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const dimensao = perguntas[idx].dimensao;
    const posicoesDaDimensao = perguntas.map((p, i) => (p.dimensao === dimensao ? i : -1)).filter((i) => i !== -1);
    const pos = posicoesDaDimensao.indexOf(idx);
    const alvoPos = direcao === "subir" ? pos - 1 : pos + 1;
    if (alvoPos < 0 || alvoPos >= posicoesDaDimensao.length) return;
    const idxAlvo = posicoesDaDimensao[alvoPos];
    const nova = [...perguntas];
    [nova[idx], nova[idxAlvo]] = [nova[idxAlvo], nova[idx]];
    onChange({ ...questionario, perguntas: nova });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted text-[13px]">
        {perguntas.length} {perguntas.length === 1 ? "pergunta" : "perguntas"} em {dimensoesEmUso} {dimensoesEmUso === 1 ? "dimensão" : "dimensões"}
      </p>

      {questionario.dimensoes.map((dim) => {
        const doDimensao = perguntas.filter((p) => p.dimensao === dim.nome);
        return (
          <div key={dim.id} className="flex flex-col gap-2.5">
            <h3 className="text-[13px] font-bold">{dim.nome}</h3>

            {doDimensao.map((p, posMesmaDim) => (
              <div key={p.id} className="rounded-[10px] border border-line p-3 flex flex-col gap-2.5">
                <textarea
                  className="input min-h-16 resize-y text-[14px]"
                  placeholder="Texto da pergunta"
                  value={p.texto}
                  onChange={(e) => atualizarPergunta(p.id, { texto: e.target.value })}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <select className="input w-auto min-w-[170px]" aria-label="Dimensão da pergunta" value={p.dimensao} onChange={(e) => atualizarPergunta(p.id, { dimensao: e.target.value })}>
                    {questionario.dimensoes.map((d) => (
                      <option key={d.id} value={d.nome}>{d.nome}</option>
                    ))}
                  </select>

                  <select className="input w-auto min-w-[140px]" aria-label="Tipo da pergunta" value={p.tipo} onChange={(e) => mudarTipo(p.id, e.target.value as TipoPergunta)}>
                    {(Object.keys(ROTULO_TIPO) as TipoPergunta[]).map((t) => (
                      <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                    ))}
                  </select>

                  <div className="flex gap-3 ml-auto text-[12.5px]">
                    <button type="button" className="btn-link disabled:opacity-40 disabled:no-underline disabled:cursor-default" disabled={posMesmaDim === 0} onClick={() => mover(p.id, "subir")}>Subir</button>
                    <button type="button" className="btn-link disabled:opacity-40 disabled:no-underline disabled:cursor-default" disabled={posMesmaDim === doDimensao.length - 1} onClick={() => mover(p.id, "descer")}>Descer</button>
                    <button type="button" className="btn-link" onClick={() => remover(p.id)}>Remover</button>
                  </div>
                </div>

                {p.tipo === "escolha" && (
                  <div className="flex flex-col gap-1.5 pl-1">
                    {(p.opcoes ?? []).map((op, i) => (
                      <div key={i} className="flex gap-2">
                        <input className="input" placeholder={`Opção ${i + 1}`} value={op.rotulo} onChange={(e) => mudarOpcaoRotulo(p.id, i, e.target.value)} />
                        <button type="button" className="btn-link shrink-0" onClick={() => removerOpcao(p.id, i)}>Remover</button>
                      </div>
                    ))}
                    <button type="button" className="btn-link self-start" onClick={() => adicionarOpcao(p.id)}>+ Adicionar opção</button>
                  </div>
                )}
              </div>
            ))}

            <button type="button" className="btn-ghost self-start" onClick={() => adicionar(dim.nome)}>+ Adicionar pergunta</button>
          </div>
        );
      })}
    </div>
  );
}
