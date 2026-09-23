"use client";
// Respostas rápidas: as frases de sempre, chamadas por um atalho depois de uma barra ("/horario").
//
// Tudo o que a conversa precisa saber sobre elas mora neste arquivo, num hook só (`useRespostasRapidas`)
// que devolve as três partes prontas para a tela de fora encaixar: o painel que abre acima do campo, o
// diálogo de gestão e o tratador de teclas do campo. É o mesmo desenho de `usePersonaBrief` no
// Assistente — o estado fica num lugar só e a conversa não recalcula nada.
//
// A troca de `{nome}` e `{atendente}` acontece aqui, na hora de INSERIR: a frase guardada é a mesma
// para todo mundo, e quem sabe o nome do contato é a conversa aberta.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aplicarVariaveis, erroDeAtalho, erroDeTextoRapido, filtrarRespostas, normalizarAtalho } from "@/lib/atalhos";
import { LIMITE_ATALHO, LIMITE_TEXTO_RAPIDO, type RespostaRapida } from "@/lib/types";
import { Aviso, ErrorBox, lerErro, useConfirmacao, type ErroLido } from "./ui";

const ENDERECO = "/api/respostas-rapidas";

/** Quantas linhas o painel mostra de uma vez; o resto vem rolando. */
const ALTURA_LISTA = "max-h-[230px]";

/** Uma linha da lista, com o atalho em destaque e o texto cortado numa linha só. */
function LinhaResposta({ resposta, ativa, onEscolher, aoPassar }: { resposta: RespostaRapida; ativa: boolean; onEscolher: () => void; aoPassar: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={ativa}
      className={`w-full text-left px-3 py-2 rounded-md cursor-pointer ${ativa ? "bg-accent-soft" : "hover:bg-accent-soft"}`}
      onMouseEnter={aoPassar}
      onClick={onEscolher}
    >
      <span className="block font-bold text-[13px] text-accent-ink">/{resposta.atalho}</span>
      <span className="block text-[12.5px] text-ink-2 truncate">{resposta.texto}</span>
    </button>
  );
}

type Formulario = { id: number | null; atalho: string; texto: string };

const VAZIO: Formulario = { id: null, atalho: "", texto: "" };

/**
 * O campo de resposta de uma conversa aberta, com respostas rápidas ligadas.
 *
 * `texto` é o que está escrito no campo agora: é dele que sai a decisão de abrir o painel (uma barra
 * no começo de um texto de uma linha só) e o que filtra a lista. `onInserir` recebe a frase final,
 * com as variáveis já trocadas.
 */
export function useRespostasRapidas({
  texto,
  nome,
  atendente,
  onInserir,
}: {
  texto: string;
  nome?: string;
  atendente?: string;
  onInserir: (frase: string) => void;
}) {
  const [itens, setItens] = useState<RespostaRapida[]>([]);
  const [gestaoAberta, setGestaoAberta] = useState(false);
  const [erro, setErro] = useState<ErroLido | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [apagandoId, setApagandoId] = useState<number | null>(null);
  /** A escolha do painel anda junto do termo: termo novo, lista nova, primeira linha marcada. */
  const [selecao, setSelecao] = useState<{ termo: string; i: number }>({ termo: "", i: 0 });
  /** Fechado à mão (Esc) para este termo: não reabre enquanto a pessoa continuar escrevendo a mesma coisa. */
  const [fechadoEm, setFechadoEm] = useState<string | null>(null);
  const { confirmar, Dialogo: DialogoConfirmacao } = useConfirmacao();
  const campoAtalhoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(ENDERECO);
      if (!r.ok) throw r;
      const dados = (await r.json()) as { itens: RespostaRapida[] };
      setItens(dados.itens ?? []);
    } catch (e) {
      console.error("Não foi possível ler as respostas rápidas", e);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  // A barra só chama o painel quando ela abre um texto de uma linha: uma barra no meio de uma frase
  // ("2/3 do valor") é texto, e uma resposta já escrita em duas linhas não está sendo procurada.
  const chamando = texto.startsWith("/") && !texto.includes("\n");
  const termo = chamando ? texto.slice(1) : "";
  const aberto = chamando && fechadoEm !== termo;

  const filtradas = useMemo(() => (aberto ? filtrarRespostas(itens, termo) : []), [aberto, itens, termo]);
  const i = selecao.termo === termo ? Math.min(selecao.i, Math.max(filtradas.length - 1, 0)) : 0;

  function escolher(resposta: RespostaRapida) {
    onInserir(aplicarVariaveis(resposta.texto, { nome, atendente }));
    setFechadoEm(null);
  }

  function abrirGestao(inicial?: RespostaRapida) {
    setForm(inicial ? { id: inicial.id, atalho: inicial.atalho, texto: inicial.texto } : VAZIO);
    setErroForm(null);
    setErro(null);
    setGestaoAberta(true);
  }

  /**
   * As teclas do campo de resposta enquanto o painel está aberto. Devolve `true` quando tratou a tecla
   * — quem chama para por aí, para o Enter não enviar a mensagem no lugar de escolher a frase.
   */
  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!aberto) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setFechadoEm(termo);
      return true;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!filtradas.length) return true;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setSelecao({ termo, i: (i + passo + filtradas.length) % filtradas.length });
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey && filtradas.length) {
      e.preventDefault();
      escolher(filtradas[i]);
      return true;
    }
    return false;
  }

  const Painel = aberto ? (
    <div
      role="listbox"
      aria-label="Respostas rápidas"
      className="absolute bottom-full left-0 right-0 mb-2 z-20 card p-1.5 shadow-card"
    >
      {itens.length === 0 ? (
        <div className="px-3 py-3">
          <p className="text-[13px] text-ink-2 mb-2">Nenhuma resposta rápida ainda. Guarde as frases que você mais repete e chame cada uma por um atalho.</p>
          <button type="button" className="btn-primary !w-auto" onClick={() => abrirGestao()}>
            Criar a primeira
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="px-3 py-3">
          <p className="text-[13px] text-ink-2 mb-2">Nenhuma resposta rápida com “{termo}”.</p>
          <button type="button" className="btn-ghost !w-auto" onClick={() => abrirGestao()}>
            Ver todas
          </button>
        </div>
      ) : (
        <>
          <p className="px-3 pt-1.5 pb-1 text-[11.5px] text-muted">Setas para escolher, Enter para usar, Esc para fechar.</p>
          <div className={`${ALTURA_LISTA} overflow-y-auto`}>
            {filtradas.map((r, indice) => (
              <LinhaResposta
                key={r.id}
                resposta={r}
                ativa={indice === i}
                aoPassar={() => setSelecao({ termo, i: indice })}
                onEscolher={() => escolher(r)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;

  async function salvarForm(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const atalho = normalizarAtalho(form.atalho);
    const texto = form.texto.trim();
    const problema = erroDeAtalho(atalho) ?? erroDeTextoRapido(texto);
    if (problema) {
      setErroForm(problema);
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(form.id ? `${ENDERECO}/${form.id}` : ENDERECO, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atalho, texto }),
      });
      const dados = (await r.json().catch(() => ({}))) as { itens?: RespostaRapida[]; error?: string };
      if (!r.ok) {
        setErroForm(dados.error ?? "Não foi possível salvar a resposta rápida.");
        return;
      }
      setItens(dados.itens ?? []);
      setForm(VAZIO);
      setErroForm(null);
      setErro(null);
      campoAtalhoRef.current?.focus();
    } catch (e2) {
      setErro(await lerErro(e2));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(resposta: RespostaRapida) {
    if (apagandoId !== null) return;
    const ok = await confirmar(`Apagar a resposta rápida "/${resposta.atalho}"? O texto guardado não volta.`, { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagandoId(resposta.id);
    try {
      const r = await fetch(`${ENDERECO}/${resposta.id}`, { method: "DELETE" });
      if (!r.ok) throw r;
      const dados = (await r.json()) as { itens: RespostaRapida[] };
      setItens(dados.itens ?? []);
      if (form.id === resposta.id) setForm(VAZIO);
      setErro(null);
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setApagandoId(null);
    }
  }

  const Dialogo = (
    <>
      {gestaoAberta && (
        <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 py-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Respostas rápidas" className="card w-full max-w-[560px] p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-1">
              <h2 className="text-[17px] font-bold flex-1">Respostas rápidas</h2>
              <button type="button" className="btn-link shrink-0" onClick={() => setGestaoAberta(false)}>
                Fechar
              </button>
            </div>
            <p className="text-[13px] text-muted mb-4">
              Escreva a barra e o atalho no campo de resposta para usar a frase. Você pode deixar <code>{"{nome}"}</code> para o nome do cliente e{" "}
              <code>{"{atendente}"}</code> para o nome do seu atendente.
            </p>

            {erro && <ErrorBox mensagem={erro.mensagem} acao={erro.acao} />}

            {itens.length === 0 ? (
              <Aviso>Nenhuma resposta rápida ainda. Comece pelas frases que você mais repete no dia.</Aviso>
            ) : (
              <ul className="flex flex-col gap-2 mb-5">
                {itens.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 border border-line rounded-card p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[13px] text-accent-ink">/{r.atalho}</p>
                      <p className="text-[13px] text-ink-2 line-clamp-2">{r.texto}</p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <button type="button" className="btn-link" onClick={() => { setForm({ id: r.id, atalho: r.atalho, texto: r.texto }); setErroForm(null); }}>
                        Editar
                      </button>
                      <button type="button" className="btn-link" onClick={() => apagar(r)} disabled={apagandoId === r.id}>
                        {apagandoId === r.id ? "Apagando…" : "Apagar"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={salvarForm} className="border-t border-line pt-4 flex flex-col gap-3">
              <p className="font-bold text-[14px]">{form.id ? "Corrigir resposta rápida" : "Nova resposta rápida"}</p>
              <label className="block">
                <span className="block text-[13px] font-semibold mb-1">Atalho</span>
                <input
                  ref={campoAtalhoRef}
                  className="input"
                  value={form.atalho}
                  maxLength={LIMITE_ATALHO + 1}
                  placeholder="horario"
                  onChange={(e) => setForm((f) => ({ ...f, atalho: e.target.value }))}
                />
                <span className="block text-[12px] text-muted mt-1">Só letras, números e hífen. Você vai chamá-la de /{normalizarAtalho(form.atalho) || "atalho"}.</span>
              </label>
              <label className="block">
                <span className="block text-[13px] font-semibold mb-1">Texto</span>
                <textarea
                  className="input resize-none leading-snug"
                  rows={4}
                  maxLength={LIMITE_TEXTO_RAPIDO}
                  value={form.texto}
                  placeholder="Oi, {nome}! Atendemos de segunda a sexta, das 8h às 18h."
                  onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
                />
                <span className="block text-[12px] text-muted mt-1">
                  {form.texto.length}/{LIMITE_TEXTO_RAPIDO.toLocaleString("pt-BR")}
                </span>
              </label>
              {erroForm && <Aviso tom="danger">{erroForm}</Aviso>}
              <div className="flex gap-2.5 flex-wrap">
                <button type="submit" className="btn-primary !w-auto" disabled={salvando}>
                  {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Salvar resposta rápida"}
                </button>
                {form.id && (
                  <button type="button" className="btn-ghost !w-auto" onClick={() => { setForm(VAZIO); setErroForm(null); }}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {DialogoConfirmacao}
    </>
  );

  return { Painel, Dialogo, aoTeclar, abrirGestao, aberto, quantas: itens.length };
}
