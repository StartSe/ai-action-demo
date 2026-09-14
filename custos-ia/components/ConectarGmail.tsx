"use client";
// Cartão próprio do /setup para o Gmail (US-021). O cartão genérico (components/setup.tsx, comparado
// byte a byte entre os apps) não sabe mostrar "Conectado como {e-mail}" nem um bloco "Para a equipe
// técnica" com o endereço de retorno e as credenciais do app — por isso o Gmail sai da lista genérica
// (app/api/setup/route.ts) e ganha este componente, no mesmo molde de AcessoMCP.tsx.
import { useEffect, useState } from "react";
import { CopyButton, MaisDetalhes } from "./ui";

type Estado = {
  conectado: boolean;
  conta: string | null;
  credenciaisDoApp: boolean;
  credenciaisNoAmbiente: boolean;
  redirectUri: string;
};

export function ConectarGmail() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [desconectando, setDesconectando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = () => fetch("/api/gmail").then((r) => r.json()).then(setEstado).catch(() => {});

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, []);

  async function desconectar() {
    setDesconectando(true); setAviso(null);
    try {
      const r = await fetch("/api/gmail", { method: "DELETE" });
      if (!r.ok) throw new Error("Falha ao desconectar.");
      await carregar();
    } catch (e) {
      setAviso({ ok: false, mensagem: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally { setDesconectando(false); }
  }

  async function testar() {
    setTestando(true); setAviso(null);
    try {
      const r = await fetch("/api/setup/testar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "gmail" }) });
      setAviso(await r.json());
    } catch { setAviso({ ok: false, mensagem: "Não foi possível testar agora." }); }
    finally { setTestando(false); }
  }

  async function salvarCredenciais() {
    setSalvando(true); setAviso(null);
    try {
      const valores: Record<string, string> = {};
      if (clientId.trim()) valores.GOOGLE_CLIENT_ID = clientId.trim();
      if (clientSecret.trim()) valores.GOOGLE_CLIENT_SECRET = clientSecret.trim();
      const r = await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores }) });
      if (!r.ok) throw new Error("Falha ao salvar as credenciais.");
      setClientId(""); setClientSecret("");
      await carregar();
      setAviso({ ok: true, mensagem: "Credenciais salvas. Agora é só clicar em Conectar o Gmail." });
    } catch (e) {
      setAviso({ ok: false, mensagem: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally { setSalvando(false); }
  }

  const chip = estado?.conectado ? "chip-positivo" : "chip-neutral";

  return (
    <section id="gmail" className="card p-6 max-md:p-5">
      <div className="flex justify-between gap-4 items-start mb-2 flex-wrap">
        <h2 className="text-lg font-bold">Gmail</h2>
        <span className={chip}>{estado?.conectado ? "conectado" : "opcional"}</span>
      </div>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Conecte a caixa que recebe as notas e recibos das ferramentas de IA. O app só lê (nunca envia nem apaga), busca apenas mensagens com jeito de cobrança e não guarda o conteúdo dos e-mails — só a fatura reconhecida.
      </p>

      {!estado && <p className="text-muted text-sm">Carregando...</p>}

      {estado?.conectado && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="chip-positivo">Conectado como {estado.conta || "conta do Google"}</span>
          <button type="button" className="btn-ghost" onClick={desconectar} disabled={desconectando}>{desconectando ? "Desconectando" : "Desconectar"}</button>
          <button type="button" className="btn-ghost" onClick={testar} disabled={testando}>{testando ? "Testando" : "Testar conexão"}</button>
        </div>
      )}

      {estado && !estado.conectado && estado.credenciaisDoApp && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <a href="/api/setup/oauth/google" className="btn-primary !w-auto">Conectar o Gmail</a>
          <span className="text-muted text-sm">Você escolhe a conta e autoriza só a leitura na tela do Google.</span>
        </div>
      )}

      {estado && !estado.conectado && !estado.credenciaisDoApp && (
        <div className="mb-4 px-4 py-3 rounded-[10px] text-sm border bg-[#fff4e0] border-[#f4d7a0] text-warn">
          Este app ainda não tem as credenciais do Google. Peça à equipe técnica para criá-las seguindo o passo a passo abaixo; depois o botão Conectar o Gmail aparece aqui.
        </div>
      )}

      {aviso && <p className={`mb-3 text-sm font-semibold ${aviso.ok ? "text-ok" : "text-danger"}`}>{aviso.mensagem}</p>}

      {estado && (
        <MaisDetalhes titulo="Para a equipe técnica">
          <p className="text-muted text-[13px] mb-2">
            O botão Conectar o Gmail usa um cliente OAuth do próprio app no Google Cloud. Como criar (uma vez só):
          </p>
          <ol className="list-decimal list-inside flex flex-col gap-1 text-[13px] text-muted mb-3">
            <li>Em console.cloud.google.com, crie um projeto e ative o serviço Gmail em &quot;Biblioteca&quot;.</li>
            <li>Em &quot;Tela de permissão OAuth&quot;, cadastre o app (tipo Externo, ou Interno se a empresa usa Google Workspace) e adicione o escopo de leitura do Gmail (gmail.readonly).</li>
            <li>Em &quot;Credenciais&quot;, crie um cliente OAuth do tipo &quot;Aplicativo da Web&quot; e cadastre o endereço de retorno abaixo em &quot;URIs de redirecionamento autorizados&quot;.</li>
            <li>Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente onde o app roda, ou cole os dois valores aqui embaixo.</li>
          </ol>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-[13px] font-semibold w-[150px] shrink-0">Endereço de retorno</span>
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{estado.redirectUri}</code>
            <CopyButton texto={() => estado.redirectUri} rotulo="Copiar" />
          </div>
          <ul className="list-disc list-inside flex flex-col gap-1 text-[13px] text-muted mb-3">
            <li>App em modo &quot;Em teste&quot;: só até 100 usuários cadastrados como testadores e o acesso expira em 7 dias (é preciso reconectar).</li>
            <li>gmail.readonly é um escopo restrito: para uso público, o Google exige verificação do app (pode levar semanas).</li>
            <li>Com Google Workspace e tipo &quot;Interno&quot;, nada disso se aplica: qualquer pessoa da empresa conecta e o acesso não expira.</li>
          </ul>
          {estado.credenciaisDoApp ? (
            <p className="text-[13px] text-muted">
              Credenciais do app definidas {estado.credenciaisNoAmbiente ? "por variável de ambiente (têm prioridade sobre o que for salvo aqui)" : "neste app"}.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="campo-GOOGLE_CLIENT_ID" className="text-[13px] font-semibold">Identificador do cliente OAuth</label>
                  <input id="campo-GOOGLE_CLIENT_ID" className="input" autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="....apps.googleusercontent.com" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="campo-GOOGLE_CLIENT_SECRET" className="text-[13px] font-semibold">Segredo do cliente OAuth</label>
                  <input id="campo-GOOGLE_CLIENT_SECRET" className="input" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-..." />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" className="btn-primary !w-auto" onClick={salvarCredenciais} disabled={salvando || !clientId.trim() || !clientSecret.trim()}>{salvando ? "Salvando" : "Salvar credenciais"}</button>
                {(!clientId.trim() || !clientSecret.trim()) && <span className="text-muted text-sm">Preencha os dois campos para salvar</span>}
              </div>
            </div>
          )}
        </MaisDetalhes>
      )}
    </section>
  );
}
