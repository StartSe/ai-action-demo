"use client";
import { useEffect, useRef, useState } from "react";
import { FUSO_PADRAO, HORARIOS_PADRAO, type Monitoramento } from "@/lib/monitoramento";
import type { DadosRadar } from "@/lib/types";
import type { ExecucaoRadar } from "@/lib/rotinas";
import { pedidoJSON } from "@/lib/pedido-json";
type Item = { id: string; parametros: Monitoramento; ativa: boolean; ultimaExecucao: string | null; ultimaFalha: string | null };
type Estado = { itens: Item[]; execucoes: ExecucaoRadar[] };
const ROTULOS = { pendente: "Na fila", executando: "Pesquisando", sucesso: "Concluída", falha: "Falhou", interrompida: "Interrompida" };
export function Monitoramentos({ dados, desabilitado = false }: { desabilitado?: boolean; dados: DadosRadar }) {
  const ultimaAnalise = useRef<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ itens: [], execucoes: [] });
  const [carregando, setCarregando] = useState(true);
  const [horarios, setHorarios] = useState(HORARIOS_PADRAO.join(", "));
  const [fuso, setFuso] = useState(FUSO_PADRAO);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const url = `/api/radar/monitoramentos?radarId=${dados.radarId || ""}`;
  useEffect(() => {
    let ativo = true;
    const atualizar = async () => { try { const d = await pedidoJSON<Estado>(url); if (ativo) {
      const ultima = d.execucoes.find(e => e.estado === "sucesso")?.resultadoId || "";
      if (ultimaAnalise.current !== null && ultima && ultima !== ultimaAnalise.current) window.dispatchEvent(new CustomEvent("radar-atualizado", { detail: { radarId: dados.radarId } }));
      ultimaAnalise.current = ultima; setEstado(d); setCarregando(false);
    } } catch(e) { if (ativo) { setMensagem((e as Error).message); setCarregando(false); } } };
    void atualizar(); const timer = setInterval(atualizar, 5000);
    return () => { ativo = false; clearInterval(timer); };
  }, [url, dados.radarId]);
  const rotina = estado.itens[0];
  const executando = estado.execucoes.some(e => ["pendente", "executando"].includes(e.estado));
  async function pedido(caminho: string, method: string, corpo?: unknown) {
    setOcupado(true); setMensagem("");
    try {
      const v = await pedidoJSON<{ mensagem?: string }>(caminho, { method, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      setEstado(await pedidoJSON<Estado>(url)); setMensagem(v.mensagem || "Acompanhamento atualizado."); setEditando(false);
    } catch(e) { setMensagem((e as Error).message); } finally { setOcupado(false); }
  }
  return <section id="monitoramentos" className="monitoring-panel">
    <div className="monitoring-summary"><div><div className="flex items-center gap-2"><span className={`monitoring-dot ${rotina?.ativa ? "ativa" : ""}`} /><h2>Acompanhamento diário</h2><span className="monitoring-state">{carregando ? "Carregando…" : executando ? "Pesquisando" : rotina ? rotina.ativa ? "Ativo" : "Pausado" : "Aguardando conexão"}</span></div><p>{rotina ? `${rotina.parametros.horarios.join(" · ")} · ${rotina.parametros.fuso} · roda com o app fechado` : "Defina palavras-chave e conecte a IA para começar. As fontes públicas já estão disponíveis."}</p></div><div className="flex flex-wrap gap-3 text-sm">{rotina && <><button type="button" className="btn-link" disabled={ocupado || executando} onClick={() => pedido(`/api/rotinas/${rotina.id}/executar-agora`, "POST")}>{executando ? "Em andamento…" : "Pesquisar agora"}</button><button type="button" className="btn-link" disabled={ocupado} onClick={() => pedido(`/api/rotinas/${rotina.id}`, "PATCH", { ativa: !rotina.ativa })}>{rotina.ativa ? "Pausar" : "Retomar"}</button></>}<button type="button" className="btn-link" onClick={() => { setEditando(!editando); setHorarios(rotina?.parametros.horarios.join(", ") || HORARIOS_PADRAO.join(", ")); setFuso(rotina?.parametros.fuso || FUSO_PADRAO); }}>{editando ? "Fechar ajustes" : "Ajustar horários"}</button></div></div>
    {editando && <div className="monitoring-edit"><div className="grid sm:grid-cols-2 gap-3"><label className="radar-field">Horários<input className="input" value={horarios} onChange={e => setHorarios(e.target.value)} placeholder="08:00, 16:00" /></label><label className="radar-field">Fuso horário<input className="input" value={fuso} onChange={e => setFuso(e.target.value)} list="fusos-radar" /></label><datalist id="fusos-radar"><option value="America/Sao_Paulo"/><option value="America/Manaus"/><option value="Europe/Lisbon"/><option value="UTC"/></datalist></div><p className="field-help my-3">Separe os horários por vírgula. As rodadas usam sempre os temas e fontes salvos neste radar.</p><button type="button" className="btn-primary !w-auto !h-10" disabled={ocupado || desabilitado || !dados.temas.length} onClick={() => pedido("/api/radar/monitoramentos", "POST", { ...dados, id: rotina?.id, horarios: horarios.split(",").map(h => h.trim()), fuso })}>{rotina ? "Salvar horários" : "Ativar acompanhamento"}</button>{desabilitado && <p className="field-help mt-2">Salve os temas antes de alterar a agenda.</p>}</div>}
    {mensagem && <p role="status" className="text-sm mt-3">{mensagem}</p>}{rotina?.ultimaFalha && <p role="alert" className="text-sm mt-3">Última tentativa: {rotina.ultimaFalha}</p>}
    <details className="monitoring-history"><summary>Histórico de atualizações <span>{estado.execucoes.length ? `${estado.execucoes.length} rodadas` : "Nenhuma rodada automática ainda"}</span></summary>{estado.execucoes.length ? <ol>{estado.execucoes.map(e => <li key={e.id}><span className={`run-status ${e.estado}`}>{ROTULOS[e.estado]}</span><div><time>{new Date(e.iniciadaEm).toLocaleString("pt-BR")}</time><small>{e.origem === "agenda" ? "Agenda diária" : "Solicitada por você"}{e.encerradaEm ? ` · ${Math.max(1, Math.round((Date.parse(e.encerradaEm) - Date.parse(e.iniciadaEm)) / 1000))} s` : ""}</small>{e.mensagem && e.estado !== "sucesso" && <p>{e.mensagem}</p>}</div>{e.resultadoId && <a className="btn-link" href={`/r/${e.resultadoId}`}>Ver análise ↗</a>}</li>)}</ol> : <p className="text-sm text-muted py-4">Cada tentativa ficará registrada aqui, inclusive quando uma fonte falhar.</p>}<p className="field-help">O servidor precisa estar ativo. Após uma interrupção, o radar retoma a rodada mais recente. Três falhas seguidas pausam a agenda.</p></details>
  </section>;
}
