"use client";
// Tela do Assistente: criar o atendente em três passos (Configurar → Testar → Conectar). O passo atual
// mora na barra de endereço (`?passo=1|2|3`), então recarregar a página ou voltar no navegador não perde
// o lugar. O conteúdo fica aqui, e não em `app/assistente/page.tsx`, porque `scripts/verificar-jargao.mjs`
// varre `components/*.tsx` mas não as telas em `app/<rota>/page.tsx` (ver CLAUDE.md).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Aviso,
  Dica,
  Dropzone,
  Empty,
  ErrorBox,
  Field,
  MaisDetalhes,
  Passos,
  Row,
  Topbar,
  lerErro,
  useStatus,
  type ErroLido,
  type PassoIndicador,
} from "./ui";
import { Celular, saudacaoPadrao, type BolhaChat } from "./Celular";
import { SUGESTOES, configExemplo } from "@/lib/demo";
import { OBJETIVOS, TONS, rotuloObjetivo, rotuloTom } from "@/lib/rotulos";
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

function IconeEmMontagem() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="15" r="5" />
      <circle cx="17" cy="32" r="5" />
      <circle cx="17" cy="49" r="5" />
      <path d="M17 20v7M17 37v7" />
      <path d="M28 15h24M28 32h18M28 49h21" />
    </svg>
  );
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

  const [passo, setPasso] = useState(1);
  const [config, setConfig] = useState<Config>(CONFIG_VAZIA);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroConfig, setErroConfig] = useState<ErroLido | null>(null);
  const [importando, setImportando] = useState(false);
  const [avisoImportacao, setAvisoImportacao] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);
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

  async function salvar(valores: Config): Promise<boolean> {
    setSalvando(true);
    setErroConfig(null);
    try {
      const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valores) });
      if (!r.ok) {
        const info = await lerErro(r);
        // 401 com codigo "sem_sessao" significa sessão expirada: a tela de entrar resolve, o ErrorBox não.
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return false;
        }
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
        if (await salvar(configExemplo)) irPara(2);
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

        {passo !== 1 ? (
          <Empty
            ilustracao={<IconeEmMontagem />}
            titulo="Este passo ainda está sendo montado"
            descricao="Enquanto ele não fica pronto, o atendente continua sendo testado e conectado pelo início."
            acao="Ir para o início"
            onAcao={() => router.push("/")}
          />
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
    </>
  );
}
