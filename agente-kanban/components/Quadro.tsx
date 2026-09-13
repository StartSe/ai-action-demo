import type { Cartao, Quadro as QuadroType } from "@/lib/quadro";

const RÓTULO_ETIQUETA = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

function formatarDataPtBr(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

export function Quadro({
  quadro,
  alterados = [],
  onAtribuir,
}: {
  quadro: QuadroType;
  alterados?: string[];
  /** Ausente em contextos de leitura (/r/[id], /imprimir/[id]): sem ele, um cartão sem responsável só mostra o texto "Sem responsável". */
  onAtribuir?: (cartao: Cartao) => void;
}) {
  const setAlterados = new Set(alterados);
  return (
    <div className="flex max-md:flex-col gap-4 items-start overflow-x-auto pb-1.5">
      {quadro.listas.map((lista) => (
        <div key={lista.id} className="card min-w-[270px] max-md:min-w-0 flex-1 basis-[270px] p-4">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="text-sm font-bold">{lista.nome}</h3>
            <span className="bg-accent-soft text-accent-ink rounded-full px-[9px] py-0.5 text-xs font-bold">{lista.cartoes.length}</span>
          </div>
          <div className="flex flex-col gap-2.5 min-h-[30px]">
            {lista.cartoes.length === 0 && <div className="text-[13px] text-muted py-3.5 text-center">Nenhum cartão aqui.</div>}
            {lista.cartoes.map((c) => (
              <div
                key={c.id}
                className={`bg-white border rounded-[10px] px-3.5 py-3 transition-[border-color,box-shadow] duration-300 ${
                  setAlterados.has(c.id) ? "border-accent ring-2 ring-accent-soft" : "border-line"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-bold text-sm">{c.nome}</div>
                  {c.etiqueta && <span className={`chip-${c.etiqueta} shrink-0`}>{RÓTULO_ETIQUETA[c.etiqueta]}</span>}
                </div>
                {c.descricao && <div className="text-[12.5px] text-muted mb-2">{c.descricao}</div>}
                <div className="flex justify-between gap-2 text-xs text-muted">
                  {c.responsavel ? (
                    <span>{c.responsavel}</span>
                  ) : onAtribuir ? (
                    <button type="button" className="btn-link text-xs" onClick={() => onAtribuir(c)}>Atribuir a alguém</button>
                  ) : (
                    <span>Sem responsável</span>
                  )}
                  {c.vencimento && <span className="font-bold text-accent-ink whitespace-nowrap">{formatarDataPtBr(c.vencimento)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
