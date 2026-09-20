"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MaisDetalhes, useStatus } from "./ui";
import { EstruturaObservatorio } from "./observatorio/EstruturaObservatorio";
import { Icone, type NomeIcone } from "./observatorio/Icone";
import { requisitar } from "@/lib/http-cliente";
import type {
  CampoStatus,
  IntegracaoStatus,
  Opcao,
  StatusCaixasEmail,
  StatusEnderecoPublico,
} from "@/lib/setup-comum";

type Resposta = {
  integracoes: IntegracaoStatus[];
  pronto: boolean;
  enderecoPublico: StatusEnderecoPublico;
  caixasEmail: StatusCaixasEmail;
};
const ICONE_POR_ID: Record<string, NomeIcone> = {
  openrouter: "spark",
  notificacoes: "people",
  "mcp-tarefas": "layers",
};

export function SetupPage({ children }: { children?: ReactNode }) {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);
  const carregar = () =>
    requisitar<Resposta>("/api/setup")
      .then((d) => {
        setDados(d);
        setAviso(null);
      })
      .catch(() =>
        setAviso({
          tipo: "erro",
          texto: "Não foi possível carregar a configuração. Tente novamente.",
        }),
      );
  const ancoraVisitada = useRef(false);
  useEffect(() => {
    if (!dados || ancoraVisitada.current) return;
    ancoraVisitada.current = true;
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [dados]);
  const conectadas =
    dados?.integracoes.filter((i) => i.configurada).length ?? 0;
  useEffect(() => {
    const t = setTimeout(async () => {
      await carregar();
      const p = new URLSearchParams(location.search);
      if (p.get("conectado"))
        setAviso({
          tipo: "ok",
          texto: "Conta conectada. A chave foi salva neste app.",
        });
      if (p.get("erro")) setAviso({ tipo: "erro", texto: p.get("erro") || "" });
      if (p.get("conectado") || p.get("erro"))
        history.replaceState(null, "", `/setup${location.hash}`);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <EstruturaObservatorio
      ativo="setup"
      status={status && dados ? { ...status, ai: dados.pronto } : status}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONEXÕES E PREFERÊNCIAS</p>
          <h1>Seu espaço, conectado.</h1>
          <p>
            Escolha as ferramentas que ampliam o olhar e o alcance do seu time.
          </p>
        </div>
        <Link href="/" className="obs-btn secondary">
          Voltar ao painel <Icone nome="arrow" size={16} />
        </Link>
      </div>
      {(aviso || erro) && (
        <div
          role={aviso?.tipo === "ok" ? "status" : "alert"}
          className={`obs-alert ${aviso?.tipo === "ok" ? "" : "error"}`}
        >
          {aviso?.texto || "Não foi possível verificar a conexão."}
          {aviso?.tipo === "erro" && (
            <button className="text-link" onClick={() => void carregar()}>
              Tentar novamente
            </button>
          )}
        </div>
      )}
      <div className="setup-overview" aria-label="Resumo das conexões">
        <div>
          <span className="setup-icon mint">
            <Icone nome="spark" />
          </span>
          <div>
            <small>INTELIGÊNCIA</small>
            <strong>
              {dados
                ? dados.pronto
                  ? "IA conectada"
                  : "Modo assistido"
                : "Carregando…"}
            </strong>
            <p>
              {dados?.pronto
                ? "Agentes prontos para aprofundar a análise"
                : "Coleta e leitura automática disponíveis"}
            </p>
          </div>
        </div>
        <div>
          <span className="setup-icon lavender">
            <Icone nome="link" />
          </span>
          <div>
            <small>INTEGRAÇÕES</small>
            <strong>
              {dados
                ? `${conectadas} de ${dados.integracoes.length} conectadas`
                : "Carregando…"}
            </strong>
            <p>Você decide o que faz sentido conectar</p>
          </div>
        </div>
        <div>
          <span className="setup-icon peach">
            <Icone nome="shield" />
          </span>
          <div>
            <small>SEU CONTROLE</small>
            <strong>Chaves protegidas</strong>
            <p>Cifradas no servidor deste app</p>
          </div>
        </div>
      </div>
      <nav className="settings-jump" aria-label="Seções de configurações">
        <a href="#integracoes">Integrações</a>
        <a href="#assistentes">Seu assistente</a>
        <a href="#rotinas">Rotinas</a>
        <a href="#tecnico">Avançado</a>
      </nav>
      <div className="settings-grid">
        <div className="settings-content">
          <section id="integracoes" aria-labelledby="titulo-integracoes">
            <div className="settings-section-heading">
              <span>01 / CONECTAR</span>
              <h2 id="titulo-integracoes">
                Mais possibilidades para o seu time.
              </h2>
              <p>Da construção das perguntas à entrega dos próximos passos.</p>
            </div>
            {!dados && !aviso && (
              <div className="obs-panel settings-loading" role="status">
                Carregando suas conexões…
              </div>
            )}
            <div className="settings-stack">
              {dados?.integracoes.map((i) => (
                <CartaoIntegracao
                  key={i.id}
                  integracao={i}
                  aoSalvar={carregar}
                  caixasEmail={
                    i.id === "notificacoes" ? dados.caixasEmail : undefined
                  }
                />
              ))}
            </div>
          </section>
          {children}
          <section id="tecnico" className="card settings-technical">
            <MaisDetalhes titulo="Para a equipe técnica">
              <p className="text-muted text-[13px]">
                Variáveis de ambiente, quando existirem, têm prioridade sobre o
                que é salvo aqui.
              </p>
              {dados && (
                <CampoEnderecoPublico
                  status={dados.enderecoPublico}
                  aoSalvar={carregar}
                />
              )}
              {dados && (
                <ul className="mt-4 flex flex-col gap-1 text-[13px] text-muted">
                  {dados.integracoes.flatMap((i) =>
                    i.campos
                      .filter((c) => c.definido)
                      .map((c) => (
                        <li key={c.chave}>
                          <code>{c.chave}</code>:{" "}
                          {c.origem === "env"
                            ? "variável de ambiente"
                            : "salvo neste app"}
                        </li>
                      )),
                  )}
                </ul>
              )}
            </MaisDetalhes>
          </section>
        </div>
        <aside className="settings-aside">
          <div className="settings-note">
            <span className="eyebrow">NO SEU RITMO</span>
            <Icone nome="compass" size={76} />
            <h2>
              Conecte
              <br />
              <em>possibilidades.</em>
            </h2>
            <p>
              O observatório já acompanha seus grupos e coleta respostas. Com
              IA, os agentes ajudam a transformar os sinais em novas
              perspectivas.
            </p>
            <Link href="/?tela=oficina">
              Explorar a oficina <Icone nome="arrow" size={16} />
            </Link>
          </div>
          <div className="settings-privacy">
            <Icone nome="shield" />
            <h3>Você está no comando.</h3>
            <p>
              As chaves ficam cifradas no servidor deste app e aparecem
              mascaradas depois de salvas.
            </p>
            <p>
              Ao usar uma integração, o app envia os dados necessários
              diretamente ao serviço que você conectou.
            </p>
          </div>
        </aside>
      </div>
    </EstruturaObservatorio>
  );
}

// Campo "Endereço público do app" ("Para a equipe técnica"): mostra o valor detectado sozinho a partir
// do host da primeira rotina/lembrete/formulário/pedido criado (ver lib/setup-comum.ts:registrarEnderecoPublico)
// e permite corrigir à mão (domínio próprio, proxy que o app não enxerga).
function CampoEnderecoPublico({
  status,
  aoSalvar,
}: {
  status: StatusEnderecoPublico;
  aoSalvar: () => void;
}) {
  const [valor, setValor] = useState(status.valor ?? "");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function salvar() {
    setSalvando(true);
    setAviso("");
    try {
      const r = await fetch("/api/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores: { APP_URL: valor.trim() } }),
      });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setAviso("Salvo.");
      aoSalvar();
    } catch {
      setAviso("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <label className="text-[13px] font-semibold" htmlFor="app-url">
        Endereço público do app
      </label>
      <p className="text-muted text-[12.5px] mb-1.5">
        {status.valor
          ? "Detectado sozinho. Usado nos links de e-mail e Slack das rotinas."
          : "Ainda não detectado: abra o app pelo endereço publicado uma vez, ou informe abaixo."}
        {status.origem === "env" &&
          " Vem de variável de ambiente: tem prioridade sobre o que for salvo aqui."}
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        <input
          id="app-url"
          className="input flex-1 min-w-0 basis-[220px]"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="https://meu-app.exemplo.com"
          disabled={status.origem === "env"}
        />
        <button
          type="button"
          className="btn-secundario !w-auto"
          onClick={salvar}
          disabled={salvando || status.origem === "env" || !valor.trim()}
        >
          {salvando ? "Salvando" : "Corrigir"}
        </button>
      </div>
      {aviso && <p className="text-[12.5px] text-muted mt-1">{aviso}</p>}
    </div>
  );
}

function CartaoIntegracao({
  integracao: i,
  aoSalvar,
  caixasEmail,
}: {
  integracao: IntegracaoStatus;
  aoSalvar: () => void;
  caixasEmail?: StatusCaixasEmail;
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
  const passos = i.oauth ? [] : passosSetup(i, valoresAtuais);
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
    <section
      id={i.id}
      className="card integration-card p-6 max-md:p-5"
      aria-labelledby={`titulo-${i.id}`}
    >
      <div className="flex items-start gap-3.5 mb-4">
        <span
          className={`setup-icon ${i.id === "openrouter" ? "mint" : i.id === "notificacoes" ? "peach" : "lavender"}`}
        >
          <Icone nome={ICONE_POR_ID[i.id] ?? "link"} size={23} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 id={`titulo-${i.id}`} className="text-base font-bold">
              {i.titulo}
            </h3>
            <span
              className={`chip-status ${i.configurada ? "chip-status-conectado" : "chip-status-pendente"}`}
            >
              {i.configurada ? "Conectado" : "Pendente"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {i.beneficio || i.descricao}
          </p>
        </div>
      </div>

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
          <MaisDetalhes titulo="Opções avançadas: colar uma chave">
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
          {caixasEmail && (
            <ConectarCaixasEmail status={caixasEmail} aoMudar={aoSalvar} />
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
          role={teste.ok ? "status" : "alert"}
          className={`mt-3 text-sm font-semibold ${teste.ok ? "text-ok" : "text-danger"}`}
        >
          {teste.mensagem}
        </p>
      )}
    </section>
  );
}

/** Botões "Conectar meu Gmail"/"Conectar meu Outlook" do cartão "Notificações" (US-024): envia os avisos
 * pela própria caixa da pessoa em vez do Resend/SMTP genérico. Some por completo quando a equipe técnica
 * não definiu as credenciais do app daquele provedor — nunca mostra um botão que vai falhar. */
function ConectarCaixasEmail({
  status,
  aoMudar,
}: {
  status: StatusCaixasEmail;
  aoMudar: () => void;
}) {
  if (!status.gmail.disponivel && !status.outlook.disponivel) return null;
  return (
    <div className="flex flex-col gap-2 mb-4">
      {status.gmail.disponivel && (
        <CaixaEmail
          nome="Gmail"
          url="/api/setup/oauth/google"
          status={status.gmail}
          aoMudar={aoMudar}
        />
      )}
      {status.outlook.disponivel && (
        <CaixaEmail
          nome="Outlook"
          url="/api/setup/oauth/microsoft"
          status={status.outlook}
          aoMudar={aoMudar}
        />
      )}
    </div>
  );
}

function CaixaEmail({
  nome,
  url,
  status,
  aoMudar,
}: {
  nome: string;
  url: string;
  status: { conta?: string };
  aoMudar: () => void;
}) {
  const [desconectando, setDesconectando] = useState(false);
  const [erro, setErro] = useState("");

  async function desconectar() {
    setDesconectando(true);
    setErro("");
    try {
      await requisitar(url, { method: "PUT" });
      aoMudar();
    } catch {
      setErro("Não foi possível desconectar esta conta. Tente novamente.");
    } finally {
      setDesconectando(false);
    }
  }

  if (status.conta) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="chip-positivo">Conectado como {status.conta}</span>
        {erro && (
          <p role="alert" className="text-sm text-danger">
            {erro}
          </p>
        )}
        <button
          type="button"
          className="btn-ghost !w-auto"
          onClick={desconectar}
          disabled={desconectando}
        >
          {desconectando ? "Desconectando" : "Desconectar"}
        </button>
      </div>
    );
  }
  return (
    <a href={url} className="btn-secundario !w-auto">
      Conectar meu {nome}
    </a>
  );
}

/** Passo a passo de até três passos, gerado a partir do link para obter a chave. A ajuda do primeiro
 * campo não entra aqui: ela já aparece sob o próprio campo (`CampoSetup`), repeti-la duplicaria o texto.
 * Uma integração sem nenhum campo secreto (ex.: as cotações de câmbio do custos-ia) não tem chave para colar:
 * o último passo fala em preencher os campos. Notificações tem um passo a passo próprio por canal, porque
 * o caminho (Resend/SMTP para e-mail, webhook para Slack) muda por completo conforme a escolha. */
function passosSetup(
  i: IntegracaoStatus,
  valoresAtuais: Record<string, string>,
): string[] {
  if (i.id === "notificacoes") {
    const canal = valoresAtuais.NOTIFICACOES_CANAL || "email";
    return canal === "slack"
      ? [
          "No Slack, crie um webhook de entrada em Aplicativos › Incoming Webhooks e cole a URL abaixo.",
        ]
      : [
          "Conecte seu Gmail ou Outlook acima; sem isso, crie uma chave gratuita do Resend ou preencha o SMTP em Opções avançadas.",
        ];
  }
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
