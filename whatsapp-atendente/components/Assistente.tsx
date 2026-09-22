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
import { usePersonaBrief } from "./PersonaBrief";
import { CartaoFerramenta, EstadoFerramenta, Interruptor } from "./CartaoFerramenta";
import { ConexaoWhatsApp } from "./ConexaoWhatsApp";
import { formatarTelefone } from "@/lib/telefone";
import type { RespostaConexao } from "@/app/api/whatsapp/conexao/route";
import type { ParBase } from "@/lib/base";
import { ehModeloDeBase, modeloDeBase } from "@/lib/base-modelo";
import { PERGUNTAS_EXEMPLO, configExemplo } from "@/lib/demo";
import { ACAO_CONECTAR_AGENDA, OBJETIVOS, TONS, rotuloObjetivo, rotuloTom } from "@/lib/rotulos";
import { FRASE_FALHA_PADRAO } from "@/lib/transferencia";
import type { Sugestao } from "@/lib/sugestoes";
import { FERRAMENTAS_PADRAO, LIMITE_SAUDACAO, MIDIA_PADRAO, type Config, type ConfigFerramentas, type ConfigMidia, type PersonaGerada } from "@/lib/types";

const PASSOS: PassoIndicador[] = [
  { titulo: "Configurar", apoio: "Defina quem é o seu agente" },
  { titulo: "Testar", apoio: "Veja como ele responde" },
  { titulo: "Conectar", apoio: "Conecte seu WhatsApp" },
];

const CONFIG_VAZIA: Config = { negocio: "", atendente: "", objetivo: "atendimento", tom: "profissional", horario: "", baseConhecimento: "", naoSei: "humano", midia: { ...MIDIA_PADRAO }, ferramentas: { ...FERRAMENTAS_PADRAO } };

/** Primeira vez no passo 1: os campos do negócio começam vazios e a base já vem com o modelo do objetivo
 * padrão (lib/base-modelo.ts), para a pessoa trocar os marcadores em vez de encarar um campo em branco.
 * `GET /api/config` devolve a empresa de exemplo quando nada foi salvo (é ela que enche o resto do app na
 * demonstração), então quem decide entre uma coisa e outra é o campo `salvo` da mesma resposta. */
const CONFIG_INICIAL: Config = { ...CONFIG_VAZIA, baseConhecimento: modeloDeBase("atendimento") };

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
 * As cinco partes do passo 1, na ordem em que aparecem. A lista é a fonte única: os cartões saem daqui e
 * o índice da coluna da direita também, então uma seção nova nunca fica de fora do índice. O id de "O que
 * ele sabe" é `conhecimento` porque `/assistente#conhecimento` (o atalho "Adicionar conhecimento" do
 * Início) aponta para ele desde a US-016.
 */
const SECOES = [
  { id: "quem-e", titulo: "Quem é", apoio: "O nome que o cliente vê e a frase com que o atendente começa a conversa." },
  { id: "o-que-faz", titulo: "O que ele faz", apoio: "O objetivo de cada conversa: é o que orienta o atendente quando o cliente não é direto." },
  { id: "conhecimento", titulo: "O que ele sabe", apoio: "O atendente só responde com o que estiver aqui. Nada fora disso é inventado." },
  { id: "como-fala", titulo: "Como ele fala", apoio: "O jeito das respostas: mais formal, mais próximo, ou do jeito que você escrever." },
  { id: "ferramentas", titulo: "Ferramentas", apoio: "O que o atendente consegue fazer além de escrever." },
];

/** Um bloco do passo 1: cartão com título, frase de apoio e o id que o índice usa como âncora. */
function Secao({ id, titulo, apoio, children }: { id: string; titulo: string; apoio: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={titulo} className="card p-5 mb-3 scroll-mt-24">
      <h2 className="font-bold text-[15px]">{titulo}</h2>
      <p className="text-muted text-[12.5px] mt-1 mb-4">{apoio}</p>
      {children}
    </section>
  );
}

/**
 * O que seria salvo desta configuração, em texto. É isso que a barra "Alterações não salvas" compara com
 * o que está no banco — e por isso campo ausente e campo em branco dão no mesmo: escrever e apagar de
 * novo não é alteração, e um espaço a mais no fim também não (a rota corta os dois antes de gravar).
 */
function assinaturaConfig(c: Config): string {
  return JSON.stringify([
    c.negocio.trim(),
    c.atendente.trim(),
    c.objetivo,
    c.objetivo === "outro" ? (c.objetivoTexto ?? "").trim() : "",
    c.tom,
    c.tom === "personalizado" ? (c.tomTexto ?? "").trim() : "",
    (c.saudacao ?? "").trim(),
    (c.perguntasSugeridas ?? []).map((p) => p.trim()).filter(Boolean),
    c.horario.trim(),
    c.baseConhecimento.trim(),
    c.naoSei,
    (c.fraseFalha ?? "").trim(),
    c.midia,
    c.ferramentas,
  ]);
}

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
  // Já existe um atendente configurado? É o que decide se o cartão de descrever o negócio nasce aberto
  // (primeira vez) ou recolhido (quem só veio ajustar não precisa recomeçar do zero).
  const [configSalva, setConfigSalva] = useState(false);
  // A última configuração que veio do banco: é com ela que o formulário é comparado para a barra
  // "Alterações não salvas" aparecer, e é para ela que "Descartar" volta.
  const [configDoBanco, setConfigDoBanco] = useState<Config | null>(null);
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
  // "Salvar e sair" e "Salvar e testar o atendente" submetem o mesmo formulário (para o navegador cobrar os
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

  /** Liga ou desliga um tipo de anexo; os outros dois continuam como estavam. */
  function setMidia(tipo: keyof ConfigMidia, ligado: boolean) {
    setConfig((c) => ({ ...c, midia: { ...(c.midia ?? MIDIA_PADRAO), [tipo]: ligado } }));
  }

  /** Liga ou desliga uma ferramenta do atendente; as outras continuam como estavam. */
  function setFerramenta(qual: keyof ConfigFerramentas, ligado: boolean) {
    setConfig((c) => ({ ...c, ferramentas: { ...(c.ferramentas ?? FERRAMENTAS_PADRAO), [qual]: ligado } }));
  }

  /** Trocar o objetivo troca o modelo da base — mas só enquanto ele estiver intocado. Qualquer edição da
   * pessoa (ou um texto que ela mesma colou) congela o campo onde está: o modelo nunca apaga trabalho. */
  function escolherObjetivo(objetivo: Config["objetivo"]) {
    setConfig((c) => ({
      ...c,
      objetivo,
      baseConhecimento: ehModeloDeBase(c.baseConhecimento) ? modeloDeBase(objetivo) : c.baseConhecimento,
    }));
  }

  /**
   * "Aplicar" do atendente gerado: preenche o formulário e NÃO salva. A saudação e as perguntas de teste
   * entram junto (são campos da configuração desde a US-008), e quem grava tudo continua sendo o
   * "Salvar e testar o atendente".
   */
  function aplicarPersona(persona: PersonaGerada) {
    setConfig((c) => ({
      ...c,
      atendente: persona.atendente,
      negocio: persona.negocio,
      objetivo: persona.objetivo,
      objetivoTexto: persona.objetivo === "outro" ? persona.objetivoTexto ?? "" : "",
      tom: persona.tom,
      tomTexto: persona.tom === "personalizado" ? persona.tomTexto ?? "" : "",
      saudacao: persona.saudacao,
      perguntasSugeridas: persona.perguntasSugeridas,
      baseConhecimento: persona.baseConhecimento,
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // O formulário difere do que está gravado? É o que acende a barra do rodapé e o aviso de sair da
  // página. Enquanto a configuração não chegou do banco não há com o que comparar.
  const alterado = configDoBanco !== null && assinaturaConfig(configDoBanco) !== assinaturaConfig(config);

  // O que já está conectado, lido de `GET /api/status` (a mesma fonte do chip do cabeçalho): é isso que
  // separa "Conectada" de "Falta conectar" nos cartões da agenda e dos sistemas da empresa. Enquanto o
  // status não chegou, os dois aparecem como não conectados — nunca como conectados por engano.
  const agendaConectada = Boolean(status?.integrations?.["mcp-agenda"]);
  const sistemasConectados = Boolean(status?.integrations?.["mcp-empresa"]);

  const { Cartao: CartaoPersona, Painel: PainelPersona } = usePersonaBrief({
    baseAtual: config.baseConhecimento,
    temConfigSalva: configSalva,
    onAplicar: aplicarPersona,
  });

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
      const gravada = (await r.json()) as Config;
      setConfig(gravada);
      setConfigDoBanco(gravada);
      setConfigSalva(true);
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

  /** "Descartar" da barra de alterações: o formulário volta ao que está gravado. Não dá para desfazer,
   * então pergunta antes. */
  async function descartar() {
    if (!configDoBanco) return;
    const ok = await confirmar("Descartar as alterações? O formulário volta ao que está salvo.", { confirmarRotulo: "Descartar" });
    if (!ok) return;
    setConfig(configDoBanco);
    setErroConfig(null);
  }

  /** Documentos são persistidos separadamente da configuração do formulário. */
  const [documentos, setDocumentos] = useState<{ id: string; nome: string; trechos: number; modo: string }[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(null);
  async function carregarDocumentos() {
    const r = await fetch("/api/base/arquivo");
    if (!r.ok) throw new Error("Não foi possível carregar os documentos.");
    setDocumentos((await r.json()).documentos);
  }
  useEffect(() => {
    let ativo = true;
    fetch("/api/base/arquivo").then(async (r) => {
      if (!r.ok) throw new Error("Falha na leitura");
      const dados = await r.json();
      if (ativo) setDocumentos(dados.documentos);
    }).catch(() => {
      if (ativo) setAvisoImportacao({ tom: "danger", texto: "Não foi possível carregar os documentos. Atualize a página para tentar novamente." });
    });
    return () => { ativo = false; };
  }, []);
  async function removerDocumento(id: string) {
    setRemovendo(id);
    try {
      const r = await fetch(`/api/base/arquivo?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Não foi possível remover o documento.");
      await carregarDocumentos();
      setAvisoImportacao({ tom: "ok", texto: "Documento removido da busca. Respostas anteriores permanecem no histórico." });
    } catch (e) {
      setAvisoImportacao({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally { setRemovendo(null); }
  }
  async function importarArquivo(arquivo: File | null) {
    if (!arquivo || importando) return;
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
      setAvisoImportacao({ tom: "ok", texto: `${arquivo.name} salvo em ${d.documento.trechos} trechos. Busca ${d.documento.modo}.` });
      await carregarDocumentos();
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
          await enviarTeste(PERGUNTAS_EXEMPLO[0]);
        }
        return;
      }
      try {
        const salva = (await fetch("/api/config").then((r) => r.json())) as Config & { salvo?: boolean };
        setConfigSalva(Boolean(salva.salvo));
        const inicial = salva.salvo ? salva : CONFIG_INICIAL;
        setConfig(inicial);
        setConfigDoBanco(inicial);
      } catch {
        // Sem resposta, o formulário abre com o modelo e a pessoa preenche por cima.
        setConfig(CONFIG_INICIAL);
        setConfigDoBanco(CONFIG_INICIAL);
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

  // A base aprovada e as sugestões da equipe moram na seção "O que ele sabe" (passo 1) e a contagem
  // delas está no título: são buscadas na primeira vez que a pessoa está num passo que as mostra, e não
  // na abertura da tela (quem está no passo 3, conectando o número, nunca as vê).
  useEffect(() => {
    if (passo === 3 || carregouBase.current) return;
    carregouBase.current = true;
    fetch("/api/base").then((r) => r.json()).then((r) => setBase(r.itens)).catch(() => setBase([]));
    fetch("/api/sugestoes")
      .then((r) => r.json())
      .then((d) => { setSugestoesCodigo(d.codigo ?? null); setSugestoes(d.itens || []); })
      .catch(() => { setSugestoesCodigo(null); setSugestoes([]); });
  }, [passo]);

  // Sair da página com o formulário diferente do que está gravado pede confirmação do navegador. O
  // efeito só existe enquanto há o que perder: sem alteração, nenhum ouvinte fica pendurado.
  useEffect(() => {
    if (!alterado) return;
    function aoSair(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [alterado]);

  const conectado = conexao?.estado === "conectado";
  /** A barra do rodapé é do passo 1: é lá que o formulário existe. */
  const barraAlteracoes = passo === 1 && alterado;

  // As perguntas do passo 2 e a prévia do passo 1 saem da configuração; sem nenhuma escrita, valem as
  // da empresa de exemplo (a US-010 troca esta reserva pelos cenários de cada objetivo).
  const perguntasTeste = config.perguntasSugeridas?.length ? config.perguntasSugeridas : PERGUNTAS_EXEMPLO;
  const saudacaoAtual = config.saudacao?.trim() || saudacaoPadrao(config.atendente, config.negocio);

  const previa: BolhaChat[] = [
    { papel: "atendente", texto: saudacaoAtual },
    ...(perguntasTeste[0] ? [{ papel: "cliente" as const, texto: perguntasTeste[0] }] : []),
  ];

  return (
    <>
      <Topbar marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" status={status} erro={erro} usuario={status?.usuario} />

      {/* Com a barra de alterações no rodapé, a página ganha espaço embaixo para o último botão do
          formulário não ficar escondido atrás dela. O espaçamento é escolhido de uma vez (e não somado
          a um `pb` fixo): duas classes da mesma propriedade e da mesma variante brigariam no CSS. */}
      <main className={`max-w-[1400px] mx-auto px-8 pt-7 max-md:px-4 max-md:pt-5 ${barraAlteracoes ? "pb-28 max-md:pb-36" : "pb-12 max-md:pb-10"}`}>
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
                {/* Quem acabou de conectar quer ver o atendimento acontecendo, não um painel de números:
                    o caminho primário é a lista de conversas, e o Início fica como segunda opção. */}
                <div className="flex items-center gap-3 flex-wrap max-md:flex-col max-md:items-stretch">
                  <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={() => router.push("/conversas")}>
                    Ver as conversas
                  </button>
                  <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={() => router.push("/")}>
                    Ir para o Início
                  </button>
                </div>
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
                  saudacao={config.saudacao}
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
            </div>

            <aside className="lg:sticky lg:top-6 self-start">
              <div className="card p-5">
                <h2 className="font-bold text-[15px] mb-3">O que testar</h2>
                <div className="flex flex-col gap-2 items-start">
                  {perguntasTeste.map((s) => (
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
                Colocar no WhatsApp
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 [&>*]:min-w-0">
            <form id="form-atendente" onSubmit={aoEnviar}>
              {CartaoPersona}

              <Secao {...SECOES[0]}>
                <Row>
                  <Field label="Nome do atendente" htmlFor="atendenteNome">
                    <input id="atendenteNome" className="input" required placeholder="Bia" value={config.atendente} onChange={(e) => setCampo("atendente", e.target.value)} />
                  </Field>
                  <Field label="Nome da empresa" htmlFor="negocio">
                    <input id="negocio" className="input" required placeholder="Sorriso Pleno Odontologia" value={config.negocio} onChange={(e) => setCampo("negocio", e.target.value)} />
                  </Field>
                </Row>

                <Field
                  label="Como ele se apresenta"
                  htmlFor="saudacao"
                  hint="É a primeira mensagem de cada conversa nova. Em branco, ele se apresenta pelo nome e pelo da empresa."
                >
                  <textarea
                    id="saudacao"
                    className="input min-h-[74px] resize-y"
                    maxLength={LIMITE_SAUDACAO}
                    placeholder={saudacaoPadrao(config.atendente, config.negocio)}
                    value={config.saudacao ?? ""}
                    onChange={(e) => setCampo("saudacao", e.target.value)}
                  />
                </Field>
                <p className="-mt-3 text-right text-muted text-[12.5px]" aria-live="polite">
                  {(config.saudacao ?? "").length}/{LIMITE_SAUDACAO}
                </p>
              </Secao>

              <Secao {...SECOES[1]}>
                <Grupo titulo="Escolha o objetivo principal">
                  {OBJETIVOS.map((o) => (
                    <CartaoEscolha
                      key={o}
                      grupo="objetivo"
                      valor={o}
                      titulo={rotuloObjetivo(o).titulo}
                      apoio={rotuloObjetivo(o).apoio}
                      selecionado={config.objetivo === o}
                      onEscolher={() => escolherObjetivo(o)}
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
              </Secao>

              {/* O id desta seção é a âncora de `/assistente#conhecimento` (US-016): a página é um Client
                  Component e o campo só existe depois da carga, então quem rola até aqui é o efeito de
                  `hash` lá em cima, não o navegador. */}
              <Secao {...SECOES[2]}>
                <Field
                  label="O que ele precisa saber?"
                  htmlFor="baseConhecimento"
                  hint="O atendente não inventa nada fora daqui. Troque o que está entre colchetes pelos dados da sua empresa e apague o que não usar."
                >
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
                <p className="text-muted text-[12.5px] mb-2">Os documentos são salvos imediatamente e consultados por trechos relevantes, sem ocupar o campo acima. Até 30 arquivos de 200 mil caracteres. Com IA conectada, a busca semântica usa créditos do OpenRouter; se indisponível, usamos palavras-chave. Reenvie o mesmo arquivo para tentar indexá-lo novamente.</p>
                {documentos.map((d) => <div key={d.id} className="flex items-center justify-between gap-3 text-[13px] mb-2">
                  <span>{d.nome} · {d.trechos} trechos · busca {d.modo}</span>
                  <button type="button" className="underline" disabled={removendo !== null || importando} onClick={() => removerDocumento(d.id)} aria-label={`Remover ${d.nome}`}>{removendo === d.id ? "Removendo…" : "Remover"}</button>
                </div>)}
                <Dropzone id="arquivo-base" accept={ACEITA_ARQUIVO} tiposLabel="PDF, TXT" maxSizeMB={10} arquivo={null} onArquivo={importarArquivo} />
                {importando && <p className="text-muted text-[12.5px] mt-2">Lendo e indexando o arquivo...</p>}
                {avisoImportacao && <div className="mt-3"><Aviso tom={avisoImportacao.tom}>{avisoImportacao.texto}</Aviso></div>}

                <div className="mt-5">
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
              </Secao>

              <Secao {...SECOES[3]}>
                <Grupo titulo="Escolha o tom das respostas" colunas={3}>
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
              </Secao>

              <Secao {...SECOES[4]}>
                <div className="flex flex-col gap-2.5">
                  <CartaoFerramenta
                    icone="pessoa"
                    titulo="Pedir ajuda de uma pessoa"
                    apoio="Quando não souber responder, ele encerra com educação e chama alguém da equipe."
                    ligado
                    estado={<EstadoFerramenta tom="fixo" texto="Sempre ligado · transfere com o motivo" />}
                  />
                  <CartaoFerramenta
                    icone="contato"
                    titulo="Coletar contato"
                    apoio="Pede nome e, se for transferir, e-mail ou telefone."
                    id="ferramenta-contato"
                    ligado={config.ferramentas.coletarContato}
                    onMudar={(v) => setFerramenta("coletarContato", v)}
                    estado={config.ferramentas.coletarContato ? <EstadoFerramenta tom="ok" texto="Guardado em O que o atendente lembra" /> : undefined}
                  />
                  <CartaoFerramenta
                    icone="agenda"
                    titulo="Consultar a agenda"
                    apoio="Vê os horários livres e marca o compromisso na agenda conectada."
                    id="ferramenta-agenda"
                    ligado={config.ferramentas.agenda}
                    onMudar={(v) => setFerramenta("agenda", v)}
                    estado={
                      config.ferramentas.agenda ? (
                        agendaConectada ? (
                          <EstadoFerramenta tom="ok" texto="Conectada" />
                        ) : (
                          <EstadoFerramenta
                            tom="falta"
                            texto="Falta conectar. Sem a agenda, ele coleta as preferências e encaminha à equipe, sem confirmar reserva."
                            link={ACAO_CONECTAR_AGENDA}
                          />
                        )
                      ) : undefined
                    }
                  />
                  <CartaoFerramenta
                    icone="sistemas"
                    titulo="Consultar sistemas da empresa"
                    apoio="Busca pedido, estoque ou cadastro nos sistemas que a empresa já usa."
                    id="ferramenta-sistemas"
                    ligado={config.ferramentas.sistemas}
                    onMudar={(v) => setFerramenta("sistemas", v)}
                    estado={
                      config.ferramentas.sistemas ? (
                        sistemasConectados ? (
                          <EstadoFerramenta tom="ok" texto="Conectado" />
                        ) : (
                          // Sem link para Configurações de propósito: os sistemas da empresa são ligados
                          // por variável de ambiente, não por um cartão da tela (ver CLAUDE.md), e um
                          // link para uma página sem esse cartão mandaria a pessoa procurar o que não há.
                          <EstadoFerramenta tom="falta" texto="Falta conectar. Quem liga um sistema da empresa é a equipe técnica do servidor." />
                        )
                      ) : undefined
                    }
                  />
                  <CartaoFerramenta
                    icone="midia"
                    titulo="Áudios, fotos e arquivos"
                    apoio="Escolha o que ele tenta entender antes de responder. Ouvir áudios gasta créditos por minuto."
                    ligado={config.midia.audio || config.midia.imagem || config.midia.documento}
                  >
                    <div className="flex flex-col gap-2 mt-1">
                      <Interruptor
                        id="midia-audio"
                        titulo="Ouvir áudios"
                        apoio="Transcreve o que o cliente falou e responde ao conteúdo."
                        ligado={config.midia.audio}
                        onMudar={(v) => setMidia("audio", v)}
                      />
                      <Interruptor
                        id="midia-imagem"
                        titulo="Olhar fotos"
                        apoio="Descreve a foto (produto, documento, texto legível) antes de responder."
                        ligado={config.midia.imagem}
                        onMudar={(v) => setMidia("imagem", v)}
                      />
                      <Interruptor
                        id="midia-documento"
                        titulo="Ler arquivos"
                        apoio="Lê PDFs e arquivos de texto que o cliente mandar."
                        ligado={config.midia.documento}
                        onMudar={(v) => setMidia("documento", v)}
                      />
                    </div>
                    <EstadoFerramenta tom="fixo" texto="O que estiver desligado continua aparecendo na conversa para a equipe." />
                  </CartaoFerramenta>
                </div>
              </Secao>

              <div className="card p-5 mb-3">
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
                  <Field
                    label="O que dizer quando o atendente ficar fora do ar"
                    htmlFor="fraseFalha"
                    hint={`Em branco, o cliente recebe: "${FRASE_FALHA_PADRAO}"`}
                  >
                    <input
                      id="fraseFalha"
                      className="input"
                      maxLength={300}
                      placeholder={FRASE_FALHA_PADRAO}
                      value={config.fraseFalha ?? ""}
                      onChange={(e) => setCampo("fraseFalha", e.target.value)}
                    />
                  </Field>
                </MaisDetalhes>
              </div>

              {erroConfig && <div className="mb-3"><ErrorBox mensagem={erroConfig.mensagem} acao={erroConfig.acao} /></div>}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button type="submit" className="btn-link text-[14px]" disabled={salvando || carregando} onClick={() => (destino.current = "inicio")}>
                  Salvar e sair
                </button>
                <button type="submit" className="btn-primary !w-auto" disabled={salvando || carregando} onClick={() => (destino.current = "teste")}>
                  {salvando ? "Salvando" : "Salvar e testar o atendente"}
                </button>
              </div>
            </form>

            <aside className="lg:sticky lg:top-6 self-start">
              {/* O índice só existe no desktop: no celular esta coluna vem DEPOIS do formulário, e um
                  índice no fim da página não leva ninguém a lugar nenhum. */}
              <nav aria-label="Seções desta página" className="card p-4 mb-3 max-lg:hidden">
                <p className="text-[13px] font-semibold mb-2">Nesta página</p>
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {SECOES.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="text-muted hover:text-accent-ink hover:underline">
                        {s.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              {PainelPersona}
              <div className="card p-5">
                <h2 className="font-bold text-[15px] mb-3">Seu atendente, do seu jeito</h2>
                <Celular previa nome={config.atendente} negocio={config.negocio} saudacao={config.saudacao} mensagens={previa} />
              </div>
              <div className="mt-3">
                <Dica>Você pode testar diferentes mensagens no próximo passo para ajustar as respostas do seu atendente.</Dica>
              </div>
            </aside>
          </div>
        )}
      </main>

      {barraAlteracoes && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface shadow-[0_-6px_20px_rgba(20,20,50,0.12)]">
          <div className="max-w-[1400px] mx-auto px-8 py-3 flex items-center justify-between gap-3 max-md:px-4 max-md:flex-col max-md:items-stretch max-md:gap-2">
            <p className="text-[13.5px] font-semibold max-md:text-center">Alterações não salvas</p>
            <div className="flex items-center gap-3 max-md:justify-between">
              <button type="button" className="btn-link text-[14px]" onClick={descartar} disabled={salvando}>
                Descartar
              </button>
              {/* O botão vive fora do <form>, mas continua sendo o submit dele (atributo `form`): é o que
                  mantém a validação do navegador nos campos obrigatórios. */}
              <button
                type="submit"
                form="form-atendente"
                className="btn-primary !w-auto max-md:flex-1"
                disabled={salvando}
                onClick={() => (destino.current = "teste")}
              >
                {salvando ? "Salvando" : "Salvar e testar o atendente"}
              </button>
            </div>
          </div>
        </div>
      )}
      {Dialogo}
    </>
  );
}
