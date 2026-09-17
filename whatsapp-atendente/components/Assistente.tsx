"use client";
// Tela do Assistente: criar o atendente em três passos (Configurar → Testar → Conectar). O passo atual
// mora na barra de endereço (`?passo=1|2|3`), então recarregar a página ou voltar no navegador não perde
// o lugar. O conteúdo fica aqui, e não em `app/assistente/page.tsx`, porque `scripts/verificar-jargao.mjs`
// varre `components/*.tsx` mas não as telas em `app/<rota>/page.tsx` (ver CLAUDE.md).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Aviso,
  CopyButton,
  Dica,
  Dropzone,
  ErrorBox,
  Field,
  MaisDetalhes,
  Passos,
  Row,
  Topbar,
  lerErro,
  useConfirmacao,
  useStatus,
  type ErroLido,
  type PassoIndicador,
} from "./ui";
import { Celular, horaAtual, saudacaoPadrao, type AoSalvarBase, type BolhaChat } from "./Celular";
import { ConexaoWhatsApp } from "./ConexaoWhatsApp";
import { formatarTelefone } from "@/lib/telefone";
import type { RespostaConexao } from "@/app/api/whatsapp/conexao/route";
import type { ParBase } from "@/lib/base";
import { SUGESTOES, configExemplo } from "@/lib/demo";
import { OBJETIVOS, TONS, rotuloObjetivo, rotuloTom } from "@/lib/rotulos";
import type { Sugestao } from "@/lib/sugestoes";
import type { Config } from "@/lib/types";

const PASSOS: PassoIndicador[] = [
  { titulo: "Configurar", apoio: "Defina quem é o seu agente" },
  { titulo: "Testar", apoio: "Veja como ele responde" },
  { titulo: "Conectar", apoio: "Conecte seu WhatsApp" },
];

const CONFIG_VAZIA: Config = { negocio: "", atendente: "", objetivo: "atendimento", tom: "profissional", horario: "", baseConhecimento: "", naoSei: "humano" };

/** O mesmo teto que o campo aceita e que o contador mostra: um texto maior que isso não cabe no prompt
 * sem encarecer cada resposta, e a pessoa precisa ver quanto já usou antes de bater no limite. */
const LIMITE_BASE = 12000;

const ACEITA_ARQUIVO = ".txt,.md,.pdf,text/plain,application/pdf";

const PLACEHOLDER_BASE = `Serviços, preços, prazos e horários. Por exemplo:

Consulta e avaliação inicial: R$ 120
Limpeza: R$ 150
Clareamento dental a laser: R$ 900 em 3 sessões

Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia.`;

/**
 * Frase do cartão "Tudo pronto". O nome do atendente é escrito pela pessoa e pode não estar preenchido;
 * o número só chega no aviso de conexão da z-api, então logo depois de ler o código ele ainda não existe.
 */
function fraseRespondendo(atendente: string, numero?: string | null): string {
  const quem = atendente.trim() ? `A ${atendente.trim()}` : "Seu atendente";
  const onde = numero ? `no número ${formatarTelefone(numero)}` : "no número da empresa";
  return `${quem} já está respondendo ${onde}.`;
}

/** Cartão selecionável (objetivo, tom): um rádio de verdade por trás, para o teclado e o leitor de tela
 * continuarem funcionando; o cartão selecionado ganha a borda no acento. */
function CartaoEscolha({
  grupo,
  valor,
  titulo,
  apoio,
  selecionado,
  onEscolher,
}: {
  grupo: string;
  valor: string;
  titulo: string;
  apoio: string;
  selecionado: boolean;
  onEscolher: () => void;
}) {
  return (
    <label
      className={`card p-3.5 flex items-start gap-2.5 cursor-pointer transition-colors ${selecionado ? "border-accent ring-[3px] ring-accent-soft" : "hover:bg-bg"}`}
    >
      <input type="radio" name={grupo} value={valor} checked={selecionado} onChange={onEscolher} className="mt-1 accent-accent" />
      <span className="min-w-0">
        <span className="block font-bold text-[14.5px]">{titulo}</span>
        <span className="block text-muted text-[12.5px]">{apoio}</span>
      </span>
    </label>
  );
}

function Grupo({ titulo, colunas = 2, children }: { titulo: string; colunas?: 2 | 3; children: ReactNode }) {
  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="text-[13px] font-semibold mb-2">{titulo}</legend>
      <div className={`grid gap-2.5 max-md:grid-cols-1 ${colunas === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>
    </fieldset>
  );
}

export function Assistente() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();

  const [passo, setPasso] = useState(1);
  const [config, setConfig] = useState<Config>(CONFIG_VAZIA);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroConfig, setErroConfig] = useState<ErroLido | null>(null);
  const [importando, setImportando] = useState(false);
  const [avisoImportacao, setAvisoImportacao] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);

  // Passo 2: a conversa de teste (o celular interativo) e a base de respostas que ela alimenta.
  const [mensagens, setMensagens] = useState<BolhaChat[]>([]);
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [base, setBase] = useState<ParBase[] | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [sugestoesCodigo, setSugestoesCodigo] = useState<string | null | undefined>(undefined);
  const [criandoLinkSugestoes, setCriandoLinkSugestoes] = useState(false);
  const [tratandoSugestao, setTratandoSugestao] = useState<string | null>(null);
  const [avisoTeste, setAvisoTeste] = useState<ErroLido | null>(null);
  const carregouBase = useRef(false);
  const rolouParaConhecimento = useRef(false);

  // Passo 3: o estado da conexão do número vem do próprio cartão (ele já consulta de 5 em 5 segundos),
  // para o cartão "Tudo pronto" aparecer no instante em que o celular da empresa lê o código.
  const [conexao, setConexao] = useState<RespostaConexao | null>(null);

  const autoEnviado = useRef(false);
  // "Salvar e sair" e "Continuar para teste" submetem o mesmo formulário (para o navegador cobrar os
  // campos obrigatórios nos dois); qual dos dois foi clicado é o que muda o destino depois de salvar.
  const destino = useRef<"inicio" | "teste">("teste");

  function irPara(numero: number) {
    const params = new URLSearchParams(location.search);
    params.set("passo", String(numero));
    history.pushState(null, "", `${location.pathname}?${params.toString()}`);
    setPasso(numero);
  }

  function setCampo<K extends keyof Config>(campo: K, valor: Config[K]) {
    setConfig((c) => ({ ...c, [campo]: valor }));
  }

  /** 401 com codigo "sem_sessao" significa sessão expirada: a tela de entrar resolve, o ErrorBox não. */
  function sessaoExpirada(r: Response, info: ErroLido) {
    if (r.status !== 401 || info.codigo !== "sem_sessao") return false;
    router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
    return true;
  }

  async function salvar(valores: Config): Promise<boolean> {
    setSalvando(true);
    setErroConfig(null);
    try {
      const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valores) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return false;
        setErroConfig(info);
        return false;
      }
      setConfig(await r.json());
      return true;
    } catch (e) {
      setErroConfig(await lerErro(e));
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!(await salvar(config))) return;
    if (destino.current === "inicio") router.push("/");
    else irPara(2);
  }

  /** Lê um manual, tabela de preços ou documento de perguntas frequentes e ACRESCENTA ao campo. */
  async function importarArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setImportando(true);
    setAvisoImportacao(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const r = await fetch("/api/base/arquivo", { method: "POST", body: corpo });
      if (!r.ok) {
        setAvisoImportacao({ tom: "danger", texto: (await lerErro(r)).mensagem });
        return;
      }
      const d = await r.json();
      let sobrou = false;
      setConfig((c) => {
        const junto = c.baseConhecimento.trim() ? `${c.baseConhecimento.trim()}\n\n${d.texto}` : d.texto;
        sobrou = junto.length > LIMITE_BASE;
        return { ...c, baseConhecimento: junto.slice(0, LIMITE_BASE) };
      });
      setAvisoImportacao({
        tom: sobrou || d.cortado ? "danger" : "ok",
        texto:
          sobrou || d.cortado
            ? `O texto de ${arquivo.name} não coube inteiro: o campo guarda até ${LIMITE_BASE.toLocaleString("pt-BR")} caracteres. Confira o que entrou e apague o que não for necessário.`
            : `Conteúdo de ${arquivo.name} acrescentado. Confira o texto antes de continuar.`,
      });
    } catch (e) {
      setAvisoImportacao({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setImportando(false);
    }
  }

  /**
   * Manda uma pergunta de cliente para o atendente. A conversa é a `simulador` do banco (ela aparece
   * na lista de Conversas com o rótulo Simulador), e o corpo NÃO leva a configuração: o passo 1 salva
   * antes de trazer a pessoa para cá, então o que está sendo testado é o atendente de verdade.
   */
  async function enviarTeste(textoBruto: string) {
    const texto = textoBruto.trim();
    if (!texto) return;
    setMensagens((m) => [...m, { papel: "cliente", texto, hora: horaAtual() }, { papel: "atendente", texto: "digitando...", pendente: true }]);
    setEnviando(true);
    try {
      const r = await fetch("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de: "simulador", texto }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: info.mensagem, erro: true, acao: info.acao, hora: horaAtual() }]);
        return;
      }
      const resposta = await r.json();
      setMensagens((m) => {
        const semPendente = m.filter((x) => !x.pendente);
        // Sem resposta: a conversa foi assumida por uma pessoa e a IA não responde por ela.
        if (!resposta.resposta) return semPendente;
        return [...semPendente, { papel: "atendente", texto: resposta.resposta, transferido: resposta.transferir, ferramentaUsada: resposta.ferramentaUsada, hora: horaAtual() }];
      });
    } catch (err) {
      const info = await lerErro(err);
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: info.mensagem, erro: true, acao: info.acao, hora: horaAtual() }]);
    } finally {
      setEnviando(false);
    }
  }

  /** "Aprovar" e "Corrigir" de uma resposta: o par pergunta/resposta entra na base do atendente. */
  const salvarBase: AoSalvarBase = (pergunta, resposta) => {
    fetch("/api/base", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta, resposta }) })
      .then((r) => r.json())
      .then((r) => { if (r.itens) setBase(r.itens); })
      .catch(() => {});
  };

  async function limparTeste() {
    const ok = await confirmar("Apagar a conversa de teste? Essa ação não pode ser desfeita.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setMensagens([]);
    try {
      await fetch("/api/conversas/simulador", { method: "DELETE" });
    } catch {
      // A tela já está limpa; a conversa some do banco no próximo pedido que der certo.
    }
  }

  async function criarLinkSugestoes() {
    setCriandoLinkSugestoes(true);
    setAvisoTeste(null);
    try {
      const r = await fetch("/api/sugestoes", { method: "POST" });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoTeste(info);
        return;
      }
      setSugestoesCodigo((await r.json()).codigo);
    } catch (e) {
      setAvisoTeste(await lerErro(e));
    } finally {
      setCriandoLinkSugestoes(false);
    }
  }

  async function tratarSugestao(id: string, acao: "aprovar" | "descartar") {
    setTratandoSugestao(id);
    setAvisoTeste(null);
    try {
      const r = await fetch("/api/sugestoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoTeste(info);
        return;
      }
      setSugestoes((await r.json()).itens);
      if (acao === "aprovar") fetch("/api/base").then((r2) => r2.json()).then((r2) => setBase(r2.itens)).catch(() => {});
    } catch (e) {
      setAvisoTeste(await lerErro(e));
    } finally {
      setTratandoSugestao(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pedido = Number(params.get("passo"));
    const exemplo = params.get("exemplo") === "1";
    // O efeito marca o `useRef` antes de agendar o `setTimeout` e NÃO registra `clearTimeout` no cleanup:
    // em `next dev` o Strict Mode roda setup → cleanup → setup, e cancelar o timer mataria o atalho (PADRAO.md).
    setTimeout(async () => {
      setPasso(pedido >= 1 && pedido <= 3 ? pedido : 1);
      if (exemplo && !autoEnviado.current) {
        autoEnviado.current = true;
        setConfig(configExemplo);
        setCarregando(false);
        if (await salvar(configExemplo)) {
          irPara(2);
          await enviarTeste(SUGESTOES[0]);
        }
        return;
      }
      try {
        setConfig(await fetch("/api/config").then((r) => r.json()));
      } catch {
        // Sem resposta, o formulário abre vazio e a pessoa preenche do zero.
      } finally {
        setCarregando(false);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  // Voltar/avançar do navegador: o passo vem sempre da barra de endereço, nunca só do estado local.
  useEffect(() => {
    function aoNavegar() {
      const pedido = Number(new URLSearchParams(location.search).get("passo"));
      setPasso(pedido >= 1 && pedido <= 3 ? pedido : 1);
    }
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  // `/assistente#conhecimento`, o atalho "Adicionar conhecimento" do Início: o navegador procura a
  // âncora antes de a configuração chegar, quando o campo ainda não existe na tela. Quem rola até ele
  // e o põe em foco é este efeito, uma única vez, depois da carga.
  useEffect(() => {
    if (carregando || passo !== 1 || rolouParaConhecimento.current) return;
    if (location.hash !== "#conhecimento") return;
    rolouParaConhecimento.current = true;
    document.getElementById("conhecimento")?.scrollIntoView();
    (document.getElementById("baseConhecimento") as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
  }, [carregando, passo]);

  // A base aprovada e as sugestões da equipe só aparecem no passo 2: são buscadas quando a pessoa
  // chega nele, uma única vez, e não na abertura da tela (quem está no passo 1 nunca as vê).
  useEffect(() => {
    if (passo !== 2 || carregouBase.current) return;
    carregouBase.current = true;
    fetch("/api/base").then((r) => r.json()).then((r) => setBase(r.itens)).catch(() => setBase([]));
    fetch("/api/sugestoes")
      .then((r) => r.json())
      .then((d) => { setSugestoesCodigo(d.codigo ?? null); setSugestoes(d.itens || []); })
      .catch(() => { setSugestoesCodigo(null); setSugestoes([]); });
  }, [passo]);

  const conectado = conexao?.estado === "conectado";

  const previa: BolhaChat[] = [
    { papel: "atendente", texto: saudacaoPadrao(config.atendente, config.negocio) },
    { papel: "cliente", texto: SUGESTOES[0] },
  ];

  return (
    <>
      <Topbar marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="mb-6">
          <Passos passos={PASSOS} atual={passo} onIr={irPara} />
        </div>

        <h1 className="titulo-painel mb-1.5">Vamos criar seu atendente de IA?</h1>
        <p className="apoio mb-6">Em poucos minutos você terá um atendente pronto para atender seus clientes no WhatsApp.</p>

        {passo === 3 ? (
          <div className="flex flex-col gap-3 max-w-[900px]">
            {conectado && (
              <div className="card p-5 border-accent">
                <h2 className="font-bold text-[15px] mb-1">Tudo pronto</h2>
                <p className="text-sm text-muted mb-4">{fraseRespondendo(config.atendente, conexao?.numero)}</p>
                <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={() => router.push("/")}>
                  Ir para o Início
                </button>
              </div>
            )}

            <ConexaoWhatsApp
              titulo="Conecte seu WhatsApp"
              apoio="Escaneie o código com o celular da empresa e o atendente começa a responder."
              onEstado={setConexao}
            />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button type="button" className="btn-link text-[14px]" onClick={() => irPara(2)}>
                Voltar ao teste
              </button>
              {!conectado && (
                <button type="button" className="btn-link text-[13px]" onClick={() => router.push("/")}>
                  Fazer isso depois
                </button>
              )}
            </div>
          </div>
        ) : passo === 2 ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 [&>*]:min-w-0">
            <div>
              <div className="card p-5 mb-3">
                <Celular
                  nome={config.atendente}
                  negocio={config.negocio}
                  mensagens={mensagens}
                  valor={valor}
                  onValorChange={setValor}
                  onEnviar={enviarTeste}
                  enviando={enviando}
                  onAprovar={salvarBase}
                  onCorrigir={salvarBase}
                />
                <p className="text-center -mt-2">
                  <button type="button" className="btn-link text-[13px]" onClick={limparTeste}>
                    Limpar a conversa de teste
                  </button>
                </p>
              </div>

              <div className="card p-5 mb-3">
                <MaisDetalhes titulo={`Respostas aprovadas pela equipe${base?.length ? ` (${base.length})` : ""}`}>
                  {base === null ? (
                    <p className="text-muted text-sm">Carregando...</p>
                  ) : base.length === 0 ? (
                    <p className="text-muted text-sm">
                      Nenhuma resposta aprovada ainda. Use &quot;Aprovar&quot; ou &quot;Corrigir&quot; nas respostas do teste para o atendente guardar a resposta certa.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2.5 text-sm">
                      {base.map((p, i) => (
                        <li key={i} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                          <p className="font-semibold">{p.pergunta}</p>
                          <p className="text-muted">{p.resposta}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-[13px] font-semibold mt-5 mb-2">Sugestões da equipe</p>
                  {sugestoesCodigo === undefined ? (
                    <p className="text-muted text-sm mb-3.5">Carregando...</p>
                  ) : sugestoesCodigo ? (
                    <div className="card p-3.5 mb-3.5 flex items-center gap-2 flex-wrap">
                      <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[200px]">{`${location.origin}/f/${sugestoesCodigo}`}</code>
                      <CopyButton texto={() => `${location.origin}/f/${sugestoesCodigo}`} rotulo="Copiar link do formulário" />
                    </div>
                  ) : (
                    <button type="button" className="btn-ghost mb-3.5" onClick={criarLinkSugestoes} disabled={criandoLinkSugestoes}>
                      {criandoLinkSugestoes ? "Criando..." : "Receber respostas da equipe por formulário"}
                    </button>
                  )}

                  {sugestoes === null ? (
                    <p className="text-muted text-sm">Carregando...</p>
                  ) : sugestoes.length === 0 ? (
                    <p className="text-muted text-sm">Nenhuma sugestão recebida ainda. Compartilhe o link acima com a equipe para receber perguntas e respostas.</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5 text-sm">
                      {sugestoes.map((s) => (
                        <li key={s.id} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                          <p className="font-semibold">{s.pergunta}</p>
                          <p className="text-muted">{s.resposta}</p>
                          {s.categoria && <p className="text-muted text-[12.5px] mt-0.5">Categoria: {s.categoria}</p>}
                          <div className="flex gap-2 mt-2">
                            <button type="button" className="btn-ghost" onClick={() => tratarSugestao(s.id, "aprovar")} disabled={tratandoSugestao === s.id}>Aprovar</button>
                            <button type="button" className="btn-ghost" onClick={() => tratarSugestao(s.id, "descartar")} disabled={tratandoSugestao === s.id}>Descartar</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {avisoTeste && <div className="mt-3.5"><Aviso tom="danger" acao={avisoTeste.acao}>{avisoTeste.mensagem}</Aviso></div>}
                </MaisDetalhes>
              </div>
            </div>

            <aside className="lg:sticky lg:top-6 self-start">
              <div className="card p-5">
                <h2 className="font-bold text-[15px] mb-3">O que testar</h2>
                <div className="flex flex-col gap-2 items-start">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-left cursor-pointer border-0 hover:bg-accent-soft/70 transition-colors disabled:opacity-60"
                      onClick={() => enviarTeste(s)}
                      disabled={enviando}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-muted text-[12.5px] mt-3.5">
                  Não gostou de uma resposta? Clique em Corrigir e a resposta certa entra na base do atendente.
                </p>
              </div>
            </aside>

            {/* Terceiro item da grade: no desktop cai sozinho na linha de baixo da primeira coluna; no
                celular fica depois do cartão "O que testar", que é o que faz o teste andar. */}
            <div className="flex items-center justify-between gap-3 flex-wrap lg:col-start-1">
              <button type="button" className="btn-link text-[14px]" onClick={() => irPara(1)}>
                Voltar e ajustar
              </button>
              <button type="button" className="btn-primary !w-auto" onClick={() => irPara(3)}>
                Continuar para conectar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 [&>*]:min-w-0">
            <form onSubmit={aoEnviar}>
              <div className="card p-5 mb-3">
                <Row>
                  <Field label="Nome do atendente" htmlFor="atendenteNome">
                    <input id="atendenteNome" className="input" required placeholder="Bia" value={config.atendente} onChange={(e) => setCampo("atendente", e.target.value)} />
                  </Field>
                  <Field label="Nome da empresa" htmlFor="negocio">
                    <input id="negocio" className="input" required placeholder="Sorriso Pleno Odontologia" value={config.negocio} onChange={(e) => setCampo("negocio", e.target.value)} />
                  </Field>
                </Row>

                <Grupo titulo="O que ele deve fazer?">
                  {OBJETIVOS.map((o) => (
                    <CartaoEscolha
                      key={o}
                      grupo="objetivo"
                      valor={o}
                      titulo={rotuloObjetivo(o).titulo}
                      apoio={rotuloObjetivo(o).apoio}
                      selecionado={config.objetivo === o}
                      onEscolher={() => setCampo("objetivo", o)}
                    />
                  ))}
                </Grupo>
                {config.objetivo === "outro" && (
                  <Field label="Em uma linha, o que ele deve fazer?" htmlFor="objetivoTexto">
                    <input
                      id="objetivoTexto"
                      className="input"
                      required
                      placeholder="receber pedidos de orçamento e passar para a equipe"
                      value={config.objetivoTexto ?? ""}
                      onChange={(e) => setCampo("objetivoTexto", e.target.value)}
                    />
                  </Field>
                )}

                {/* `#conhecimento` é a âncora do atalho "Adicionar conhecimento" do Início (US-016): a
                    página é um Client Component e o passo 1 só existe depois da carga, então quem rola
                    até aqui é o efeito de `hash` abaixo, não o navegador. */}
                <span id="conhecimento" className="block scroll-mt-24" />
                <Field label="O que ele precisa saber?" htmlFor="baseConhecimento" hint="O atendente não inventa nada fora daqui.">
                  <textarea
                    id="baseConhecimento"
                    className="input min-h-[190px] resize-y"
                    required
                    maxLength={LIMITE_BASE}
                    placeholder={PLACEHOLDER_BASE}
                    value={config.baseConhecimento}
                    onChange={(e) => setCampo("baseConhecimento", e.target.value)}
                  />
                </Field>
                <p className="-mt-3 mb-4 text-right text-muted text-[12.5px]" aria-live="polite">
                  {config.baseConhecimento.length.toLocaleString("pt-BR")}/{LIMITE_BASE.toLocaleString("pt-BR")}
                </p>

                <p className="text-[13px] font-semibold mb-2">Adicionar arquivo (opcional)</p>
                <Dropzone id="arquivo-base" accept={ACEITA_ARQUIVO} tiposLabel="PDF, TXT" maxSizeMB={10} arquivo={null} onArquivo={importarArquivo} />
                {importando && <p className="text-muted text-[12.5px] mt-2">Lendo o arquivo...</p>}
                {avisoImportacao && <div className="mt-3"><Aviso tom={avisoImportacao.tom}>{avisoImportacao.texto}</Aviso></div>}

                <div className="mt-5">
                  <Grupo titulo="Tom de resposta" colunas={3}>
                    {TONS.map((t) => (
                      <CartaoEscolha
                        key={t}
                        grupo="tom"
                        valor={t}
                        titulo={rotuloTom(t).titulo}
                        apoio={rotuloTom(t).apoio}
                        selecionado={config.tom === t}
                        onEscolher={() => setCampo("tom", t)}
                      />
                    ))}
                  </Grupo>
                </div>
                {config.tom === "personalizado" && (
                  <Field label="Em uma linha, como ele deve falar?" htmlFor="tomTexto">
                    <input
                      id="tomTexto"
                      className="input"
                      required
                      placeholder="descontraído e simpático, próximo, mas sempre profissional"
                      value={config.tomTexto ?? ""}
                      onChange={(e) => setCampo("tomTexto", e.target.value)}
                    />
                  </Field>
                )}

                <MaisDetalhes titulo="Quando ele não souber responder">
                  <Field label="O que ele faz" htmlFor="naoSei">
                    <select id="naoSei" className="input" value={config.naoSei} onChange={(e) => setCampo("naoSei", e.target.value as Config["naoSei"])}>
                      <option value="humano">Avisar que um humano vai responder</option>
                      <option value="contato">Pedir e-mail e telefone</option>
                      <option value="site">Indicar o site</option>
                    </select>
                  </Field>
                  <Field label="Horário de atendimento humano" htmlFor="horario">
                    <input id="horario" className="input" placeholder="segunda a sexta, das 8h às 18h" value={config.horario} onChange={(e) => setCampo("horario", e.target.value)} />
                  </Field>
                </MaisDetalhes>
              </div>

              {erroConfig && <div className="mb-3"><ErrorBox mensagem={erroConfig.mensagem} acao={erroConfig.acao} /></div>}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button type="submit" className="btn-link text-[14px]" disabled={salvando || carregando} onClick={() => (destino.current = "inicio")}>
                  Salvar e sair
                </button>
                <button type="submit" className="btn-primary !w-auto" disabled={salvando || carregando} onClick={() => (destino.current = "teste")}>
                  {salvando ? "Salvando" : "Continuar para teste"}
                </button>
              </div>
            </form>

            <aside className="lg:sticky lg:top-6 self-start">
              <div className="card p-5">
                <h2 className="font-bold text-[15px] mb-3">Seu atendente, do seu jeito</h2>
                <Celular previa nome={config.atendente} negocio={config.negocio} mensagens={previa} />
              </div>
              <div className="mt-3">
                <Dica>Você pode testar diferentes mensagens no próximo passo para ajustar as respostas do seu atendente.</Dica>
              </div>
            </aside>
          </div>
        )}
      </main>
      {Dialogo}
    </>
  );
}
