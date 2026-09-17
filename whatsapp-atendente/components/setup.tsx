"use client";
// Tela de configuração inicial, gerada a partir de lib/integracoes.ts. PRÓPRIA deste app desde a US-001
// (ver CLAUDE.md): não é mais cópia literal do pdi-time, e o que muda aqui não é replicado nos outros apps.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { IlustracaoSegmento, MaisDetalhes, Topbar, useStatus } from "./ui";
import type { CampoStatus, IntegracaoStatus, Opcao, StatusCaixasEmail, StatusEnderecoPublico } from "@/lib/setup-comum";
import type { Segmento } from "@/lib/ilustracao";

type Resposta = { integracoes: IntegracaoStatus[]; pronto: boolean; enderecoPublico: StatusEnderecoPublico; caixasEmail: StatusCaixasEmail };

// Duas frases de privacidade, verdadeiras desde a US-011 (as chaves são cifradas em
// repouso, ver lib/store.ts, mas o app continua chamando serviços externos de verdade
// — nunca afirmar "nenhuma conexão externa"). Repetidas na coluna de apoio e no
// rodapé: mesmo texto nos dois lugares, nunca reescritas.
const FRASE_PRIVACIDADE = "As chaves ficam cifradas neste app, no seu servidor. Nunca aparecem por inteiro depois de salvas.";
const FRASE_CONEXOES = "Seus dados não passam por nenhum servidor nosso: o app fala direto com os serviços que você conectar.";

// Três garantias genéricas (nenhuma referência ao domínio de um app específico) mostradas na coluna de
// apoio de /setup, ao lado da ilustração do segmento.
const ITENS_APOIO = ["Leva menos de 2 minutos", "Você decide o que conectar", "Pode trocar quando quiser"];

// Ícone circular de cada cartão, por id de integração (ver public/ilustracoes/icones). Ids não listados
// caem no ícone padrão — cobre integrações futuras (MCP_TAREFAS, MCP_CRM etc.) sem precisar de mudança aqui.
const ICONE_POR_ID: Record<string, string> = {
  openrouter: "robo",
  notificacoes: "conversa",
  "mcp-tarefas": "checklist",
  "mcp-crm": "rede",
  "mcp-empresa": "integracao",
  "mcp-dados": "grafico",
};
const ICONE_PADRAO = "integracao";
function iconeIntegracao(id: string): string {
  return ICONE_POR_ID[id] ?? ICONE_PADRAO;
}

function IconeApoio() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** `children`: cartões próprios do app (política, webhook...) que precisam aparecer ANTES do rodapé "Ir
 * para o app" — quem entra em /setup não deve ser convidado a sair antes de ver o que ainda falta
 * configurar. Cartões secundários (como "Usar dentro do seu assistente") continuam depois da tela. */
export function SetupPage({ marca, nome, area, segmento, children }: { marca: string; nome: string; area: string; segmento: Segmento; children?: ReactNode }) {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = () => fetch("/api/setup").then((r) => r.json()).then(setDados).catch(() => setAviso({ tipo: "erro", texto: "Não foi possível carregar a configuração." }));
  const primeiroPendenteId = dados?.integracoes.find((i) => i.obrigatoria && !i.configurada)?.id;
  const conectadas = dados?.integracoes.filter((i) => i.configurada).length ?? 0;
  const total = dados?.integracoes.length ?? 0;
  const progresso = total > 0 ? Math.round((conectadas / total) * 100) : 0;
  const opcionaisFaltando = dados?.integracoes.filter((i) => !i.obrigatoria && !i.configurada) ?? [];

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
      <Topbar marca={marca} nome={nome} area={area} status={status} erro={erro} usuario={status?.usuario} />
      <main className="max-w-[1100px] mx-auto px-8 max-md:px-4 pt-8 pb-16">
        <div className="grid grid-cols-[260px_minmax(0,1fr)] max-md:grid-cols-1 gap-10 max-md:gap-6">
          <aside className="flex flex-col gap-5 self-start md:sticky md:top-6">
            <div>
              <p className="sobretitulo mb-1">{area}</p>
              <h1 className="titulo-painel mb-2">Configuração inicial</h1>
              <p className="apoio max-w-[280px]">{FRASE_PRIVACIDADE}</p>
              <p className="apoio max-w-[280px] mt-2">{FRASE_CONEXOES}</p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {ITENS_APOIO.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink-2">
                  <IconeApoio />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="relative w-full max-w-[220px] max-md:hidden">
              <div className="blob-acento" />
              <IlustracaoSegmento segmento={segmento} className="relative w-full h-auto" />
            </div>
          </aside>

          <div>
            {dados && (
              <div className="mb-6">
                <div className="flex flex-col gap-0.5 mb-2">
                  <span className="text-sm font-semibold">
                    Para rodar: <span className={dados.pronto ? "text-ok" : "text-warn"}>{dados.pronto ? "IA conectada" : "falta conectar a IA"}</span>
                  </span>
                  {opcionaisFaltando.length > 0 && (
                    <span className="text-sm text-ink-2">Faz mais com: {opcionaisFaltando.map((i) => i.titulo).join(", ")}</span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full bg-[image:var(--gradiente-acento)] transition-[width]" style={{ width: `${progresso}%` }} />
                </div>
              </div>
            )}

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
                {opcionaisFaltando.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-line">
                    <h3 className="text-sm font-bold mb-2">Quer ir além?</h3>
                    <ul className="flex flex-col gap-1.5">
                      {opcionaisFaltando.map((i) => (
                        <li key={i.id} className="text-sm">
                          <a href={`#${i.id}`} className="font-semibold text-accent underline underline-offset-2">{i.titulo}</a>
                          <span className="text-ink-2"> — {i.beneficio || i.descricao}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-col gap-5">
              {dados?.integracoes.map((i, indice) => (
                <CartaoIntegracao
                  key={i.id}
                  integracao={i}
                  numero={indice + 1}
                  aoSalvar={carregar}
                  destaque={i.id === primeiroPendenteId}
                  caixasEmail={i.id === "notificacoes" ? dados.caixasEmail : undefined}
                />
              ))}
            </div>

            {children && <div className="flex flex-col gap-5 mt-5">{children}</div>}

            <footer className="mt-8 pt-6 border-t border-line">
              <p className="text-muted text-[13px] max-w-[560px]">{FRASE_PRIVACIDADE}</p>
              <p className="text-muted text-[13px] max-w-[560px] mt-1">{FRASE_CONEXOES}</p>
              <div className="mt-4 flex gap-3 flex-wrap items-center">
                <Link href="/" className="btn-primary !w-auto">Ir para o app</Link>
              </div>
            </footer>

            {/* (US-007) Este bloco chamava-se "Para a equipe técnica" e foi renomeado: o cartão "Conectar o
                WhatsApp", logo acima, passou a ter um bloco com esse nome, e dois iguais na mesma página
                confundem. O conteúdo continua aqui porque é do app inteiro, não da conexão do número —
                em especial o endereço público, que alimenta os links de e-mail e Slack das rotinas. */}
            <MaisDetalhes titulo="Ajustes do servidor">
              <p className="text-muted text-[13px]">Variáveis de ambiente, quando existirem, têm prioridade sobre o que é salvo aqui.</p>
              <p className="text-muted text-[13px]">Neste plano de hospedagem, o histórico pode se perder ao reiniciar.</p>
              {dados && <CampoEnderecoPublico status={dados.enderecoPublico} aoSalvar={carregar} />}
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
          </div>
        </div>
      </main>
    </>
  );
}

// Campo "Endereço público do app" ("Para a equipe técnica"): mostra o valor detectado sozinho a partir
// do host da primeira rotina/lembrete/formulário/pedido criado (ver lib/setup-comum.ts:registrarEnderecoPublico)
// e permite corrigir à mão (domínio próprio, proxy que o app não enxerga).
function CampoEnderecoPublico({ status, aoSalvar }: { status: StatusEnderecoPublico; aoSalvar: () => void }) {
  const [valor, setValor] = useState(status.valor ?? "");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function salvar() {
    setSalvando(true); setAviso("");
    try {
      const r = await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores: { APP_URL: valor.trim() } }) });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setAviso("Salvo.");
      aoSalvar();
    } catch {
      setAviso("Não foi possível salvar. Tente de novo.");
    } finally { setSalvando(false); }
  }

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <label className="text-[13px] font-semibold" htmlFor="app-url">Endereço público do app</label>
      <p className="text-muted text-[12.5px] mb-1.5">
        {status.valor ? "Detectado sozinho. Usado nos links de e-mail e Slack das rotinas." : "Ainda não detectado: abra o app pelo endereço publicado uma vez, ou informe abaixo."}
        {status.origem === "env" && " Vem de variável de ambiente: tem prioridade sobre o que for salvo aqui."}
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        <input id="app-url" className="input flex-1 min-w-[240px]" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="https://meu-app.exemplo.com" disabled={status.origem === "env"} />
        <button type="button" className="btn-secundario !w-auto" onClick={salvar} disabled={salvando || status.origem === "env" || !valor.trim()}>{salvando ? "Salvando" : "Corrigir"}</button>
      </div>
      {aviso && <p className="text-[12.5px] text-muted mt-1">{aviso}</p>}
    </div>
  );
}

// Frase que abre "Opções avançadas" de um cartão, quando os campos de lá são um caminho alternativo
// inteiro (e não só ajustes finos do principal).
const NOTA_AVANCADA: Record<string, string> = {
  whatsapp: "Já usa a WhatsApp Cloud API da Meta? Preencha aqui e deixe os campos da z-api em branco.",
};

function CartaoIntegracao({ integracao: i, numero, aoSalvar, destaque, caixasEmail }: { integracao: IntegracaoStatus; numero: number; aoSalvar: () => void; destaque?: boolean; caixasEmail?: StatusCaixasEmail }) {
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
      const r = i.oauth?.tipo === "mcp"
        ? await fetch(i.oauth.url, { method: "PUT" })
        : await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores: Object.fromEntries(i.campos.map((c) => [c.chave, null])) }) });
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
  const aoMudarCampo = (chave: string) => (v: string) => setValores((s) => ({ ...s, [chave]: v }));
  // Valor efetivo de cada campo agora (edição ainda não salva > salvo > padrão), usado para decidir
  // `visivelQuando` sem depender de um novo PUT — trocar o canal já mostra o campo certo na hora.
  const valoresAtuais = Object.fromEntries(i.campos.map((c) => [c.chave, valores[c.chave] || c.valorVisivel || c.padrao || ""]));
  const campoVisivel = (c: CampoStatus) => !c.visivelQuando || c.visivelQuando.valores.includes(valoresAtuais[c.visivelQuando.campo] ?? "");
  const passos = i.oauth ? [] : passosSetup(i, valoresAtuais);
  const camposPrincipais = i.campos.filter((c) => !c.avancado && campoVisivel(c));
  const camposAvancados = i.campos.filter((c) => c.avancado && campoVisivel(c));

  const campos = (
    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
      {camposPrincipais.map((c) => <CampoSetup key={c.chave} campo={c} valor={valores[c.chave] ?? ""} aoMudar={aoMudarCampo(c.chave)} />)}
    </div>
  );

  const opcoesAvancadas = camposAvancados.length > 0 && (
    <MaisDetalhes titulo="Opções avançadas">
      {NOTA_AVANCADA[i.id] && <p className="text-[12.5px] text-muted mb-4">{NOTA_AVANCADA[i.id]}</p>}
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
        {camposAvancados.map((c) => <CampoSetup key={c.chave} campo={c} valor={valores[c.chave] ?? ""} aoMudar={aoMudarCampo(c.chave)} />)}
      </div>
    </MaisDetalhes>
  );

  const acoesSalvar = (
    <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mt-4">
      <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={salvar} disabled={!alterado || salvando}>{salvando ? "Salvando" : "Salvar"}</button>
      {!alterado && <span className="text-muted text-sm">Preencha ao menos um campo para salvar</span>}
      {i.link && <a className="btn-link text-sm" href={i.link.url} target="_blank" rel="noreferrer">{i.link.rotulo}</a>}
    </div>
  );

  return (
    <section id={i.id} className={`card p-6 max-md:p-5 ${destaque ? "border-accent border-2" : ""}`}>
      <div className="flex items-start gap-3.5 mb-4">
        <div className="relative shrink-0">
          <span className="absolute -left-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{numero}</span>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft overflow-hidden">
            <img src={`/ilustracoes/icones/${iconeIntegracao(i.id)}.webp`} alt="" aria-hidden="true" width={32} height={32} className="h-8 w-8 object-contain" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold">{i.titulo}</h2>
            <span className={`chip-status ${i.configurada ? "chip-status-conectado" : "chip-status-pendente"}`}>{i.configurada ? "Conectado" : "Pendente"}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-2">{i.beneficio || i.descricao}</p>
        </div>
      </div>

      {i.oauth ? (
        <>
          <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mb-4">
            {i.configurada ? (
              <>
                <span className="chip-positivo max-md:self-start">Conectado{chaveSecreta?.mascarado ? ` · ${chaveSecreta.mascarado}` : ""}</span>
                <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={desconectar} disabled={desconectando}>{desconectando ? "Desconectando" : "Desconectar"}</button>
                <button type="button" className="btn-secundario !w-auto max-md:!w-full" onClick={testar} disabled={testando}>{testando ? "Testando" : "Testar conexão"}</button>
              </>
            ) : (
              // Quem ainda não tem conta no serviço precisa criá-la ANTES de autorizar: o link fica
              // visível ao lado do botão, não dentro de "Opções avançadas" (onde ele também aparece).
              <>
                {i.link && <a className="btn-link text-sm max-md:self-start" href={i.link.url} target="_blank" rel="noreferrer">{i.link.rotulo}</a>}
                <a href={i.oauth.url} className="btn-primary !w-auto max-md:!w-full">{i.oauth.rotulo}</a>
              </>
            )}
          </div>
          {!i.configurada && i.notaConexao && <p className="text-[12.5px] text-muted -mt-2 mb-4">{i.notaConexao}</p>}
          <MaisDetalhes titulo="Opções avançadas: colar uma chave">
            {campos}
            {opcoesAvancadas}
            {acoesSalvar}
          </MaisDetalhes>
        </>
      ) : (
        <>
          {!i.configurada && i.notaConexao && <p className="text-[12.5px] text-muted mb-4">{i.notaConexao}</p>}
          {passos.length > 0 && (
            <ol className="list-decimal list-inside flex flex-col gap-1 text-sm text-muted mb-4">
              {passos.map((p) => <li key={p}>{p}</li>)}
            </ol>
          )}
          {caixasEmail && <ConectarCaixasEmail status={caixasEmail} aoMudar={aoSalvar} />}
          {campos}
          {opcoesAvancadas}
          <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mt-4">
            {i.configurada && <button type="button" className="btn-secundario !w-auto max-md:!w-full" onClick={testar} disabled={testando}>{testando ? "Testando" : "Testar conexão"}</button>}
            <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={salvar} disabled={!alterado || salvando}>{salvando ? "Salvando" : "Salvar"}</button>
            {!alterado && <span className="text-muted text-sm">Preencha ao menos um campo para salvar</span>}
            {i.link && <a className="btn-link text-sm" href={i.link.url} target="_blank" rel="noreferrer">{i.link.rotulo}</a>}
          </div>
        </>
      )}
      {teste && <p className={`mt-3 text-sm font-semibold ${teste.ok ? "text-ok" : "text-danger"}`}>{teste.mensagem}</p>}
    </section>
  );
}

/** Botões "Conectar meu Gmail"/"Conectar meu Outlook" do cartão "Notificações" (US-024): envia os avisos
 * pela própria caixa da pessoa em vez do Resend/SMTP genérico. Some por completo quando a equipe técnica
 * não definiu as credenciais do app daquele provedor — nunca mostra um botão que vai falhar. */
function ConectarCaixasEmail({ status, aoMudar }: { status: StatusCaixasEmail; aoMudar: () => void }) {
  if (!status.gmail.disponivel && !status.outlook.disponivel) return null;
  return (
    <div className="flex flex-col gap-2 mb-4">
      {status.gmail.disponivel && <CaixaEmail nome="Gmail" url="/api/setup/oauth/google" status={status.gmail} aoMudar={aoMudar} />}
      {status.outlook.disponivel && <CaixaEmail nome="Outlook" url="/api/setup/oauth/microsoft" status={status.outlook} aoMudar={aoMudar} />}
    </div>
  );
}

function CaixaEmail({ nome, url, status, aoMudar }: { nome: string; url: string; status: { conta?: string }; aoMudar: () => void }) {
  const [desconectando, setDesconectando] = useState(false);

  async function desconectar() {
    setDesconectando(true);
    try {
      await fetch(url, { method: "PUT" });
      aoMudar();
    } finally {
      setDesconectando(false);
    }
  }

  if (status.conta) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="chip-positivo">Conectado como {status.conta}</span>
        <button type="button" className="btn-ghost !w-auto" onClick={desconectar} disabled={desconectando}>{desconectando ? "Desconectando" : "Desconectar"}</button>
      </div>
    );
  }
  return <a href={url} className="btn-secundario !w-auto">Conectar meu {nome}</a>;
}

/** Passo a passo de até três passos, gerado a partir do link para obter a chave. A ajuda do primeiro
 * campo não entra aqui: ela já aparece sob o próprio campo (`CampoSetup`), repeti-la duplicaria o texto.
 * Uma integração sem nenhum campo secreto (ex.: as cotações de câmbio do custos-ia) não tem chave para colar:
 * o último passo fala em preencher os campos. Notificações tem um passo a passo próprio por canal, porque
 * o caminho (Resend/SMTP para e-mail, webhook para Slack) muda por completo conforme a escolha. */
function passosSetup(i: IntegracaoStatus, valoresAtuais: Record<string, string>): string[] {
  // Conectar o número não é "copie uma chave": são três valores, e depois disso ainda vem o QR Code.
  if (i.id === "whatsapp") {
    return ["Crie a conta e uma instância no painel da z-api.", "Copie os três valores da instância.", "Cole aqui e clique em Salvar."];
  }
  if (i.id === "notificacoes") {
    const canal = valoresAtuais.NOTIFICACOES_CANAL || "email";
    return canal === "slack"
      ? ["No Slack, crie um webhook de entrada em Aplicativos › Incoming Webhooks e cole a URL abaixo."]
      : ["Conecte seu Gmail ou Outlook acima; sem isso, crie uma chave gratuita do Resend ou preencha o SMTP em Opções avançadas."];
  }
  // Integração que já funciona sozinha (todos os campos são `avancado`, ex.: o câmbio automático do
  // custos-ia) não tem nada a preencher: mandar "Preencha os campos abaixo" com a grade vazia logo
  // embaixo seria uma instrução falsa.
  if (i.campos.every((c) => c.avancado)) return [];
  const passos: string[] = [];
  const temChave = i.campos.some((c) => c.tipo === "secret");
  if (i.link) passos.push(`Abra "${i.link.rotulo}" e copie a chave.`);
  passos.push(temChave ? "Cole a chave abaixo e clique em Salvar." : "Preencha os campos abaixo e clique em Salvar.");
  return passos.slice(0, 3);
}

/** Campo `select` com poucas opções fixas (ex.: canal das Notificações) vira um par de botões lado a
 * lado em vez de um menu suspenso — mais rápido de ler e de escolher quando só há 2 ou 3 alternativas.
 * `select`s com mais opções (ex.: modelo de IA) continuam como `select`. */
const LIMITE_BOTOES = 3;

// Ordem fixa dos grupos de um <select> com Opcao.grupo definido (hoje só o modelo de IA).
const GRUPOS_OPCAO: { chave: NonNullable<Opcao["grupo"]>; rotulo: string }[] = [
  { chave: "recomendado", rotulo: "Recomendado (gratuito)" },
  { chave: "gratuito", rotulo: "Outros gratuitos" },
  { chave: "pago", rotulo: "Pagos (mais qualidade)" },
];

function CampoSetup({ campo: c, valor, aoMudar }: { campo: CampoStatus; valor: string; aoMudar: (v: string) => void }) {
  const id = `campo-${c.chave}`;
  const rotulo = `${c.rotulo}${c.opcional ? " (opcional)" : ""}`;
  const opcoes = c.opcoes ?? [];
  const atual = valor || c.valorVisivel || c.padrao || "";

  if (c.tipo === "select" && opcoes.length > 0 && opcoes.length <= LIMITE_BOTOES) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">{rotulo}</span>
        <div className="flex gap-2" role="radiogroup" aria-label={rotulo}>
          {opcoes.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={atual === o.valor}
              className={`flex-1 h-11 rounded-field border text-sm font-semibold transition-colors ${atual === o.valor ? "bg-accent border-accent text-white" : "border-line bg-white text-ink hover:bg-bg"}`}
              onClick={() => aoMudar(o.valor)}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        {c.ajuda && <span className="text-[12.5px] text-muted">{c.ajuda}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{rotulo}</label>
      {c.tipo === "select" ? (
        <select id={id} className="input" value={atual} onChange={(e) => aoMudar(e.target.value)}>
          {opcoes.some((o) => o.grupo)
            ? GRUPOS_OPCAO.map((g) => {
                const doGrupo = opcoes.filter((o) => o.grupo === g.chave);
                if (doGrupo.length === 0) return null;
                return (
                  <optgroup key={g.chave} label={g.rotulo}>
                    {doGrupo.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </optgroup>
                );
              })
            : opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          {c.valorVisivel && !opcoes.some((o) => o.valor === c.valorVisivel) && <option value={c.valorVisivel}>{c.valorVisivel}</option>}
        </select>
      ) : (
        <input id={id} className="input" type={c.tipo === "secret" ? "password" : "text"} autoComplete="off" value={valor} onChange={(e) => aoMudar(e.target.value)}
          placeholder={c.tipo === "secret" && c.mascarado ? `salvo: ${c.mascarado}` : c.tipo === "text" && c.valorVisivel ? c.valorVisivel : c.placeholder || ""} />
      )}
      {c.ajuda && <span className="text-[12.5px] text-muted">{c.ajuda}</span>}
    </div>
  );
}
