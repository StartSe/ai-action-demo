"use client";
import { useEffect, useState } from "react";
import { FUSO_PADRAO, HORARIOS_PADRAO, type Monitoramento } from "@/lib/monitoramento";
import type { DadosRadar } from "@/lib/types";

type Item = { id: string; parametros: Monitoramento; ativa: boolean; ultimaExecucao: string | null; ultimaFalha: string | null };

export function Monitoramentos({ dados, onEditar }: { dados: DadosRadar; onEditar: (dados: DadosRadar) => void }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [horarios, setHorarios] = useState(HORARIOS_PADRAO.join(", "));
  const [fuso, setFuso] = useState(FUSO_PADRAO);
  const [id, setId] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  async function carregar() {
    const r = await fetch("/api/radar/monitoramentos");
    if (!r.ok) throw new Error("Não foi possível carregar os monitoramentos.");
    setItens((await r.json()).itens);
  }
  useEffect(() => {
    let ativo = true;
    fetch("/api/radar/monitoramentos").then(async r => {
      if (!r.ok) throw new Error("Não foi possível carregar os monitoramentos.");
      return r.json();
    }).then(v => { if (ativo) setItens(v.itens); }).catch(e => { if (ativo) setMensagem(e.message); });
    return () => { ativo = false; };
  }, []);
  async function pedido(url: string, method: string, corpo?: unknown) {
    setOcupado(true); setMensagem("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      const v = await r.json();
      if (!r.ok || v.ok === false) throw new Error(v.error || v.mensagem || "Não foi possível concluir.");
      await carregar();
      setMensagem(v.mensagem || "Monitoramento atualizado.");
      if (url === "/api/radar/monitoramentos") setId(undefined);
    } catch (e) { setMensagem((e as Error).message); }
    finally { setOcupado(false); }
  }
  return <section id="monitoramentos" className="card p-5 mt-4">
    <h2 className="font-bold text-lg">Monitoramento diário</h2>
    <p className="text-sm text-muted mt-1 mb-4">Cadastre os termos do formulário para receber insights de negócio por e-mail ou Slack. Padrão: 8h, 16h e 20h, no horário de Brasília.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Horários (separados por vírgula)<input className="input mt-1" value={horarios} onChange={e => setHorarios(e.target.value)} placeholder="08:00, 16:00, 20:00" /></label>
      <label className="text-sm">Fuso horário<input className="input mt-1" value={fuso} onChange={e => setFuso(e.target.value)} list="fusos-radar" /></label>
      <datalist id="fusos-radar"><option value="America/Sao_Paulo"/><option value="America/Manaus"/><option value="Europe/Lisbon"/><option value="UTC"/></datalist>
    </div>
    <p className="text-xs text-muted my-3">Usa os termos, setor e período do formulário acima. Os termos cadastrados ficam salvos neste app. Configure a IA e o canal em <a href="/setup" className="underline">Configurações</a>.</p>
    <button type="button" className="btn-primary" disabled={ocupado || !dados.temas.length} onClick={() => pedido("/api/radar/monitoramentos", "POST", { ...dados, id, horarios: horarios.split(",").map(h => h.trim()), fuso })}>{id ? "Salvar alterações" : "Monitorar estes termos"}</button>
    {id && <button type="button" className="btn-link mt-2" onClick={() => setId(undefined)}>Cancelar edição</button>}
    {mensagem && <p role="status" className="text-sm mt-3">{mensagem}</p>}
    <ul className="mt-4 space-y-4">{itens.map(r => <li key={r.id} className="border-t border-line pt-3">
      <p className="font-semibold text-sm">{r.parametros.temas.join(" · ")}</p>
      <p className="text-sm text-muted">{r.ativa ? "Ativo" : "Pausado"} · {r.parametros.horarios.join(", ")} · {r.parametros.fuso}</p>
      <p className="text-xs text-muted mt-1">{r.ultimaExecucao ? `Última execução: ${new Date(r.ultimaExecucao).toLocaleString("pt-BR", { timeZone: r.parametros.fuso })}` : "Aguardando o próximo horário"}</p>
      {r.ultimaFalha && <p className="text-sm text-red-700 mt-1">{r.ultimaFalha}</p>}
      <div className="flex flex-wrap gap-3 mt-2 text-sm">
        <button disabled={ocupado} type="button" className="btn-link" onClick={() => { setId(r.id); setHorarios(r.parametros.horarios.join(", ")); setFuso(r.parametros.fuso); onEditar(r.parametros); setMensagem("Edite os termos no formulário acima e salve as alterações."); }}>Editar</button>
        <button disabled={ocupado} type="button" className="btn-link" onClick={() => pedido(`/api/rotinas/${r.id}`, "PATCH", { ativa: !r.ativa })}>{r.ativa ? "Pausar" : "Retomar"}</button>
        <button disabled={ocupado} type="button" className="btn-link" onClick={() => pedido(`/api/rotinas/${r.id}/executar-agora`, "POST")}>Executar agora</button>
        <button disabled={ocupado} type="button" className="btn-link" onClick={() => pedido(`/api/rotinas/${r.id}`, "DELETE")}>Excluir</button>
      </div>
    </li>)}</ul>
    <p className="text-xs text-muted mt-3">Os resultados e grafos ficam no <a href="/historico" className="underline">histórico</a>. O servidor precisa permanecer ativo para executar nos horários; após uma interrupção, roda apenas a rodada mais recente.</p>
  </section>;
}
