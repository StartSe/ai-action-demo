"use client";
// Configuração do Radar: IA com dois provedores, fontes e dados de teste.
import { ConexaoIA } from "./ConexaoIA";
import { DadosTeste } from "./DadosTeste";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { MaisDetalhes, Topbar, useStatus } from "./ui";
import type {
  CampoStatus,
  IntegracaoStatus,
  Opcao,
  StatusEnderecoPublico,
} from "@/lib/setup-comum";
import type { Segmento } from "@/lib/ilustracao";

type Resposta = {
  integracoes: IntegracaoStatus[];
  pronto: boolean;
  enderecoPublico: StatusEnderecoPublico;
};

// Duas frases de privacidade, verdadeiras desde a US-011 (as chaves são cifradas em
// repouso, ver lib/store.ts, mas o app continua chamando serviços externos de verdade
// — nunca afirmar "nenhuma conexão externa"). Repetidas na coluna de apoio e no
// rodapé: mesmo texto nos dois lugares, nunca reescritas.

// Ícone circular de cada cartão, por id de integração (ver public/ilustracoes/icones). Ids não listados
// caem no ícone padrão — cobre integrações futuras (MCP_TAREFAS, MCP_CRM etc.) sem precisar de mudança aqui.
const ICONE_POR_ID: Record<string, string> = {
  openrouter: "robo",
  "mcp-tarefas": "checklist",
  "mcp-crm": "rede",
  "mcp-empresa": "integracao",
  "mcp-dados": "grafico",
};
const ICONE_PADRAO = "integracao";
function iconeIntegracao(id: string): string {
  return ICONE_POR_ID[id] ?? ICONE_PADRAO;
}

/** `children`: cartões próprios do app (política, webhook...) que precisam aparecer ANTES do rodapé "Ir
 * para o app" — quem entra em /setup não deve ser convidado a sair antes de ver o que ainda falta
 * configurar. Cartões secundários (como "Usar dentro do seu assistente") continuam depois da tela. */
export function SetupPage({
  marca,
  nome,
  area,
  children,
}: {
  marca: string;
  nome: string;
  area: string;
  segmento: Segmento;
  children?: ReactNode;
}) {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);

  const carregar = () =>
    fetch("/api/setup")
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar conexões");
        return r.json();
      })
      .then((d) => {
        setDados(d);
        window.dispatchEvent(new Event("radar-conexoes"));
      })
      .catch(() =>
        setAviso({
          tipo: "erro",
          texto: "Não foi possível carregar a configuração.",
        }),
      );
  const [aberta, setAberta] = useState<string | null>(null);
  useEffect(() => {
    const abrirHash = () => {
      if (location.hash) setAberta(["ia", "chatgpt"].includes(location.hash.slice(1)) ? "openrouter" : location.hash.slice(1));
    };
    const t = setTimeout(abrirHash, 0);
    window.addEventListener("hashchange", abrirHash);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", abrirHash);
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      carregar();
      const p = new URLSearchParams(location.search);
      if (p.get("conectado")) setAviso({ tipo: "ok", texto: "Conexão salva." });
      if (p.get("erro")) setAviso({ tipo: "erro", texto: p.get("erro") || "" });
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <Topbar
        marca={marca}
        nome={nome}
        area={area}
        status={status}
        erro={erro}
        usuario={status?.usuario}
      />
      <main className="max-w-[1100px] mx-auto px-5 py-8">
        <header className="mb-6">
          <p className="sobretitulo">Configurações</p>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1">
            Pronto para o primeiro sinal
          </h1>
          <p className="text-muted text-sm mt-2">
            Comece com o essencial. Amplie a pesquisa quando precisar.
          </p>
        </header>
        {aviso && (
          <p role="status" className="card p-3 mb-4 text-sm">
            {aviso.texto}
          </p>
        )}
        <section className="rounded-2xl border border-accent/20 bg-accent-soft p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">Configuração mínima</h2>
            <span className="text-xs text-accent-ink">
              Fontes públicas disponíveis, sem chave adicional
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <strong>1. Conecte a inteligência artificial</strong>
              <p className="text-muted mt-1">
                {status?.ai
                  ? "IA configurada. Você já pode analisar seus temas."
                  : "Use sua conta OpenRouter ou ChatGPT para gerar os sinais."}
              </p>
              <button
                className="btn-link mt-2"
                onClick={() => setAberta("openrouter")}
              >
                {status?.ai ? "Revisar conexão" : "Conectar IA"}
              </button>
            </div>
            <div>
              <strong>2. Escolha o que acompanhar</strong>
              <p className="text-muted mt-1">
                Cadastre um tema, concorrente ou tecnologia.
              </p>
              <Link className="btn-link inline-block mt-2" href="/termos">
                Escolher temas
              </Link>
            </div>
          </div>
        </section>
        <div className="grid lg:grid-cols-2 gap-6 items-start [&>*]:min-w-0">
          <section>
            <h2 className="font-bold mb-3">Conexões</h2>
            {!dados && (
              <p role="status" className="text-sm text-muted">
                Carregando conexões…
              </p>
            )}
            <div className="space-y-2">
              {dados?.integracoes.map((i, indice) => (
                <div
                  key={i.id}
                  id={i.id === "openrouter" ? "ia" : i.id}
                  className="card !shadow-none overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full text-left p-4 flex items-center gap-3 cursor-pointer hover:bg-bg"
                    aria-expanded={aberta === i.id}
                    aria-controls={`conexao-${i.id}`}
                    onClick={() => setAberta(aberta === i.id ? null : i.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <strong className="text-sm">
                        {i.id === "openrouter"
                          ? "Inteligência artificial"
                          : i.id === "exa"
                            ? "Busca web · Exa ou Tavily"
                            : i.titulo}
                      </strong>
                      <p className="text-xs text-muted mt-1">
                        {i.obrigatoria
                          ? "Essencial para analisar sinais"
                          : i.id === "exa"
                            ? "Opcional · necessário para priorizar seus sites"
                            : "Opcional · amplie seu radar"}
                      </p>
                    </div>
                    <span
                      className={`text-xs ${(i.id === "openrouter" ? status?.ai : i.configurada) ? "text-ok" : "text-muted"}`}
                    >
                      {(i.id === "openrouter" ? status?.ai : i.configurada)
                        ? "Configurado"
                        : i.obrigatoria
                          ? "Conectar"
                          : "Adicionar"}
                    </span>
                    <span aria-hidden="true">
                      {aberta === i.id ? "−" : "+"}
                    </span>
                  </button>
                  {aberta === i.id && (
                    <div
                      id={`conexao-${i.id}`}
                      className="border-t border-line"
                    >
                      {i.id === "openrouter" ? <ConexaoIA aoSalvar={carregar}>
                        <CartaoIntegracao integracao={i} numero={indice + 1} aoSalvar={carregar} />
                      </ConexaoIA> : <CartaoIntegracao
                        integracao={i}
                        numero={indice + 1}
                        aoSalvar={carregar}

                      />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-4">
              Uma conexão de busca web é suficiente para começar a priorizar
              sites. Você não precisa conectar todos os serviços.
            </p>
          </section>
          <section>
            <h2 className="font-bold mb-3">Preferências da pesquisa</h2>
            {children}
            <DadosTeste />
          </section>
        </div>
        <footer className="flex flex-wrap gap-4 justify-between items-center mt-6 border-t border-line pt-4">
          <p className="text-xs text-muted">
            Suas chaves ficam protegidas no servidor.
          </p>
          <Link href="/radar" className="btn-primary !w-auto !h-10 !text-sm">
            Abrir o radar
          </Link>
        </footer>
      </main>
    </>
  );
}

function CartaoIntegracao({
  integracao: i,
  numero,
  aoSalvar,
  destaque,
}: {
  integracao: IntegracaoStatus;
  numero: number;
  aoSalvar: () => void;
  destaque?: boolean;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; mensagem: string } | null>(
    null,
  );
  const [testando, setTestando] = useState(false);
  const alterado = Object.values(valores).some((v) => v !== "");

  async function salvar() {
    setSalvando(true);
    setTeste(null);
    try {
      const r = await fetch("/api/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores }),
      });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setValores({});
      aoSalvar();
    } catch (e) {
      setTeste({
        ok: false,
        mensagem: e instanceof Error ? e.message : "Falha ao salvar.",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function desconectar() {
    setDesconectando(true);
    setTeste(null);
    try {
      const r =
        i.oauth?.tipo === "mcp"
          ? await fetch(i.oauth.url, { method: "PUT" })
          : await fetch("/api/setup", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                valores: Object.fromEntries(
                  i.campos.map((c) => [c.chave, null]),
                ),
              }),
            });
      if (!r.ok) throw new Error("Falha ao desconectar.");
      setValores({});
      aoSalvar();
    } catch (e) {
      setTeste({
        ok: false,
        mensagem: e instanceof Error ? e.message : "Falha ao desconectar.",
      });
    } finally {
      setDesconectando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const r = await fetch("/api/setup/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: i.id }),
      });
      setTeste(await r.json());
    } catch {
      setTeste({ ok: false, mensagem: "Não foi possível testar agora." });
    } finally {
      setTestando(false);
    }
  }

  const chaveSecreta = i.campos.find((c) => c.tipo === "secret");
  const aoMudarCampo = (chave: string) => (v: string) =>
    setValores((s) => ({ ...s, [chave]: v }));
  // Valor efetivo de cada campo agora (edição ainda não salva > salvo > padrão), usado para decidir
  // `visivelQuando` sem depender de um novo PUT — trocar o canal já mostra o campo certo na hora.
  const valoresAtuais = Object.fromEntries(
    i.campos.map((c) => [
      c.chave,
      valores[c.chave] || c.valorVisivel || c.padrao || "",
    ]),
  );
  const campoVisivel = (c: CampoStatus) =>
    !c.visivelQuando ||
    c.visivelQuando.valores.includes(
      valoresAtuais[c.visivelQuando.campo] ?? "",
    );
  const passos = i.oauth ? [] : passosSetup(i);
  const camposPrincipais = i.campos.filter(
    (c) => !c.avancado && campoVisivel(c),
  );
  const camposAvancados = i.campos.filter((c) => c.avancado && campoVisivel(c));

  const campos = (
    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
      {camposPrincipais.map((c) => (
        <CampoSetup
          key={c.chave}
          campo={c}
          valor={valores[c.chave] ?? ""}
          aoMudar={aoMudarCampo(c.chave)}
        />
      ))}
    </div>
  );

  const opcoesAvancadas = camposAvancados.length > 0 && (
    <MaisDetalhes titulo="Opções avançadas">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
        {camposAvancados.map((c) => (
          <CampoSetup
            key={c.chave}
            campo={c}
            valor={valores[c.chave] ?? ""}
            aoMudar={aoMudarCampo(c.chave)}
          />
        ))}
      </div>
    </MaisDetalhes>
  );

  const acoesSalvar = (
    <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mt-4">
      <button
        type="button"
        className="btn-primary !w-auto max-md:!w-full"
        onClick={salvar}
        disabled={!alterado || salvando}
      >
        {salvando ? "Salvando" : "Salvar"}
      </button>
      {!alterado && (
        <span className="text-muted text-sm">
          Preencha ao menos um campo para salvar
        </span>
      )}
      {i.link && (
        <a
          className="btn-link text-sm"
          href={i.link.url}
          target="_blank"
          rel="noreferrer"
        >
          {i.link.rotulo}
        </a>
      )}
    </div>
  );

  return (
    <section className={`p-4 ${destaque ? "bg-accent-soft" : ""}`}>
      <div className="flex items-start gap-3.5 mb-4">
        <div className="relative shrink-0">
          <span className="absolute -left-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
            {numero}
          </span>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft overflow-hidden">
            <Image
              src={`/ilustracoes/icones/${iconeIntegracao(i.id)}.webp`}
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold">{i.titulo}</h2>
            <span
              className={`chip-status ${i.configurada ? "chip-status-conectado" : "chip-status-pendente"}`}
            >
              {i.configurada ? "Configurado" : "Pendente"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            {i.beneficio || i.descricao}
          </p>
        </div>
      </div>

      {i.beneficio && <p className="text-sm text-muted mb-4">{i.descricao}</p>}
      {i.oauth ? (
        <>
          <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mb-4">
            {i.configurada ? (
              <>
                <span className="chip-positivo max-md:self-start">
                  Conectado
                  {chaveSecreta?.mascarado
                    ? ` · ${chaveSecreta.mascarado}`
                    : ""}
                </span>
                <button
                  type="button"
                  className="btn-ghost !w-auto max-md:!w-full"
                  onClick={desconectar}
                  disabled={desconectando}
                >
                  {desconectando ? "Desconectando" : "Desconectar"}
                </button>
                {i.testavel && (
                  <button
                    type="button"
                    className="btn-secundario !w-auto max-md:!w-full"
                    onClick={testar}
                    disabled={testando}
                  >
                    {testando ? "Testando" : "Testar conexão"}
                  </button>
                )}
              </>
            ) : (
              // Quem ainda não tem conta no serviço precisa criá-la ANTES de autorizar: o link fica
              // visível ao lado do botão, não dentro de "Opções avançadas" (onde ele também aparece).
              <>
                {i.link && (
                  <a
                    className="btn-link text-sm max-md:self-start"
                    href={i.link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {i.link.rotulo}
                  </a>
                )}
                <a
                  href={i.oauth.url}
                  className="btn-primary !w-auto max-md:!w-full"
                >
                  {i.oauth.rotulo}
                </a>
              </>
            )}
          </div>
          {!i.configurada && i.notaConexao && (
            <p className="text-[12.5px] text-muted -mt-2 mb-4">
              {i.notaConexao}
            </p>
          )}
          <MaisDetalhes
            titulo={
              i.id === "openrouter"
                ? "Chave e modelos de IA"
                : "Opções avançadas: colar uma chave"
            }
          >
            {campos}
            {opcoesAvancadas}
            {acoesSalvar}
          </MaisDetalhes>
        </>
      ) : (
        <>
          {!i.configurada && i.notaConexao && (
            <p className="text-[12.5px] text-muted mb-4">{i.notaConexao}</p>
          )}
          {passos.length > 0 && (
            <ol className="list-decimal list-inside flex flex-col gap-1 text-sm text-muted mb-4">
              {passos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          )}

          {campos}
          {opcoesAvancadas}
          <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mt-4">
            {i.configurada && i.testavel && (
              <button
                type="button"
                className="btn-secundario !w-auto max-md:!w-full"
                onClick={testar}
                disabled={testando}
              >
                {testando ? "Testando" : "Testar conexão"}
              </button>
            )}
            <button
              type="button"
              className="btn-primary !w-auto max-md:!w-full"
              onClick={salvar}
              disabled={!alterado || salvando}
            >
              {salvando ? "Salvando" : "Salvar"}
            </button>
            {!alterado && (
              <span className="text-muted text-sm">
                Preencha ao menos um campo para salvar
              </span>
            )}
            {i.link && (
              <a
                className="btn-link text-sm"
                href={i.link.url}
                target="_blank"
                rel="noreferrer"
              >
                {i.link.rotulo}
              </a>
            )}
          </div>
        </>
      )}
      {teste && (
        <p
          className={`mt-3 text-sm font-semibold ${teste.ok ? "text-ok" : "text-danger"}`}
        >
          {teste.mensagem}
        </p>
      )}
    </section>
  );
}

/** Passo a passo de até três passos, gerado a partir do link para obter a chave. A ajuda do primeiro
 * campo não entra aqui: ela já aparece sob o próprio campo (`CampoSetup`), repeti-la duplicaria o texto.
 * Uma integração sem nenhum campo secreto (ex.: as cotações de câmbio do custos-ia) não tem chave para colar:
 * o último passo fala em preencher os campos. Notificações tem um passo a passo próprio por canal, porque
 * o caminho (Resend/SMTP para e-mail, webhook para Slack) muda por completo conforme a escolha. */
function passosSetup(
  i: IntegracaoStatus,
): string[] {
  // Integração que já funciona sozinha (todos os campos são `avancado`, ex.: o câmbio automático do
  // custos-ia) não tem nada a preencher: mandar "Preencha os campos abaixo" com a grade vazia logo
  // embaixo seria uma instrução falsa.
  if (i.campos.every((c) => c.avancado)) return [];
  const passos: string[] = [];
  const temChave = i.campos.some((c) => c.tipo === "secret");
  if (i.link) passos.push(`Abra "${i.link.rotulo}" e copie a chave.`);
  passos.push(
    temChave
      ? "Cole a chave abaixo e clique em Salvar."
      : "Preencha os campos abaixo e clique em Salvar.",
  );
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

function CampoSetup({
  campo: c,
  valor,
  aoMudar,
}: {
  campo: CampoStatus;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const id = `campo-${c.chave}`;
  const rotulo = `${c.rotulo}${c.opcional ? " (opcional)" : ""}`;
  const opcoes = c.opcoes ?? [];
  const atual = valor || c.valorVisivel || c.padrao || "";

  if (
    c.tipo === "select" &&
    opcoes.length > 0 &&
    opcoes.length <= LIMITE_BOTOES
  ) {
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
      <label htmlFor={id} className="text-[13px] font-semibold">
        {rotulo}
      </label>
      {c.tipo === "select" ? (
        <select
          id={id}
          className="input"
          value={atual}
          onChange={(e) => aoMudar(e.target.value)}
        >
          {opcoes.some((o) => o.grupo) ? (
            <>
              {/* Sem grupo vem antes de qualquer optgroup (ex.: "Automático" no modelo de IA): fora do
                  <optgroup> a opção continua aparecendo, e no topo, que é onde ela é escolhida. */}
              {opcoes
                .filter((o) => !o.grupo)
                .map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              {GRUPOS_OPCAO.map((g) => {
                const doGrupo = opcoes.filter((o) => o.grupo === g.chave);
                if (doGrupo.length === 0) return null;
                return (
                  <optgroup key={g.chave} label={g.rotulo}>
                    {doGrupo.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </>
          ) : (
            opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))
          )}
          {c.valorVisivel &&
            !opcoes.some((o) => o.valor === c.valorVisivel) && (
              <option value={c.valorVisivel}>{c.valorVisivel}</option>
            )}
        </select>
      ) : (
        <input
          id={id}
          className="input"
          type={c.tipo === "secret" ? "password" : "text"}
          autoComplete="off"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={
            c.tipo === "secret" && c.mascarado
              ? `salvo: ${c.mascarado}`
              : c.tipo === "text" && c.valorVisivel
                ? c.valorVisivel
                : c.placeholder || ""
          }
        />
      )}
      {c.ajuda && <span className="text-[12.5px] text-muted">{c.ajuda}</span>}
    </div>
  );
}
