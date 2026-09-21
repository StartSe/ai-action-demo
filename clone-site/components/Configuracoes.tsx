"use client";
// Configurações deste app (tela própria, no desenho do Build Agentflows): seções com cartões de conexão.
//  1. Inteligência artificial: ChatGPT (assinatura) e OpenRouter (chave) lado a lado; um deles é o "Principal"
//     (quem escreve e edita os sites, config IA_PROVEDOR via /api/ia). O modelo que lê a captura mora DENTRO do
//     cartão do OpenRouter (é sempre ele quem lê imagens), com "Testar leitura de imagem" (/api/visao).
//  2. Hospedagem e publicação: Netlify (publica cada site num endereço próprio) e Render (domínio próprio nesta
//     instância) — cartões genéricos a partir de lib/integracoes.ts (GET /api/setup).
//  3. Assistente de IA: o acesso por MCP (components/AcessoMCP.tsx).
//  Sem notificações e sem rotinas (decisão de 21/09/2026).
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CAMINHO_CONFIGURACOES } from "@/lib/acoes";
import { ORIGEM_AMBIENTE, URL_CONFIG, URL_CONFIG_TESTAR, type CampoStatus, type IntegracaoStatus, type Opcao, type StatusEnderecoPublico } from "@/lib/config-tipos";
import { AcessoMCP } from "./AcessoMCP";
import { Icone, type NomeIcone } from "./Icones";
import { TopbarSite } from "./TopbarSite";
import { Aviso, CopyButton, MaisDetalhes, lerErro } from "./ui";

type Setup = { integracoes: IntegracaoStatus[]; pronto: boolean; enderecoPublico: StatusEnderecoPublico };
type Preferencia = { provedor: "openrouter" | "chatgpt"; modelo: string; provedorFixo: boolean; modeloFixo: boolean };
type Conexao = { account: { email?: string; planType?: string } | null; login: { verificationUrl: string; userCode: string } | null; error: string | null; models: { id: string; name: string }[] };
type Visao = { iaConectada: boolean; modelo: string; escolhido: boolean; opcoes: Opcao[] };
type Resultado = { ok: boolean; mensagem: string };

async function pedido<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!r.ok) throw new Error((await lerErro(r)).mensagem);
  return r.json();
}

// ---------------------------------------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------------------------------------

function SecaoConfig({ id, icone, titulo, descricao, children }: { id?: string; icone: NomeIcone; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-9 scroll-mt-6">
      <div className="secao-config">
        <Icone nome={icone} tamanho={20} />
        <div>
          <h2>{titulo}</h2>
          <p>{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function CartaoConexao({ id, icone, titulo, selo, conectado, rotuloEstado, descricao, recolhivel = false, children }: {
  id: string;
  icone: NomeIcone;
  titulo: string;
  /** Selo ao lado do título (ex.: "Principal"). */
  selo?: string;
  conectado: boolean;
  rotuloEstado?: string;
  descricao: string;
  /** Começa recolhido, com o botão Configurar/Gerenciar no cabeçalho. */
  recolhivel?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(!recolhivel);
  return (
    <section id={id} className="card-conexao scroll-mt-6" data-conectado={conectado}>
      <header>
        <span className="icone-conexao"><Icone nome={icone} tamanho={22} /></span>
        <div className="min-w-0 flex-1">
          <h3>{titulo}{selo && <span className="selo-principal">{selo}</span>}</h3>
          <p className="text-[12.5px] text-ink-2 mt-0.5 leading-snug">{descricao}</p>
        </div>
        <span className="estado-conexao" data-on={conectado}>{rotuloEstado ?? (conectado ? "Conectado" : "Não conectado")}</span>
      </header>
      {recolhivel && (
        <button type="button" className="btn-compacto self-start" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          {aberto ? "Recolher" : conectado ? "Gerenciar" : "Configurar"}
          <Icone nome="seta" tamanho={14} className={aberto ? "rotate-90 transition-transform" : "transition-transform"} />
        </button>
      )}
      {aberto && children}
    </section>
  );
}

function Teste({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return <p className="resultado-teste" data-ok={r.ok} role="status">{r.mensagem}</p>;
}

function selecionarModelo(opcoes: Opcao[], valor: string, aoMudar: (v: string) => void, id: string, desabilitado = false) {
  const grupos: { chave: NonNullable<Opcao["grupo"]>; rotulo: string }[] = [
    { chave: "recomendado", rotulo: "Recomendado (gratuito)" },
    { chave: "gratuito", rotulo: "Outros gratuitos" },
    { chave: "pago", rotulo: "Pagos (mais qualidade)" },
  ];
  const temGrupos = opcoes.some((o) => o.grupo);
  return (
    <select id={id} className="input !py-2.5" value={valor} disabled={desabilitado} onChange={(e) => aoMudar(e.target.value)}>
      {temGrupos ? (
        <>
          {opcoes.filter((o) => !o.grupo).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          {grupos.map((g) => {
            const doGrupo = opcoes.filter((o) => o.grupo === g.chave);
            return doGrupo.length ? <optgroup key={g.chave} label={g.rotulo}>{doGrupo.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</optgroup> : null;
          })}
        </>
      ) : opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      {valor && !opcoes.some((o) => o.valor === valor) && <option value={valor}>{valor}</option>}
    </select>
  );
}

// ---------------------------------------------------------------------------------------------------------
// ChatGPT (assinatura, login por código de dispositivo pelo Codex App Server — lib/chatgpt.ts)
// ---------------------------------------------------------------------------------------------------------

function CartaoChatGPT({ preferencia, aoEscolher }: { preferencia: Preferencia | null; aoEscolher: (p: Preferencia["provedor"], modelo?: string) => Promise<void> }) {
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const principal = preferencia?.provedor === "chatgpt";
  const conectado = Boolean(conexao?.account);

  // Consulta a conexão ao abrir e, enquanto há um login pendente, a cada 2,5 s (o código é confirmado em outra aba).
  // `pedido` lança um Error com a mensagem do servidor (ex.: a ponte do ChatGPT não subiu): mostrada como está.
  const aguardandoLogin = Boolean(conexao?.login);
  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const carregar = async () => {
      try {
        const d = await pedido<Conexao>("/api/chatgpt");
        if (!ativo) return;
        setConexao(d);
        setErro("");
        if (d.login) timer = setTimeout(carregar, 2500);
      } catch (e) {
        if (ativo) setErro(e instanceof Error && e.message ? e.message : (await lerErro(e)).mensagem);
      }
    };
    void carregar();
    return () => { ativo = false; if (timer) clearTimeout(timer); };
  }, [aguardandoLogin, tentativa]);

  async function agir(fn: () => Promise<void>) {
    setOcupado(true);
    setErro("");
    try { await fn(); } catch (e) { setErro(e instanceof Error && e.message ? e.message : (await lerErro(e)).mensagem); } finally { setOcupado(false); }
  }

  return (
    <CartaoConexao id="chatgpt" icone="faisca" titulo="ChatGPT" selo={principal ? "Principal" : undefined} conectado={conectado} descricao="Use a sua assinatura para escrever e editar os sites, dentro dos limites da sua conta.">
      <div className="corpo-conexao">
        {!conexao && !erro && <p className="text-muted" role="status">Verificando a conexão...</p>}
        {conexao?.error && <Aviso tom="danger">{conexao.error}</Aviso>}
        {erro && <Aviso tom={conexao ? "danger" : "warn"} acao={{ rotulo: "Tentar de novo", onClick: () => setTentativa((t) => t + 1) }}>{erro}</Aviso>}

        {conexao?.account && (
          <>
            <p><strong>{conexao.account.email || "Conta conectada"}</strong>{conexao.account.planType ? <span className="text-muted"> · plano {conexao.account.planType}</span> : null}<span className="text-muted"> · {conexao.models.length} modelos</span></p>
            <label>
              <span>Modelo</span>
              <select className="input !py-2.5" value={preferencia?.modelo ?? ""} disabled={ocupado || !preferencia || preferencia.modeloFixo} onChange={(e) => agir(() => aoEscolher("chatgpt", e.target.value))}>
                <option value="">Automático</option>
                {preferencia?.modelo && !conexao.models.some((m) => m.id === preferencia.modelo) && <option value={preferencia.modelo}>{preferencia.modelo} · indisponível</option>}
                {conexao.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <div className="acoes-conexao">
              {!principal && <button type="button" className="btn-compacto-primario" disabled={ocupado || preferencia?.provedorFixo} onClick={() => agir(() => aoEscolher("chatgpt"))}>Usar como principal</button>}
              <button type="button" className="btn-compacto" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", {}); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Desconectar</button>
            </div>
          </>
        )}

        {conexao && !conexao.account && conexao.login && (
          <>
            <p>Abra a página oficial do ChatGPT e informe este código:</p>
            <div className="flex items-center gap-3 flex-wrap">
              <strong className="codigo-dispositivo" data-codigo>{conexao.login.userCode}</strong>
              <CopyButton texto={() => conexao.login!.userCode} rotulo="Copiar o código" />
            </div>
            <div className="acoes-conexao">
              <a className="btn-compacto-primario" href={conexao.login.verificationUrl} target="_blank" rel="noreferrer">Entrar no ChatGPT</a>
              <button type="button" className="btn-link text-[13px]" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", { cancel: true }); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Cancelar</button>
            </div>
            <p className="dica-conexao" role="status">Aguardando a sua autorização...</p>
          </>
        )}

        {conexao && !conexao.account && !conexao.login && (
          <>
            <p className="text-ink-2">Conecte uma vez pelo código de dispositivo; a conta fica só nesta instalação.</p>
            <div className="acoes-conexao">
              <button type="button" className="btn-compacto-primario" disabled={ocupado} onClick={() => agir(async () => { const login = await pedido<Conexao["login"]>("/api/chatgpt", "POST"); setConexao((c) => (c ? { ...c, login, error: null } : c)); })}>
                {ocupado ? "Preparando..." : "Conectar com o ChatGPT"}
              </button>
            </div>
          </>
        )}
        <p className="dica-conexao">A leitura de capturas passa sempre pelo OpenRouter: para clonar por imagem, conecte também o cartão ao lado.</p>
        {preferencia?.provedorFixo && <p className="dica-conexao">A escolha do principal foi definida pela equipe técnica.</p>}
      </div>
    </CartaoConexao>
  );
}

// ---------------------------------------------------------------------------------------------------------
// OpenRouter (chave; também o modelo que lê a captura)
// ---------------------------------------------------------------------------------------------------------

function CartaoOpenRouter({ integracao, preferencia, aoEscolher, aoRecarregar }: { integracao: IntegracaoStatus | undefined; preferencia: Preferencia | null; aoEscolher: (p: Preferencia["provedor"]) => Promise<void>; aoRecarregar: () => Promise<void> }) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [chave, setChave] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [teste, setTeste] = useState<Resultado | null>(null);
  const [testeVisao, setTesteVisao] = useState<Resultado | null>(null);
  const [erro, setErro] = useState("");
  const principal = preferencia?.provedor === "openrouter";
  const conectado = Boolean(integracao?.configurada);
  const campoChave = integracao?.campos.find((c) => c.tipo === "secret");
  const campoModelo = integracao?.campos.find((c) => c.chave === "OPENROUTER_MODEL");

  useEffect(() => {
    fetch("/api/visao").then((r) => r.json()).then(setVisao).catch(() => {});
  }, [conectado]);

  async function agir(chaveOcupado: string, fn: () => Promise<void>) {
    setOcupado(chaveOcupado);
    setErro("");
    try { await fn(); } catch (e) { setErro((await lerErro(e)).mensagem); } finally { setOcupado(""); }
  }

  return (
    <CartaoConexao id="openrouter" icone="elo" titulo="OpenRouter" selo={principal ? "Principal" : undefined} conectado={conectado} descricao="Dezenas de modelos, vários gratuitos. É também quem lê a captura de referência.">
      <div className="corpo-conexao">
        {!integracao && <p className="text-muted" role="status">Carregando...</p>}
        {erro && <Aviso tom="danger">{erro}</Aviso>}

        {integracao && !conectado && (
          <>
            <p className="text-ink-2">{integracao.notaConexao ?? "Conta gratuita basta."}</p>
            <div className="acoes-conexao">
              {integracao.oauth && <a className="btn-compacto-primario" href={integracao.oauth.url}><Icone nome="elo" tamanho={15} />Conectar em um clique</a>}
              {integracao.link && <a className="btn-link text-[13px]" href={integracao.link.url} target="_blank" rel="noreferrer">{integracao.link.rotulo}</a>}
            </div>
            <MaisDetalhes titulo="Ou colar uma chave">
              <div className="flex gap-2 max-md:flex-col">
                <input className="input !py-2.5 flex-1 min-w-0" type="password" autoComplete="off" placeholder={campoChave?.placeholder ?? "sk-or-v1-..."} value={chave} onChange={(e) => setChave(e.target.value)} />
                <button type="button" className="btn-compacto-primario shrink-0" disabled={!chave.trim() || ocupado === "salvar"} onClick={() => agir("salvar", async () => { await pedido(URL_CONFIG, "PUT", { valores: { OPENROUTER_API_KEY: chave.trim() } }); setChave(""); await aoRecarregar(); })}>
                  {ocupado === "salvar" ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </MaisDetalhes>
          </>
        )}

        {integracao && conectado && (
          <>
            <p><strong>Chave guardada</strong>{campoChave?.mascarado ? <span className="text-muted font-mono text-[12.5px]"> · {campoChave.mascarado}</span> : null}{campoChave?.origem === ORIGEM_AMBIENTE ? <span className="text-muted"> · definida pela equipe técnica</span> : null}</p>
            {campoModelo && (
              <label>
                <span>Modelo para textos e edições</span>
                {selecionarModelo(campoModelo.opcoes ?? [], campoModelo.valorVisivel || campoModelo.padrao || "auto", (v) => agir("modelo", async () => { await pedido(URL_CONFIG, "PUT", { valores: { OPENROUTER_MODEL: v } }); await aoRecarregar(); }), "campo-OPENROUTER_MODEL", ocupado === "modelo")}
                <span className="dica-conexao block mt-1">Automático já funciona. Se aparecer &ldquo;sem crédito&rdquo; ou &ldquo;limite diário&rdquo;, troque por outro gratuito.</span>
              </label>
            )}
            <div id="qualidade-da-pagina" className="rounded-[12px] border border-line bg-bg p-3 flex flex-col gap-2 scroll-mt-6">
              <label>
                <span>Modelo que lê a captura</span>
                {visao ? selecionarModelo(visao.opcoes, visao.modelo, (v) => agir("visao", async () => { setTesteVisao(null); setVisao(await pedido<Visao>("/api/visao", "PUT", { modelo: v })); }), "modelo-da-captura", ocupado === "visao") : <p className="text-muted text-[13px]">Carregando...</p>}
                <span className="dica-conexao block mt-1">Decide o quanto a página sai parecida com a referência. Os gratuitos dão conta de páginas simples; os pagos chegam mais perto.</span>
              </label>
              <div className="acoes-conexao">
                <button type="button" className="btn-compacto" disabled={ocupado === "testar-visao"} onClick={() => agir("testar-visao", async () => { setTesteVisao(null); setTesteVisao(await pedido<Resultado>("/api/visao", "POST")); })}>
                  {ocupado === "testar-visao" ? "Testando..." : "Testar leitura de imagem"}
                </button>
              </div>
              <Teste r={testeVisao} />
            </div>
            <div className="acoes-conexao">
              {!principal && <button type="button" className="btn-compacto-primario" disabled={Boolean(ocupado) || preferencia?.provedorFixo} onClick={() => agir("principal", () => aoEscolher("openrouter"))}>Usar como principal</button>}
              <button type="button" className="btn-compacto" disabled={ocupado === "testar"} onClick={() => agir("testar", async () => { setTeste(null); const r = await fetch(URL_CONFIG_TESTAR, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "openrouter" }) }); setTeste(await r.json()); })}>
                {ocupado === "testar" ? "Testando..." : "Testar conexão"}
              </button>
              {campoChave?.origem !== ORIGEM_AMBIENTE && (
                <button type="button" className="btn-compacto !text-muted" disabled={ocupado === "desconectar"} onClick={() => agir("desconectar", async () => { await pedido(URL_CONFIG, "PUT", { valores: Object.fromEntries(integracao.campos.map((c) => [c.chave, null])) }); setTeste(null); await aoRecarregar(); })}>
                  {ocupado === "desconectar" ? "Desconectando..." : "Desconectar"}
                </button>
              )}
            </div>
            <Teste r={teste} />
          </>
        )}
      </div>
    </CartaoConexao>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Cartão genérico de integração (Netlify, Render): campos, salvar, testar, desconectar, OAuth quando existe
// ---------------------------------------------------------------------------------------------------------

function CampoIntegracao({ campo, valor, aoMudar }: { campo: CampoStatus; valor: string; aoMudar: (v: string) => void }) {
  const id = `campo-${campo.chave}`;
  return (
    <label htmlFor={id} className="block">
      <span>{campo.rotulo}{campo.opcional ? " (opcional)" : ""}</span>
      {campo.tipo === "select" ? (
        <select id={id} className="input !py-2.5" value={valor || campo.valorVisivel || campo.padrao || ""} onChange={(e) => aoMudar(e.target.value)}>
          {(campo.opcoes ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      ) : (
        <input id={id} className="input !py-2.5" type={campo.tipo === "secret" ? "password" : "text"} autoComplete="off" value={valor} onChange={(e) => aoMudar(e.target.value)}
          placeholder={campo.tipo === "secret" && campo.mascarado ? `salvo: ${campo.mascarado}` : campo.tipo === "text" && campo.valorVisivel ? campo.valorVisivel : campo.placeholder || ""} />
      )}
      {campo.ajuda && <span className="dica-conexao block mt-1">{campo.ajuda}</span>}
    </label>
  );
}

function CartaoIntegracao({ integracao: i, icone, aoRecarregar }: { integracao: IntegracaoStatus; icone: NomeIcone; aoRecarregar: () => Promise<void> }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState("");
  const [teste, setTeste] = useState<Resultado | null>(null);
  const alterado = Object.values(valores).some((v) => v !== "");

  async function agir(chave: string, fn: () => Promise<void>) {
    setOcupado(chave);
    try { await fn(); } catch (e) { setTeste({ ok: false, mensagem: (await lerErro(e)).mensagem }); } finally { setOcupado(""); }
  }

  const campos = i.campos.filter((c) => !c.avancado);
  return (
    <CartaoConexao id={i.id} icone={icone} titulo={i.titulo} conectado={i.configurada} descricao={i.beneficio || i.descricao} recolhivel>
      <div className="corpo-conexao">
        <p className="text-ink-2">{i.descricao}</p>
        {!i.configurada && i.oauth && (
          <div className="acoes-conexao">
            <a className="btn-compacto-primario" href={i.oauth.url}><Icone nome="elo" tamanho={15} />{i.oauth.rotulo}</a>
            <span className="dica-conexao">ou cole uma chave abaixo</span>
          </div>
        )}
        {!i.configurada && i.notaConexao && <p className="dica-conexao">{i.notaConexao}</p>}
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 [&>*]:min-w-0">
          {campos.map((c) => <CampoIntegracao key={c.chave} campo={c} valor={valores[c.chave] ?? ""} aoMudar={(v) => setValores((s) => ({ ...s, [c.chave]: v }))} />)}
        </div>
        <div className="acoes-conexao">
          <button type="button" className="btn-compacto-primario" disabled={!alterado || ocupado === "salvar"} onClick={() => agir("salvar", async () => { await pedido(URL_CONFIG, "PUT", { valores }); setValores({}); setTeste(null); await aoRecarregar(); })}>{ocupado === "salvar" ? "Salvando..." : "Salvar"}</button>
          {i.configurada && i.testavel && (
            <button type="button" className="btn-compacto" disabled={ocupado === "testar"} onClick={() => agir("testar", async () => { setTeste(null); const r = await fetch(URL_CONFIG_TESTAR, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id }) }); setTeste(await r.json()); })}>{ocupado === "testar" ? "Testando..." : "Testar conexão"}</button>
          )}
          {i.configurada && (
            <button type="button" className="btn-compacto !text-muted" disabled={ocupado === "desconectar"} onClick={() => agir("desconectar", async () => { await pedido(URL_CONFIG, "PUT", { valores: Object.fromEntries(i.campos.map((c) => [c.chave, null])) }); setTeste(null); await aoRecarregar(); })}>{ocupado === "desconectar" ? "Desconectando..." : "Desconectar"}</button>
          )}
          {i.link && <a className="btn-link text-[13px]" href={i.link.url} target="_blank" rel="noreferrer">{i.link.rotulo}</a>}
        </div>
        <Teste r={teste} />
      </div>
    </CartaoConexao>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Para a equipe técnica
// ---------------------------------------------------------------------------------------------------------

function EquipeTecnica({ dados, aoRecarregar }: { dados: Setup; aoRecarregar: () => Promise<void> }) {
  const [valor, setValor] = useState(dados.enderecoPublico.valor ?? "");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const definidos = dados.integracoes.flatMap((i) => i.campos.filter((c) => c.definido));
  return (
    <MaisDetalhes titulo="Para a equipe técnica">
      <div className="flex flex-col gap-3 text-[13px] text-muted">
        <p>Variáveis de ambiente, quando existirem, têm prioridade sobre o que é salvo aqui. As chaves ficam cifradas neste app, no seu servidor.</p>
        <div>
          <label className="rotulo-campo text-ink" htmlFor="app-url">Endereço público do app</label>
          <p className="mb-1.5">{dados.enderecoPublico.valor ? "Detectado sozinho; usado nos links absolutos e no retorno das conexões." : "Ainda não detectado: abra o app pelo endereço publicado uma vez, ou informe abaixo."}{dados.enderecoPublico.origem === ORIGEM_AMBIENTE && " Vem de variável de ambiente."}</p>
          <div className="flex gap-2 flex-wrap items-center">
            <input id="app-url" className="input !py-2.5 flex-1 min-w-[240px]" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="https://meu-app.exemplo.com" disabled={dados.enderecoPublico.origem === ORIGEM_AMBIENTE} />
            <button type="button" className="btn-compacto" disabled={salvando || dados.enderecoPublico.origem === ORIGEM_AMBIENTE || !valor.trim()} onClick={async () => { setSalvando(true); setAviso(""); try { await pedido(URL_CONFIG, "PUT", { valores: { APP_URL: valor.trim() } }); setAviso("Salvo."); await aoRecarregar(); } catch { setAviso("Não foi possível salvar. Tente de novo."); } finally { setSalvando(false); } }}>{salvando ? "Salvando" : "Corrigir"}</button>
          </div>
          {aviso && <p className="mt-1">{aviso}</p>}
        </div>
        {definidos.length > 0 && (
          <ul className="flex flex-col gap-1">
            {definidos.map((c) => <li key={c.chave}><code>{c.chave}</code>: {c.origem === ORIGEM_AMBIENTE ? "variável de ambiente (tem prioridade)" : "salvo neste app"}</li>)}
          </ul>
        )}
      </div>
    </MaisDetalhes>
  );
}

// ---------------------------------------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------------------------------------

export function Configuracoes() {
  const [dados, setDados] = useState<Setup | null>(null);
  const [preferencia, setPreferencia] = useState<Preferencia | null>(null);
  const [aviso, setAviso] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);

  const carregar = async () => {
    const [s, p] = await Promise.all([pedido<Setup>(URL_CONFIG), pedido<Preferencia>("/api/ia")]);
    setDados(s);
    setPreferencia(p);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      carregar().catch(() => setAviso({ tom: "danger", texto: "Não foi possível carregar a configuração. Recarregue a página." }));
      const q = new URLSearchParams(location.search);
      if (q.get("conectado")) setAviso({ tom: "ok", texto: q.get("conectado") === "netlify" ? "Netlify conectada. A chave foi salva neste app." : "Conta conectada. A chave foi salva neste app." });
      if (q.get("erro")) setAviso({ tom: "danger", texto: q.get("erro") || "" });
      if (q.has("conectado") || q.has("erro")) history.replaceState(null, "", CAMINHO_CONFIGURACOES + location.hash);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function escolher(provedor: Preferencia["provedor"], modelo?: string) {
    setPreferencia(await pedido<Preferencia>("/api/ia", "PUT", { provedor, ...(modelo === undefined ? {} : { modelo }) }));
  }

  const openrouter = dados?.integracoes.find((i) => i.id === "openrouter");
  const netlify = dados?.integracoes.find((i) => i.id === "netlify");
  const render = dados?.integracoes.find((i) => i.id === "render");
  const principal = preferencia?.provedor === "chatgpt" ? "ChatGPT" : "OpenRouter";

  return (
    <>
      <TopbarSite />
      <main className="max-w-[1100px] mx-auto px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="sobretitulo mb-1">Marketing e Produto</p>
            <h1 className="titulo-painel !text-[32px] !leading-tight mb-2">Configurações</h1>
            <p className="text-ink-2 max-w-[560px]">Conecte a inteligência artificial que escreve os sites e, se quiser, a hospedagem que publica cada um deles.</p>
          </div>
          {preferencia && <p className="text-[13px] text-ink-2">Principal agora: <strong className="text-ink">{principal}</strong></p>}
        </header>

        {aviso && <div className="mb-6"><Aviso tom={aviso.tom}>{aviso.texto}</Aviso></div>}

        <SecaoConfig id="ia" icone="faisca" titulo="Inteligência artificial" descricao="Conecte uma conta (ou as duas) e escolha qual é a principal. A leitura da captura é sempre pelo OpenRouter.">
          <div className="grade-conexoes">
            <CartaoChatGPT preferencia={preferencia} aoEscolher={escolher} />
            <CartaoOpenRouter integracao={openrouter} preferencia={preferencia} aoEscolher={escolher} aoRecarregar={carregar} />
          </div>
        </SecaoConfig>

        <SecaoConfig id="hospedagem" icone="globo" titulo="Hospedagem e publicação" descricao="Todo site já sai com um link desta instalação. Aqui você conecta um endereço próprio fora dela.">
          <div className="grade-conexoes">
            {netlify && <CartaoIntegracao integracao={netlify} icone="nuvem" aoRecarregar={carregar} />}
            {render && <CartaoIntegracao integracao={render} icone="globo" aoRecarregar={carregar} />}
            {!dados && <p className="text-muted text-sm" role="status">Carregando...</p>}
          </div>
        </SecaoConfig>

        <SecaoConfig id="assistente" icone="robo" titulo="Assistente de IA" descricao="Crie e edite sites de dentro do Claude, do ChatGPT ou de outro assistente.">
          <CartaoConexao id="mcp" icone="robo" titulo="Usar dentro do seu assistente" conectado={false} rotuloEstado="Opcional" descricao="Um código de acesso liga este app ao seu assistente." recolhivel>
            <AcessoMCP />
          </CartaoConexao>
        </SecaoConfig>

        <footer className="mt-4 pt-6 border-t border-line flex flex-col gap-4">
          <p className="text-muted text-[13px] max-w-[620px]">Seus dados não passam por nenhum servidor nosso: o app fala direto com os serviços que você conectar.</p>
          {dados && <EquipeTecnica dados={dados} aoRecarregar={carregar} />}
          <div><Link href="/" className="btn-primary !w-auto">Ir para os meus sites</Link></div>
        </footer>
      </main>
    </>
  );
}
