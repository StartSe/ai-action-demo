"use client";
// Etiquetas: a palavra que a equipe escolheu para separar conversas do jeito dela ("orçamento",
// "reclamação", "VIP"). Diferente do assunto (lib/assuntos.ts), que a IA escolhe de uma lista fixa:
// aqui quem escreve é quem atende, e não existe cadastro a preencher antes — uma etiqueta nasce na
// primeira vez que é escrita no painel do contato.
//
// Tudo o que as três telas precisam saber sobre elas mora neste arquivo: os chips da lista
// (`ChipsEtiqueta`), o bloco do painel do contato (`BlocoEtiquetas`) e a linha de filtro com o diálogo
// de organização (`useFiltroEtiquetas`, um hook que devolve as partes prontas, no desenho de
// `useRespostasRapidas`).
import { useCallback, useEffect, useRef, useState } from "react";
import { classeEtiqueta, erroDeEtiqueta, normalizarEtiqueta, sugerirEtiquetas } from "@/lib/etiquetas";
import { LIMITE_ETIQUETA, MAX_ETIQUETAS_POR_CONVERSA, type Etiqueta, type EtiquetaEmUso } from "@/lib/types";
import { Aviso, ErrorBox, lerErro, useConfirmacao, type ErroLido } from "./ui";

const ENDERECO = "/api/etiquetas";

/** A cor desta etiqueta na lista da conta; a primeira da paleta quando ela ainda não está lá. */
function corDe(daEmpresa: Etiqueta[], nome: string): string {
  return classeEtiqueta(daEmpresa.find((e) => e.nome === nome)?.cor ?? "azul");
}

/**
 * Os chips de uma conversa na lista. Só os dois primeiros aparecem: a linha já tem nome, prévia, hora,
 * status e origem, e a partir do terceiro chip ninguém lê mais nada — o resto vira "+2", que diz que há
 * mais sem fingir que cabem.
 */
export function ChipsEtiqueta({ nomes, daEmpresa, max = 2 }: { nomes: string[]; daEmpresa: Etiqueta[]; max?: number }) {
  if (nomes.length === 0) return null;
  const mostrados = nomes.slice(0, max);
  const resto = nomes.length - mostrados.length;
  return (
    <>
      {mostrados.map((nome) => (
        <span key={nome} className={`${corDe(daEmpresa, nome)} max-w-[120px]`}>
          <span className="truncate">{nome}</span>
        </span>
      ))}
      {resto > 0 && (
        <span className="etiqueta etiqueta-cinza" title={nomes.slice(max).join(", ")}>
          +{resto}
        </span>
      )}
    </>
  );
}

/**
 * O bloco "Etiquetas" do painel do contato: os chips desta conversa, cada um com o "×" que o tira, e o
 * campo que soma outra. O campo sugere as etiquetas que a conta já tem enquanto a pessoa digita —
 * escrever "orç" e escolher "orçamento" é o que impede a conta de terminar com "orçamento", "orcamento"
 * e "Orçamento" separadas.
 *
 * Quem grava é `onSalvar`, que vem da conversa aberta: a lista inteira vai numa chamada só, e não
 * "some uma"/"soma outra", para duas abas na mesma conversa nunca somarem a mesma etiqueta duas vezes.
 */
export function BlocoEtiquetas({
  etiquetas,
  daEmpresa,
  agindo,
  onSalvar,
}: {
  etiquetas: string[];
  daEmpresa: Etiqueta[];
  agindo: boolean;
  onSalvar: (etiquetas: string[]) => Promise<void>;
}) {
  const [termo, setTermo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const cheio = etiquetas.length >= MAX_ETIQUETAS_POR_CONVERSA;
  const sugestoes = cheio ? [] : sugerirEtiquetas(daEmpresa, etiquetas, termo).slice(0, 6);

  async function gravar(lista: string[]) {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(lista);
      setTermo("");
    } finally {
      setSalvando(false);
    }
  }

  function somar(bruto: string) {
    const nome = normalizarEtiqueta(bruto);
    const problema = erroDeEtiqueta(nome);
    if (problema) {
      setErro(problema);
      return;
    }
    if (etiquetas.includes(nome)) {
      setTermo("");
      return;
    }
    void gravar([...etiquetas, nome]);
  }

  return (
    <section className="mt-4 pt-4 border-t border-line" aria-label="Etiquetas">
      <h3 className="text-[13px] font-bold mb-2">Etiquetas</h3>

      {etiquetas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {etiquetas.map((nome) => (
            <li key={nome}>
              <span className={`${corDe(daEmpresa, nome)} pr-1.5`}>
                <span className="truncate max-w-[140px]">{nome}</span>
                <button
                  type="button"
                  className="shrink-0 leading-none text-[15px] opacity-70 hover:opacity-100 cursor-pointer disabled:cursor-default"
                  aria-label={`Tirar a etiqueta ${nome} desta conversa`}
                  disabled={agindo || salvando}
                  onClick={() => void gravar(etiquetas.filter((n) => n !== nome))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {cheio ? (
        <p className="text-[12px] text-muted">Até {MAX_ETIQUETAS_POR_CONVERSA} etiquetas por conversa. Tire uma para somar outra.</p>
      ) : (
        <>
          <label className="block">
            <span className="sr-only">Adicionar etiqueta</span>
            <input
              ref={campoRef}
              className="input !py-2 text-[13px]"
              value={termo}
              maxLength={LIMITE_ETIQUETA}
              disabled={agindo || salvando}
              placeholder="Adicionar etiqueta"
              onChange={(e) => {
                setTermo(e.target.value);
                setErro(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (termo.trim()) somar(termo);
                } else if (e.key === "Escape") {
                  setTermo("");
                }
              }}
            />
          </label>
          {/* O campo desligado não mostra `placeholder` em todo navegador, então a frase do que fazer
              fica escrita abaixo dele — mesma regra do campo de resposta da conversa. */}
          <p className="text-[12px] text-muted mt-1">Escreva uma palavra e tecle Enter para etiquetar esta conversa.</p>
          {sugestoes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-2">
              {sugestoes.map((e) => (
                <li key={e.nome}>
                  <button
                    type="button"
                    className={`${classeEtiqueta(e.cor)} cursor-pointer opacity-80 hover:opacity-100`}
                    disabled={agindo || salvando}
                    onClick={() => somar(e.nome)}
                  >
                    <span className="truncate max-w-[140px]">{e.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {erro && (
        <p className="text-[12px] text-danger mt-2" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}

/**
 * A linha de etiquetas que filtra a lista de Conversas e o diálogo que organiza a lista da conta.
 *
 * Só as etiquetas que estão em alguma conversa aparecem na linha de filtro (a que está ativa continua
 * ali de qualquer jeito): um chip que não filtra nada só ocupa espaço. Todas, inclusive as vazias,
 * aparecem no diálogo — é lá que se apaga.
 */
export function useFiltroEtiquetas({ ativa, onFiltrar }: { ativa: string | null; onFiltrar: (etiqueta: string | null) => void }) {
  const [itens, setItens] = useState<EtiquetaEmUso[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<ErroLido | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const { confirmar, Dialogo: DialogoConfirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(ENDERECO);
      if (!r.ok) throw r;
      const dados = (await r.json()) as { itens: EtiquetaEmUso[] };
      setItens(dados.itens ?? []);
    } catch (e) {
      console.error("Não foi possível ler as etiquetas", e);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function apagar(etiqueta: EtiquetaEmUso) {
    if (apagando) return;
    const quantas =
      etiqueta.usos === 0
        ? "Ela não está em nenhuma conversa."
        : etiqueta.usos === 1
          ? "Ela vai sair de 1 conversa."
          : `Ela vai sair de ${etiqueta.usos} conversas.`;
    const ok = await confirmar(`Apagar a etiqueta "${etiqueta.nome}"? ${quantas} As conversas continuam aqui.`, { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagando(etiqueta.nome);
    try {
      const r = await fetch(`${ENDERECO}/${encodeURIComponent(etiqueta.nome)}`, { method: "DELETE" });
      if (!r.ok) throw r;
      const dados = (await r.json()) as { itens: EtiquetaEmUso[] };
      setItens(dados.itens ?? []);
      setErro(null);
      if (ativa === etiqueta.nome) onFiltrar(null);
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setApagando(null);
    }
  }

  const naLinha = itens.filter((e) => e.usos > 0 || e.nome === ativa);

  const Filtro =
    itens.length === 0 ? null : (
      <div className="flex items-center gap-1.5 flex-wrap py-2.5" role="group" aria-label="Filtrar por etiqueta">
        <span className="text-[12.5px] text-muted mr-0.5">Etiquetas:</span>
        {naLinha.map((e) => {
          const escolhida = e.nome === ativa;
          return (
            <button
              key={e.nome}
              type="button"
              aria-pressed={escolhida}
              className={`${classeEtiqueta(e.cor)} cursor-pointer ${escolhida ? "ring-2 ring-accent" : "opacity-75 hover:opacity-100"}`}
              onClick={() => onFiltrar(escolhida ? null : e.nome)}
            >
              <span className="truncate max-w-[160px]">{e.nome}</span>
              {escolhida && <span aria-hidden="true">×</span>}
            </button>
          );
        })}
        <button type="button" className="btn-link text-[12.5px] px-1" onClick={() => setAberto(true)}>
          Organizar
        </button>
      </div>
    );

  const Dialogo = (
    <>
      {aberto && (
        <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 py-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Etiquetas" className="card w-full max-w-[460px] p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-1">
              <h2 className="text-[17px] font-bold flex-1">Etiquetas</h2>
              <button type="button" className="btn-link shrink-0" onClick={() => setAberto(false)}>
                Fechar
              </button>
            </div>
            <p className="text-[13px] text-muted mb-4">
              As etiquetas nascem quando você as escreve numa conversa, no painel do contato. Aqui você vê todas e apaga as que não usa mais.
            </p>

            {erro && <ErrorBox mensagem={erro.mensagem} acao={erro.acao} />}

            {itens.length === 0 ? (
              <Aviso>Nenhuma etiqueta ainda. Abra uma conversa e escreva a primeira no painel do contato.</Aviso>
            ) : (
              <ul className="flex flex-col gap-2">
                {itens.map((e) => (
                  <li key={e.nome} className="flex items-center gap-3 border border-line rounded-card p-3">
                    <span className={`${classeEtiqueta(e.cor)} shrink-0`}>
                      <span className="truncate max-w-[160px]">{e.nome}</span>
                    </span>
                    <span className="flex-1 text-[12.5px] text-muted">
                      {e.usos === 0 ? "Em nenhuma conversa" : e.usos === 1 ? "Em 1 conversa" : `Em ${e.usos} conversas`}
                    </span>
                    <button type="button" className="btn-link text-danger shrink-0" onClick={() => apagar(e)} disabled={apagando === e.nome}>
                      {apagando === e.nome ? "Apagando…" : "Apagar"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {DialogoConfirmacao}
    </>
  );

  return { daEmpresa: itens as Etiqueta[], recarregar: carregar, Filtro, Dialogo };
}
