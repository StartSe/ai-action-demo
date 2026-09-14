"use client";
// Tela de configuração inicial, gerada a partir de lib/integracoes.ts. Compartilhada pela suíte: copie sem alterar.
import Link from "next/link";
import { useEffect, useState } from "react";
import { MaisDetalhes, Topbar, useStatus } from "./ui";
import type { CampoStatus, IntegracaoStatus } from "@/lib/setup-comum";

type Resposta = { integracoes: IntegracaoStatus[]; pronto: boolean };

export function SetupPage({ marca, nome, area }: { marca: string; nome: string; area: string }) {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = () => fetch("/api/setup").then((r) => r.json()).then(setDados).catch(() => setAviso({ tipo: "erro", texto: "Não foi possível carregar a configuração." }));
  const primeiroPendenteId = dados?.integracoes.find((i) => i.obrigatoria && !i.configurada)?.id;

  useEffect(() => {
    const t = setTimeout(() => {
      carregar();
      const p = new URLSearchParams(location.search);
      if (p.get("conectado")) setAviso({ tipo: "ok", texto: "Conta conectada. A chave foi salva neste app." });
      if (p.get("erro")) setAviso({ tipo: "erro", texto: p.get("erro") || "" });
      if (p.get("conectado") || p.get("erro")) history.replaceState(null, "", "/setup");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Topbar marca={marca} nome={nome} area={area} status={status} erro={erro} />
      <main className="max-w-[860px] mx-auto px-8 max-md:px-4 pt-8 pb-16">
        <div className="mb-7">
          <h1 className="text-[30px] max-md:text-[26px] leading-[1.15] font-extrabold tracking-[-0.025em] mb-2.5">Configuração inicial</h1>
          <p className="text-muted max-w-[620px]">Conecte o que o app precisa. As chaves ficam guardadas só neste app, nunca aparecem por inteiro depois de salvas, e você pode trocá-las quando quiser.</p>
          {dados && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-muted">{dados.integracoes.filter((i) => i.configurada).length} de {dados.integracoes.length} conectados</span>
              <span className={`text-sm font-semibold ${dados.pronto ? "text-ok" : "text-warn"}`}>
                {dados.pronto ? "Tudo pronto para usar com IA de verdade." : "Falta conectar a inteligência artificial para sair do modo demonstração."}
              </span>
            </div>
          )}
        </div>

        {aviso && (
          <div className={`mb-5 px-4 py-3 rounded-[10px] text-sm border ${aviso.tipo === "ok" ? "bg-[#e4f4ec] border-[#bfe3cf] text-ok" : "bg-[#fde8e6] border-[#f5c2bd] text-danger"}`}>{aviso.texto}</div>
        )}

        {!dados && !aviso && <p className="text-muted">Carregando...</p>}

        {dados?.pronto && (
          <section className="card border-accent p-6 max-md:p-5 mb-5">
            <h2 className="text-lg font-bold mb-1">Tudo pronto</h2>
            <p className="text-muted text-sm mb-4">Já dá para usar o app com IA de verdade.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link href="/?exemplo=1" className="btn-primary !w-auto">Testar com um exemplo</Link>
              <Link href="/" className="btn-ghost">Ir para o app</Link>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-5">
          {dados?.integracoes.map((i) => (
            <CartaoIntegracao key={i.id} integracao={i} aoSalvar={carregar} destaque={i.id === primeiroPendenteId} />
          ))}
        </div>

        <div className="mt-8 flex gap-3 flex-wrap items-center">
          <Link href="/" className="btn-primary !w-auto">Ir para o app</Link>
        </div>

        <MaisDetalhes titulo="Para a equipe técnica">
          <p className="text-muted text-[13px]">Variáveis de ambiente, quando existirem, têm prioridade sobre o que é salvo aqui.</p>
          <p className="text-muted text-[13px]">Neste plano de hospedagem, o histórico pode se perder ao reiniciar.</p>
          {dados && (
            <ul className="mt-2 flex flex-col gap-1 text-[13px] text-muted">
              {dados.integracoes.flatMap((i) =>
                i.campos.filter((c) => c.definido).map((c) => (
                  <li key={c.chave}>
                    <code>{c.chave}</code>: {c.origem === "env" ? "variável de ambiente (tem prioridade sobre o valor salvo aqui)" : "salvo neste app"}
                  </li>
                ))
              )}
            </ul>
          )}
        </MaisDetalhes>
      </main>
    </>
  );
}

function CartaoIntegracao({ integracao: i, aoSalvar, destaque }: { integracao: IntegracaoStatus; aoSalvar: () => void; destaque?: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [testando, setTestando] = useState(false);
  const alterado = Object.values(valores).some((v) => v !== "");

  async function salvar() {
    setSalvando(true); setTeste(null);
    try {
      const r = await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores }) });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setValores({});
      aoSalvar();
    } catch (e) {
      setTeste({ ok: false, mensagem: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally { setSalvando(false); }
  }

  async function desconectar() {
    setDesconectando(true); setTeste(null);
    try {
      const valoresNulos = Object.fromEntries(i.campos.map((c) => [c.chave, null]));
      const r = await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores: valoresNulos }) });
      if (!r.ok) throw new Error("Falha ao desconectar.");
      setValores({});
      aoSalvar();
    } catch (e) {
      setTeste({ ok: false, mensagem: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally { setDesconectando(false); }
  }

  async function testar() {
    setTestando(true); setTeste(null);
    try {
      const r = await fetch("/api/setup/testar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id }) });
      setTeste(await r.json());
    } catch { setTeste({ ok: false, mensagem: "Não foi possível testar agora." }); }
    finally { setTestando(false); }
  }

  const chaveSecreta = i.campos.find((c) => c.tipo === "secret");
  const passos = i.oauth ? [] : passosSetup(i);
  const aoMudarCampo = (chave: string) => (v: string) => setValores((s) => ({ ...s, [chave]: v }));
  const camposPrincipais = i.campos.filter((c) => !c.avancado);
  const camposAvancados = i.campos.filter((c) => c.avancado);

  const campos = (
    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
      {camposPrincipais.map((c) => <CampoSetup key={c.chave} campo={c} valor={valores[c.chave] ?? ""} aoMudar={aoMudarCampo(c.chave)} />)}
    </div>
  );

  const opcoesAvancadas = camposAvancados.length > 0 && (
    <MaisDetalhes titulo="Opções avançadas">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
        {camposAvancados.map((c) => <CampoSetup key={c.chave} campo={c} valor={valores[c.chave] ?? ""} aoMudar={aoMudarCampo(c.chave)} />)}
      </div>
    </MaisDetalhes>
  );

  const acoesSalvar = (
    <div className="flex items-center gap-3 flex-wrap mt-4">
      <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={!alterado || salvando}>{salvando ? "Salvando" : "Salvar"}</button>
      {!alterado && <span className="text-muted text-sm">Preencha ao menos um campo para salvar</span>}
      {i.link && <a className="btn-link text-sm" href={i.link.url} target="_blank" rel="noreferrer">{i.link.rotulo}</a>}
    </div>
  );

  return (
    <section id={i.id} className={`card p-6 max-md:p-5 ${destaque ? "border-accent border-2" : ""}`}>
      <div className="flex justify-between gap-4 items-start mb-2 flex-wrap">
        <h2 className="text-lg font-bold">{i.titulo}</h2>
        <span className={i.configurada ? "chip-positivo" : i.obrigatoria ? "chip-media" : "chip-neutral"}>{i.configurada ? "conectado" : i.obrigatoria ? "pendente" : "opcional"}</span>
      </div>
      <p className="text-muted text-sm mb-4 max-w-[640px]">{i.descricao}</p>

      {i.oauth ? (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            {i.configurada ? (
              <>
                <span className="chip-positivo">Conectado{chaveSecreta?.mascarado ? ` · ${chaveSecreta.mascarado}` : ""}</span>
                <button type="button" className="btn-ghost" onClick={desconectar} disabled={desconectando}>{desconectando ? "Desconectando" : "Desconectar"}</button>
                <button type="button" className="btn-ghost" onClick={testar} disabled={testando}>{testando ? "Testando" : "Testar conexão"}</button>
              </>
            ) : (
              <a href={i.oauth.url} className="btn-primary !w-auto">{i.oauth.rotulo}</a>
            )}
          </div>
          <MaisDetalhes titulo="Opções avançadas: colar uma chave">
            {campos}
            {opcoesAvancadas}
            {acoesSalvar}
          </MaisDetalhes>
        </>
      ) : (
        <>
          {passos.length > 0 && (
            <ol className="list-decimal list-inside flex flex-col gap-1 text-sm text-muted mb-4">
              {passos.map((p) => <li key={p}>{p}</li>)}
            </ol>
          )}
          {campos}
          {opcoesAvancadas}
          <div className="flex items-center gap-3 flex-wrap mt-4">
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={!alterado || salvando}>{salvando ? "Salvando" : "Salvar"}</button>
            {!alterado && <span className="text-muted text-sm">Preencha ao menos um campo para salvar</span>}
            {i.configurada && <button type="button" className="btn-ghost" onClick={testar} disabled={testando}>{testando ? "Testando" : "Testar conexão"}</button>}
            {i.link && <a className="btn-link text-sm" href={i.link.url} target="_blank" rel="noreferrer">{i.link.rotulo}</a>}
          </div>
        </>
      )}
      {teste && <p className={`mt-3 text-sm font-semibold ${teste.ok ? "text-ok" : "text-danger"}`}>{teste.mensagem}</p>}
    </section>
  );
}

/** Passo a passo de até três passos, gerado a partir do link para obter a chave e da ajuda do primeiro campo. */
function passosSetup(i: IntegracaoStatus): string[] {
  const passos: string[] = [];
  if (i.link) passos.push(`Abra "${i.link.rotulo}" e copie a chave.`);
  if (i.campos[0]?.ajuda) passos.push(i.campos[0].ajuda);
  passos.push("Cole a chave abaixo e clique em Salvar.");
  return passos.slice(0, 3);
}

function CampoSetup({ campo: c, valor, aoMudar }: { campo: CampoStatus; valor: string; aoMudar: (v: string) => void }) {
  const id = `campo-${c.chave}`;
  const rotulo = `${c.rotulo}${c.opcional ? " (opcional)" : ""}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{rotulo}</label>
      {c.tipo === "select" ? (
        <select id={id} className="input" value={valor || c.valorVisivel || c.padrao || ""} onChange={(e) => aoMudar(e.target.value)}>
          {(c.opcoes || []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          {c.valorVisivel && !(c.opcoes || []).some((o) => o.valor === c.valorVisivel) && <option value={c.valorVisivel}>{c.valorVisivel}</option>}
        </select>
      ) : (
        <input id={id} className="input" type={c.tipo === "secret" ? "password" : "text"} autoComplete="off" value={valor} onChange={(e) => aoMudar(e.target.value)}
          placeholder={c.tipo === "secret" && c.mascarado ? `salvo: ${c.mascarado}` : c.tipo === "text" && c.valorVisivel ? c.valorVisivel : c.placeholder || ""} />
      )}
      {c.ajuda && <span className="text-[12.5px] text-muted">{c.ajuda}</span>}
    </div>
  );
}
