"use client";
// Painel "Domínio" do workspace: o domínio próprio do site (ex.: www.minhaempresa.com.br), o passo a passo em três
// itens (CNAME no provedor de domínio, cadastro na hospedagem — automático quando conectada —, verificação) e o
// estado atual. A instância serve a versão publicada na raiz para esse Host (proxy.ts).
import { useEffect, useState, type FormEvent } from "react";
import { Aviso, lerErro } from "./ui";
import { ACAO_CONECTAR_HOSPEDAGEM } from "@/lib/acoes";
import type { Projeto } from "@/lib/types";

type Estado = { dominio: string | null; hospedagemConectada: boolean; alvoCname: string; cadastrado: boolean; verificado: boolean; aviso?: string; projeto?: Projeto };

export function PainelDominio({ projeto, aoAtualizar }: { projeto: Projeto; aoAtualizar: (p: Projeto) => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [dominio, setDominio] = useState(projeto.dominio ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(!projeto.dominio);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projeto.id}/dominio`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) setEstado(d); })
      .catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    return () => { ativo = false; };
  }, [projeto.id, projeto.dominio, projeto.render?.siteId]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sites/${projeto.id}/dominio`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dominio }) });
      if (!r.ok) { setErro((await lerErro(r)).mensagem); return; }
      const d = (await r.json()) as Estado;
      setEstado(d);
      if (d.projeto) aoAtualizar(d.projeto);
      setEditando(false);
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    if (!window.confirm(`Tirar o domínio ${projeto.dominio} deste site? Quem abrir esse endereço deixa de ver o site.`)) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sites/${projeto.id}/dominio`, { method: "DELETE" });
      if (!r.ok) { setErro((await lerErro(r)).mensagem); return; }
      const d = (await r.json()) as Estado;
      setEstado(d);
      if (d.projeto) aoAtualizar(d.projeto);
      setDominio("");
      setEditando(true);
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  const alvo = estado?.alvoCname || "o endereço deste app";
  const situacao = !projeto.dominio
    ? null
    : estado?.verificado
      ? { tom: "ok" as const, texto: "Verificado: o domínio já abre o seu site." }
      : estado?.hospedagemConectada
        ? { tom: "warn" as const, texto: estado.cadastrado ? "Aguardando verificação na hospedagem (pode levar até 1 hora depois do CNAME)." : "Domínio salvo aqui; o cadastro na hospedagem ainda não apareceu. Tente de novo em um minuto." }
        : { tom: "warn" as const, texto: "Domínio salvo neste app. Hospedagem não conectada: faça o passo 2 à mão no painel da hospedagem." };

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Domínio do site">
      <h3 className="font-bold text-[14px]">Domínio próprio</h3>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      {estado?.aviso && <Aviso tom="warn">{estado.aviso}</Aviso>}

      {projeto.dominio && !editando ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[13.5px] break-all">{projeto.dominio}</p>
          {situacao && <Aviso tom={situacao.tom}>{situacao.texto}</Aviso>}
          <div className="flex items-center gap-4 flex-wrap text-[13px]">
            <a href={`https://${projeto.dominio}`} target="_blank" rel="noopener noreferrer" className="btn-link">Abrir pelo domínio</a>
            <button type="button" className="btn-link" disabled={ocupado} onClick={() => setEditando(true)}>Trocar</button>
            <button type="button" className="btn-link !text-muted" disabled={ocupado} onClick={remover}>Tirar o domínio</button>
          </div>
        </div>
      ) : (
        <form onSubmit={salvar} className="flex flex-col gap-2">
          <label htmlFor="dominio-site" className="text-[13px] font-semibold">Seu domínio</label>
          <div className="flex gap-2 max-md:flex-col">
            <input id="dominio-site" className="input flex-1 min-w-0 font-mono text-[13px]" placeholder="www.minhaempresa.com.br" value={dominio} disabled={ocupado} onChange={(e) => setDominio(e.target.value)} />
            <button type="submit" className="btn-primary !w-auto !h-11 shrink-0" disabled={ocupado || !dominio.trim()}>{ocupado ? "Salvando..." : "Usar este domínio"}</button>
            {projeto.dominio && <button type="button" className="btn-ghost shrink-0" disabled={ocupado} onClick={() => { setEditando(false); setDominio(projeto.dominio ?? ""); }}>Cancelar</button>}
          </div>
        </form>
      )}

      <ol className="text-[13px] text-ink-2 flex flex-col gap-1.5 list-decimal pl-5">
        <li>No seu provedor de domínio, crie um registro <span className="font-mono">CNAME</span> de <span className="font-mono">www</span> apontando para <span className="font-mono break-all">{alvo}</span>.</li>
        <li>No painel da hospedagem, adicione o domínio ao serviço. {estado?.hospedagemConectada ? "Feito sozinho por este app." : <>Ou <a className="btn-link" href={ACAO_CONECTAR_HOSPEDAGEM.url}>conecte a hospedagem</a> e este app faz por você.</>}</li>
        <li>Aguarde a verificação e o certificado: costuma levar minutos, até 1 hora.</li>
      </ol>
      <p className="text-muted text-[12.5px]">Enquanto a verificação não conclui, o link do site continua funcionando normalmente.</p>
    </section>
  );
}
