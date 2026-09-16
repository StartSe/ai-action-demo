"use client";
// Cartão próprio do /setup para uma caixa de e-mail: Gmail (US-021) e Outlook / Microsoft 365 (US-034).
// O cartão genérico (components/setup.tsx, comparado byte a byte entre os apps) não sabe mostrar
// "Conectado como {e-mail}" nem um bloco "Para a equipe técnica" com o endereço de retorno e as
// credenciais do app — por isso as duas caixas saem da lista genérica (app/api/setup/route.ts) e
// ganham este componente, no mesmo molde de AcessoMCP.tsx. Um cartão por provedor: <ConectarEmail provedor="gmail" />.
import { useEffect, useState } from "react";
import type { ProvedorEmail } from "@/lib/types";
import { CopyButton, MaisDetalhes } from "./ui";

type Estado = {
  conectado: boolean;
  conta: string | null;
  credenciaisDoApp: boolean;
  /** As credenciais vieram da suíte (embutidas na imagem): não há registro nenhum a criar. */
  credenciaisDaSuite: boolean;
  credenciaisNoAmbiente: boolean;
  redirectUri: string;
  /** Endereço que inicia a conexão (vem da rota, para o componente não repetir os caminhos). */
  oauthUrl: string;
};

type Texto = {
  titulo: string;
  nome: string;
  empresa: string;
  descricao: string;
  /** Uma linha extra, menor: o que o app faz e o que nunca faz com a caixa (não cabe na descrição). */
  privacidade: string;
  botao: string;
  contaGenerica: string;
  chaveId: string;
  chaveSegredo: string;
  rotuloId: string;
  rotuloSegredo: string;
  placeholderId: string;
  placeholderSegredo: string;
  introducao: string;
  passos: string[];
  restricoes: string[];
};

const TEXTOS: Record<ProvedorEmail, Texto> = {
  gmail: {
    titulo: "Gmail",
    nome: "Gmail",
    empresa: "do Google",
    descricao: "Lê as notas das ferramentas de IA direto da sua caixa.",
    privacidade: "O app procura só mensagens com jeito de cobrança, nunca apaga nada e não guarda o conteúdo dos e-mails — apenas a fatura reconhecida. A mesma conexão envia para você o fechamento do mês, quando você pedir.",
    botao: "Conectar o Gmail",
    contaGenerica: "conta do Google",
    chaveId: "GOOGLE_CLIENT_ID",
    chaveSegredo: "GOOGLE_CLIENT_SECRET",
    rotuloId: "Identificador do cliente OAuth",
    rotuloSegredo: "Segredo do cliente OAuth",
    placeholderId: "....apps.googleusercontent.com",
    placeholderSegredo: "GOCSPX-...",
    introducao: "O botão Conectar o Gmail usa um cliente OAuth do próprio app no Google Cloud. Como criar (uma vez só):",
    passos: [
      "Em console.cloud.google.com, crie um projeto e ative o serviço Gmail em \"Biblioteca\".",
      "Em \"Tela de permissão OAuth\", cadastre o app (tipo Externo, ou Interno se a empresa usa Google Workspace) e adicione os escopos gmail.readonly e gmail.send.",
      "Em \"Credenciais\", crie um cliente OAuth do tipo \"Aplicativo da Web\" e cadastre o endereço de retorno abaixo em \"URIs de redirecionamento autorizados\".",
      "Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente onde o app roda, ou cole os dois valores aqui embaixo.",
    ],
    restricoes: [
      "App em modo \"Em teste\": só até 100 usuários cadastrados como testadores e o acesso expira em 7 dias (é preciso reconectar).",
      "gmail.readonly é um escopo restrito: para uso público, o Google exige verificação do app (pode levar semanas).",
      "Com Google Workspace e tipo \"Interno\", nada disso se aplica: qualquer pessoa da empresa conecta e o acesso não expira.",
    ],
  },
  outlook: {
    titulo: "Outlook (Microsoft 365)",
    nome: "Outlook",
    empresa: "da Microsoft",
    descricao: "Lê as notas das ferramentas de IA direto da sua caixa do Outlook.",
    privacidade: "O app procura só mensagens com jeito de cobrança, nunca apaga nada e não guarda o conteúdo dos e-mails — apenas a fatura reconhecida. A mesma conexão envia para você o fechamento do mês, quando você pedir.",
    botao: "Conectar o Outlook",
    contaGenerica: "conta Microsoft",
    chaveId: "MICROSOFT_CLIENT_ID",
    chaveSegredo: "MICROSOFT_CLIENT_SECRET",
    rotuloId: "Identificador do aplicativo (cliente)",
    rotuloSegredo: "Segredo do cliente",
    placeholderId: "00000000-0000-0000-0000-000000000000",
    placeholderSegredo: "valor do segredo, não o id dele",
    introducao: "O botão Conectar o Outlook usa um registro de aplicativo do próprio app no Microsoft Entra (o antigo Azure AD). Como criar (uma vez só):",
    passos: [
      "Em entra.microsoft.com (ou portal.azure.com), abra \"Registros de aplicativo\" e clique em \"Novo registro\". Em \"Tipos de conta com suporte\", escolha \"Contas em qualquer diretório organizacional e contas pessoais da Microsoft\" — é isso que permite conectar caixas de qualquer empresa.",
      "Em \"Autenticação\", adicione a plataforma \"Web\" e cadastre o endereço de retorno abaixo como URI de redirecionamento.",
      "Em \"Permissões\", adicione as permissões delegadas do Microsoft Graph: Mail.Read, Mail.Send, offline_access e User.Read (nenhuma exige consentimento de administrador).",
      "Em \"Certificados e segredos\", crie um segredo do cliente e copie o valor na hora (ele não aparece de novo). Defina MICROSOFT_CLIENT_ID (o \"ID do aplicativo (cliente)\" da visão geral) e MICROSOFT_CLIENT_SECRET no ambiente onde o app roda, ou cole os dois valores aqui embaixo.",
    ],
    restricoes: [
      "Editor não verificado: como o registro aceita contas de qualquer organização, a tela de consentimento da Microsoft mostra o aviso \"não verificado\" até a empresa que publica o app concluir a verificação de editor (exige uma conta no Partner Center). O aviso não impede a conexão.",
      "Algumas empresas bloqueiam o consentimento do próprio usuário para apps de fora: nesse caso um administrador precisa aprovar o app uma vez (a Microsoft mostra a opção na própria tela de login).",
      "O segredo do cliente vence (no máximo 24 meses): anote a data e crie outro antes — quando vence, o botão para de funcionar e as caixas precisam ser reconectadas.",
    ],
  },
};

export function ConectarEmail({ provedor }: { provedor: ProvedorEmail }) {
  const t = TEXTOS[provedor];
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [desconectando, setDesconectando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = () => fetch(`/api/email/${provedor}`).then((r) => r.json()).then(setEstado).catch(() => {});

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/email/${provedor}`).then((r) => r.json()).then(setEstado).catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [provedor]);

  async function desconectar() {
    setDesconectando(true); setAviso(null);
    try {
      const r = await fetch(`/api/email/${provedor}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Falha ao desconectar.");
      await carregar();
    } catch (e) {
      setAviso({ ok: false, mensagem: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally { setDesconectando(false); }
  }

  async function testar() {
    setTestando(true); setAviso(null);
    try {
      const r = await fetch("/api/setup/testar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: provedor }) });
      setAviso(await r.json());
    } catch { setAviso({ ok: false, mensagem: "Não foi possível testar agora." }); }
    finally { setTestando(false); }
  }

  async function salvarCredenciais() {
    setSalvando(true); setAviso(null);
    try {
      const valores: Record<string, string> = {};
      if (clientId.trim()) valores[t.chaveId] = clientId.trim();
      if (clientSecret.trim()) valores[t.chaveSegredo] = clientSecret.trim();
      const r = await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores }) });
      if (!r.ok) throw new Error("Falha ao salvar as credenciais.");
      setClientId(""); setClientSecret("");
      await carregar();
      setAviso({ ok: true, mensagem: `Credenciais salvas. Agora é só clicar em ${t.botao}.` });
    } catch (e) {
      setAviso({ ok: false, mensagem: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally { setSalvando(false); }
  }

  const chip = estado?.conectado ? "chip-positivo" : "chip-neutral";

  return (
    <section id={provedor} className="card p-6 max-md:p-5">
      <div className="flex justify-between gap-4 items-start mb-2 flex-wrap">
        <h2 className="text-lg font-bold">{t.titulo}</h2>
        <span className={chip}>{estado?.conectado ? "conectado" : "opcional"}</span>
      </div>
      <p className="text-ink-2 text-sm mb-1.5 max-w-[640px]">{t.descricao}</p>
      <p className="text-muted text-[12.5px] mb-4 max-w-[640px]">{t.privacidade}</p>

      {!estado && <p className="text-muted text-sm">Carregando...</p>}

      {estado?.conectado && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="chip-positivo">Conectado como {estado.conta || t.contaGenerica}</span>
          <button type="button" className="btn-ghost" onClick={desconectar} disabled={desconectando}>{desconectando ? "Desconectando" : "Desconectar"}</button>
          <button type="button" className="btn-ghost" onClick={testar} disabled={testando}>{testando ? "Testando" : "Testar conexão"}</button>
        </div>
      )}

      {estado && !estado.conectado && estado.credenciaisDoApp && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <a href={estado.oauthUrl} className="btn-primary !w-auto">{t.botao}</a>
          <span className="text-muted text-sm">Você escolhe a conta e autoriza na tela {t.empresa}.</span>
        </div>
      )}

      {estado && !estado.conectado && !estado.credenciaisDoApp && (
        <div className="mb-4 px-4 py-3 rounded-[10px] text-sm border bg-[#fff4e0] border-[#f4d7a0] text-warn">
          Este app ainda não tem as credenciais {t.empresa}. Peça à equipe técnica para defini-las seguindo o passo a passo abaixo; depois o botão {t.botao} aparece aqui.
        </div>
      )}

      {aviso && <p className={`mb-3 text-sm font-semibold ${aviso.ok ? "text-ok" : "text-danger"}`}>{aviso.mensagem}</p>}

      {estado?.credenciaisDaSuite && (
        <MaisDetalhes titulo="Para a equipe técnica">
          <p className="text-muted text-[13px]">
            As credenciais {t.empresa} já vêm com o app ({t.chaveId}_APP e {t.chaveSegredo}_APP). Para usar o registro da própria empresa,
            defina {t.chaveId} e {t.chaveSegredo} no ambiente e cadastre o endereço de retorno abaixo.
          </p>
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <span className="text-[13px] font-semibold w-[150px] shrink-0">Endereço de retorno</span>
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{estado.redirectUri}</code>
            <CopyButton texto={() => estado.redirectUri} rotulo="Copiar" />
          </div>
        </MaisDetalhes>
      )}

      {estado && !estado.credenciaisDaSuite && (
        <MaisDetalhes titulo="Para a equipe técnica">
          <p className="text-muted text-[13px] mb-2">{t.introducao}</p>
          <ol className="list-decimal list-inside flex flex-col gap-1 text-[13px] text-muted mb-3">
            {t.passos.map((passo) => <li key={passo}>{passo}</li>)}
          </ol>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-[13px] font-semibold w-[150px] shrink-0">Endereço de retorno</span>
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{estado.redirectUri}</code>
            <CopyButton texto={() => estado.redirectUri} rotulo="Copiar" />
          </div>
          <ul className="list-disc list-inside flex flex-col gap-1 text-[13px] text-muted mb-3">
            {t.restricoes.map((r) => <li key={r}>{r}</li>)}
          </ul>
          {estado.credenciaisDoApp ? (
            <p className="text-[13px] text-muted">
              Credenciais do app definidas {estado.credenciaisNoAmbiente ? "por variável de ambiente (têm prioridade sobre o que for salvo aqui)" : "neste app"}.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`campo-${t.chaveId}`} className="text-[13px] font-semibold">{t.rotuloId}</label>
                  <input id={`campo-${t.chaveId}`} className="input" autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={t.placeholderId} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`campo-${t.chaveSegredo}`} className="text-[13px] font-semibold">{t.rotuloSegredo}</label>
                  <input id={`campo-${t.chaveSegredo}`} className="input" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={t.placeholderSegredo} />
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
