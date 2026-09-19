"use client";
import { ProgressoEnriquecimento } from "./ProgressoEnriquecimento";
import { useState } from "react";
import { sugerirTermos, type TermoPesquisa } from "@/lib/consulta-candidato";
import type { Candidato } from "@/lib/candidatos";
import { Aviso, ErrorBox, lerErro, type ErroLido } from "./ui";

type Pessoa = Pick<Candidato, "id" | "nome" | "ficha" | "cidade" | "termoBusca" | "linkedinUrl">;
export function PesquisaComplementar({ candidato, aoPesquisar, correndo = false }: { candidato: Pessoa; aoPesquisar?: () => void; correndo?: boolean }) {
  const [modal, setModal] = useState(false);
  const [termos, setTermos] = useState(() => sugerirTermos(candidato));
  const [novo, setNovo] = useState("");
  function adicionar() {
    const valor = novo.trim();
    if (!valor || termos.length >= 12) return;
    if (!termos.some((t) => t.valor.toLocaleLowerCase() === valor.toLocaleLowerCase())) setTermos([...termos, { tipo: "chave", valor }]);
    setNovo("");
  }
  const rotulos: Record<TermoPesquisa["tipo"], string> = { nome: "Nome", linkedin: "LinkedIn", cidade: "Cidade", empresa: "Empresa", chave: "Palavra-chave" };
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroLido | null>(null);
  const [recado, setRecado] = useState("");
  async function pesquisar() {
    setOcupado(true); setErro(null); setRecado("");
    try {
      const r = await fetch(`/api/candidatos/${candidato.id}/pesquisar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ termos }) });
      if (!r.ok) throw r;
      const corpo = await r.json();
      if (corpo.aviso) { setErro({ mensagem: corpo.aviso, acao: corpo.acao }); return; }
      setRecado("Pesquisa iniciada. Você pode continuar; os resultados aparecerão na ficha do candidato.");
      setModal(true);
      aoPesquisar?.();
    } catch (e) { setErro(await lerErro(e)); }
    finally { setOcupado(false); }
  }
  return (
    <>
    <section className="card p-6 max-md:p-5 mb-6 border-accent/20 bg-gradient-to-br from-accent-soft/70 to-surface">
      <p className="sobretitulo mb-2">Enriquecimento do currículo</p>
      <h2 className="font-bold text-lg mb-1">Um perfil mais completo para decidir melhor</h2>
      <p className="text-sm text-muted mb-4">Escolha as pistas para encontrar a pessoa certa. A busca combina os termos e ajusta as consultas conforme os resultados.</p>
      <fieldset disabled={ocupado || correndo}>
        <legend className="text-sm font-semibold mb-2">Termos para a busca</legend>
        <ul className="flex flex-wrap gap-2 mb-3" aria-label="Termos selecionados">
          {termos.map((termo, i) => <li key={`${termo.tipo}-${termo.valor}`} className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-surface pl-3 pr-1 py-1 text-sm max-w-full">
            <span className="min-w-0 break-words"><span className="text-muted text-xs">{rotulos[termo.tipo]}: </span>{termo.valor}</span>
            <button type="button" className="shrink-0 rounded-lg p-2 hover:bg-accent-soft" aria-label={`Remover ${termo.valor}`} onClick={() => setTermos(termos.filter((_, indice) => indice !== i))}>×</button>
          </li>)}
        </ul>
        <div className="flex gap-2 max-md:flex-col">
          <input aria-label="Adicionar palavra-chave" className="input" placeholder="Adicionar cargo, empresa ou outra palavra-chave" value={novo} maxLength={200} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }} />
          <button type="button" className="btn-ghost" disabled={!novo.trim() || termos.length >= 12} onClick={adicionar}>Adicionar termo</button>
        </div>
        <button type="button" className="btn-link text-xs mt-3" onClick={() => setTermos(sugerirTermos(candidato))}>Restaurar sugestões do candidato</button>
      </fieldset>
      <div className="flex items-center gap-3 flex-wrap mt-4">
        <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={ocupado || !termos.length || Boolean(novo.trim())} onClick={() => correndo || recado ? setModal(true) : void pesquisar()}>{ocupado ? "Iniciando..." : correndo || recado ? "Acompanhar enriquecimento" : "Enriquecer com dados da web"}</button>
        <span className="text-xs text-muted">Usa a conexão com a Bright Data.</span>
      </div>
      {erro && <div className="mt-3"><ErrorBox mensagem={erro.mensagem} acao={erro.acao} /></div>}
      {recado && <div className="mt-3" role="status"><Aviso tom="ok">{recado}</Aviso></div>}
    </section>
    {modal && <ProgressoEnriquecimento id={candidato.id} nome={candidato.nome} onFechar={() => setModal(false)} onConcluiu={() => { setRecado(""); aoPesquisar?.(); }} />}
    </>
  );
}
