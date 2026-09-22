"use client";
// Coluna "Base e premissas": planilhas com papel e mapeamento de colunas, produtos e turmas detectados,
// e o livro de premissas do produto selecionado (com origem: da base, informada, sugerida).
import { useState } from "react";
import type { DadosBase, PapelFPA, Planilha } from "@/lib/types";
import { ROTULO_PAPEL, ROTULO_PAPEL_PLANILHA } from "@/lib/types";
import { CHAVES_PREMISSA, ROTULO_PREMISSA, UNIDADE_PREMISSA, formatarPremissa, GLOSSARIO, type ChavePremissa } from "@/lib/fpa";
import { fmtBRLCurto, fmtMes, fmtNum, fmtPctPontos } from "@/lib/formato";
import { UploadPlanilha } from "./UploadPlanilha";
import { Icon, ErrorBox, request, fmtPct, fmtMs, fmtUsd, Modal } from "./ui";

const ICONE_PAPEL: Record<string, string> = { matriculas: "table", custos: "coins", marketing: "spark", outra: "text" };
const ORDEM_PAPEIS: PapelFPA[] = ["produto", "turma", "data", "receita", "desconto", "alunos", "canal", "custo_fixo", "custo_variavel", "marketing", "nenhum"];

export function Base({ base, jevDisponivel, produtoSelecionado, onProduto, onAtualizar, modo, selecao, onSelecao, onAnalisar }: { modo: "conectores" | "premissas"; selecao: string[]; onSelecao: (ids: string[]) => void; onAnalisar: () => Promise<void>; base: DadosBase | null; jevDisponivel: boolean; produtoSelecionado: string | null; onProduto: (nome: string) => void; onAtualizar: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [papeis, setPapeis] = useState<Record<string, Record<string, PapelFPA>>>({});
  const [editando, setEditando] = useState<ChavePremissa | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [removendo, setRemovendo] = useState<Planilha | null>(null);

  async function acao(chave: string, fn: () => Promise<unknown>) {
    setBusy(chave);
    setError("");
    try {
      await fn();
      await onAtualizar();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);

    }
  }
  const classificar = (p: Planilha) => acao("classificar", () => request(`/api/planilhas/${p.id}/classificar`, "POST", {}));
  const confirmar = (p: Planilha) => acao("confirmar", () => request(`/api/planilhas/${p.id}/papeis`, "PUT", { papeis: papeis[p.id] || {} }));
  const remover = (p: Planilha) => acao("remover", async () => { await request(`/api/planilhas/${p.id}`, "DELETE"); onSelecao(selecao.filter(id => id !== p.id)); setRemovendo(null); });
  const salvarPremissa = (produto: string, chave: ChavePremissa, valor: string) => acao(`premissa_${chave}`, () => request("/api/base/premissas", "PUT", { produto, chave, valor })).then(ok => { if (ok) setEditando(null); });
  const restaurar = (produto: string, chave: ChavePremissa) => acao(`premissa_${chave}`, () => request("/api/base/premissas", "DELETE", { produto, chave }));

  if (!base) return <div className="vazio-coluna"><span className="spinner" /></div>;
  const produto = base.produtos.find((p) => p.nome === produtoSelecionado) || base.produtos[0] || null;
  const premissas = base.premissas.find((p) => p.produto === produto?.nome) || null;
  const papelDe = (p: Planilha, col: string) => papeis[p.id]?.[col] || p.colunas.find((c) => c.nome === col)!.papel;
  const mudou = (p: Planilha) => !!papeis[p.id] && p.colunas.some((c) => papeis[p.id][c.nome] && papeis[p.id][c.nome] !== c.papel);

  return (
    <>
      {modo === "conectores" && <>
        <div className="connector-cards">
          <article className="connector-card available"><Icon name="table" /><div><strong>Planilhas</strong><p>Importe arquivos do seu computador</p></div><span className="chip ok">Disponível</span></article>
          <article className="connector-card"><Icon name="cloud" /><div><strong>OneDrive</strong><p>Arquivos da sua conta Microsoft</p></div><span className="chip neutral">Em breve</span></article>
          <article className="connector-card"><Icon name="table" /><div><strong>Google Sheets</strong><p>Planilhas conectadas ao Google</p></div><span className="chip neutral">Em breve</span></article>
        </div>
        <UploadPlanilha onImportar={async p => { setAberta(p.id); await onAtualizar(); }} />
      </>}
      <ErrorBox error={error} />

      {modo === "conectores" && <section className="bloco fontes-bloco">
        <div className="section-heading"><div><h2>Suas fontes</h2><p>Selecione uma planilha por tipo. Ao analisar outra seleção, uma nova conversa preserva seu histórico.</p></div><button className="primary" disabled={!!busy || !selecao.length} onClick={() => void onAnalisar().catch(e => setError(e.message))}><Icon name="chat" size={16} /> Analisar seleção ({selecao.length})</button></div>
        <h3>Planilhas <Ajuda texto="Matrículas (uma linha por venda), custos por turma e gastos de marketing. O papel de cada coluna define onde o motor lê receita, custos e produto." /></h3>
        <div className="lista-planilhas">
          {base.planilhas.map((p) => {
            const abertaAqui = aberta === p.id;
            const naBase = selecao.includes(p.id);
            return (
              <div key={p.id} className={"planilha-item" + (abertaAqui ? " ativa" : "") + (naBase ? "" : " fora")}>
                <div className="fonte-linha"><input type="checkbox" aria-label={`Usar ${p.nome} na análise`} checked={naBase} disabled={!!busy || p.papelPlanilha === "outra"} onChange={e => onSelecao(e.target.checked ? [...selecao.filter(id => { const outra = base.planilhas.find(x => x.id === id); return outra && outra.papelPlanilha !== p.papelPlanilha && outra.demo === p.demo; }), p.id] : selecao.filter(id => id !== p.id))} /><button className="planilha-cabecalho" onClick={() => setAberta(abertaAqui ? null : p.id)} aria-expanded={abertaAqui}>
                  <span className="ic"><Icon name={ICONE_PAPEL[p.papelPlanilha]} size={16} /></span>
                  <span className="nome">
                    <strong>{p.nome}</strong>
                    <small>
                      {ROTULO_PAPEL_PLANILHA[p.papelPlanilha]} · {p.linhas.toLocaleString("pt-BR")} linhas
                      {naBase && <span className="chip ok">selecionada</span>}
                      {p.demo && <span className="chip warn">exemplo</span>}
                      {!p.mapeamentoConfirmado && !p.demo && <span className="chip">confirmar papéis</span>}
                    </small>
                  </span>
                  <Icon name="chevron" size={14} />
                </button></div>
                {abertaAqui && (
                  <div className="planilha-detalhe"><p className="muted small">Revise o papel de cada coluna para o Jev interpretar os dados corretamente.</p>
                    {p.periodo && <small className="muted">Período: {fmtMes(p.periodo.inicio.slice(0, 7))} a {fmtMes(p.periodo.fim.slice(0, 7))}</small>}
                    {p.harness && <small className="muted">Jev classificou {p.harness.colunas} colunas em {fmtMs(p.harness.latenciaMs)} ({fmtUsd(p.harness.custoUsd)}).</small>}
                    {p.aviso && <small className="muted">{p.aviso}</small>}
                    <div className="colunas">
                      {p.colunas.map((c) => (
                        <div className="coluna-item" key={c.nome}>
                          <strong title={c.nome}>{c.nome}<small className="column-sample">{c.exemplos.slice(0, 2).join(" · ")}</small></strong>
                          <select value={papelDe(p, c.nome)} disabled={!!busy || p.demo} aria-label={`Papel da coluna ${c.nome}`} onChange={(e) => setPapeis({ ...papeis, [p.id]: { ...(papeis[p.id] || {}), [c.nome]: e.target.value as PapelFPA } })}>
                            {ORDEM_PAPEIS.map((op) => <option key={op} value={op}>{ROTULO_PAPEL[op]}</option>)}
                          </select>
                          <span className="origem">
                            {c.papelOrigem === "confirmado" ? "confirmado" : c.papelOrigem === "jev" ? `Jev${c.papelConfianca !== null ? ` · ${fmtPct(c.papelConfianca)}` : ""}` : c.papelOrigem === "exemplo" ? "exemplo" : "leitura local"}
                            {(c.dadoPessoal ?? 0) >= 0.5 && <span className="chip bad">dado pessoal</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="perfil-acoes">
                      {!p.demo && (
                        <button className="primary pequeno" disabled={!!busy || (p.mapeamentoConfirmado && !mudou(p))} onClick={() => void confirmar(p)}>
                          {busy === "confirmar" ? <span className="spinner" /> : <Icon name="check" size={14} />} {p.mapeamentoConfirmado && !mudou(p) ? "Mapeamento confirmado" : "Confirmar mapeamento"}
                        </button>
                      )}
                      {jevDisponivel && !p.demo && (
                        <button className="text-button" disabled={!!busy} onClick={() => void classificar(p)}>
                          {busy === "classificar" ? <span className="spinner" /> : <Icon name="spark" size={14} />} Mapear com o Jev
                        </button>
                      )}
                      {!p.demo && (
                        <button className="text-button" style={{ color: "var(--bad)" }} disabled={!!busy} onClick={() => setRemovendo(p)}>
                          <Icon name="trash" size={14} /> Remover
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {base.avisos.length > 0 && <div className="aviso-qualidade">{base.avisos.map((a, i) => <div key={i}>{a}</div>)}</div>}
      </section>}

      {modo === "premissas" && <><section className="bloco">
        <h3>Produtos e turmas <Ajuda texto="Detectados na planilha de matrículas: cada valor da coluna Produto é um produto; cada valor da coluna Turma (ou cada mês de início) é uma turma." /></h3>
        {base.produtos.length === 0 ? (
          <p className="muted small">Envie a planilha de matrículas e confirme as colunas de produto e receita para ver os produtos aqui.</p>
        ) : (
          <div className="lista-produtos">
            {base.produtos.map((p) => (
              <button key={p.nome} className={"produto-item" + (produto?.nome === p.nome ? " ativo" : "")} onClick={() => onProduto(p.nome)}>
                <strong>{p.nome}</strong>
                <small>
                  {fmtNum(p.turmas)} {p.turmas === 1 ? "turma" : "turmas"} · {p.alunosPorTurma === null ? "—" : fmtNum(p.alunosPorTurma, 0)} alunos/turma · {p.ticketMedio === null ? "—" : fmtBRLCurto(p.ticketMedio)}
                  {p.margemHistoricaPct !== null && <span className={"chip " + (p.margemHistoricaPct >= 30 ? "ok" : p.margemHistoricaPct >= 15 ? "warn" : "bad")}>{fmtPctPontos(p.margemHistoricaPct, 0)} de margem</span>}
                </small>
              </button>
            ))}
          </div>
        )}
        {base.baseline && <small className="muted">Período de referência: {base.baseline.rotulo}, {fmtBRLCurto(base.baseline.receita)} de receita e {fmtPctPontos((base.baseline.contribuicao / base.baseline.receita) * 100)} de margem.</small>}
      </section>

      {produto && premissas && (
        <section className="bloco">
          <h3>Premissas de {produto.nome} <Ajuda texto={GLOSSARIO.premissa} /></h3>
          <div className="premissas">
            {CHAVES_PREMISSA.map((chave) => {
              const p = premissas.premissas.find((x) => x.chave === chave) || null;
              const emEdicao = editando === chave;
              return (
                <div key={chave} className={"premissa" + (p ? ` ${p.origem}` : " faltante")}>
                  <span className="rotulo">{ROTULO_PREMISSA[chave]}</span>
                  {emEdicao ? (
                    <form className="edicao" onSubmit={(e) => { e.preventDefault(); void salvarPremissa(produto.nome, chave, valorEdicao); }}>
                      <input autoFocus inputMode="decimal" value={valorEdicao} onChange={(e) => setValorEdicao(e.target.value)} aria-label={ROTULO_PREMISSA[chave]} placeholder={UNIDADE_PREMISSA[chave] === "moeda" ? "R$" : UNIDADE_PREMISSA[chave] === "percentual" ? "%" : ""} />
                      <button className="icon-button" type="submit" aria-label="Salvar" disabled={!!busy}><Icon name="check" size={16} /></button>
                      <button className="icon-button" type="button" aria-label="Cancelar" onClick={() => setEditando(null)}><Icon name="close" size={16} /></button>
                    </form>
                  ) : (
                    <button className="valor" title={p?.detalhe || "Sem valor: informe para os cenários deste produto"} onClick={() => { setEditando(chave); setValorEdicao(p ? String(Math.round(p.valor * 100) / 100).replace(".", ",") : ""); }}>
                      <strong>{p ? formatarPremissa(chave, p.valor) : "informar"}</strong>
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                  <span className="origem">
                    {p ? <span className={"chip " + (p.origem === "base" ? "neutral" : p.origem === "informada" ? "ok" : "warn")}>{p.origem === "base" ? "da base" : p.origem === "informada" ? "informada" : "sugerida"}</span> : <span className="chip bad">falta</span>}
                    {p?.origem === "informada" && premissas.daBase[chave] && (
                      <button className="text-button" disabled={!!busy} onClick={() => void restaurar(produto.nome, chave)} title={`Voltar a ${formatarPremissa(chave, premissas.daBase[chave]!.valor)} (${premissas.daBase[chave]!.detalhe})`}>voltar à base</button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <small className="muted">Toque em um valor para informar o seu. Premissas informadas valem sobre as da base em todos os cenários do produto.</small>
        </section>
      )}
      {!produto && <div className="empty-state"><Icon name="book" size={28} /><h3>O livro começa com a sua base</h3><p>Selecione uma fonte de matrículas em Conectores para ver as premissas dos produtos.</p></div>}
      </>}
      {removendo && <Modal title="Excluir fonte?" onClose={() => !busy && setRemovendo(null)}><p>“{removendo.nome}” será excluída desta instalação. As respostas anteriores ficam no histórico, mas conversas que usam esta fonte precisarão de uma nova seleção para continuar.</p><div className="dialog-actions"><button className="secondary" disabled={!!busy} onClick={() => setRemovendo(null)}>Cancelar</button><button className="danger-button" disabled={!!busy} onClick={() => void remover(removendo)}>Excluir fonte</button></div></Modal>}
    </>
  );
}

export function Ajuda({ texto }: { texto: string }) {
  return (
    <span className="ajuda" tabIndex={0} aria-label={texto} title={texto}>
      <Icon name="info" size={13} />
    </span>
  );
}
