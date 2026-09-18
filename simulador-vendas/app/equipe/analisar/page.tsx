"use client";
// Analisar uma conversa real (US-026, D11 do PRD): o gestor cola — ou envia — a transcrição de uma
// conversa que aconteceu com um cliente de verdade, escolhe de quem ela foi e recebe a mesma análise
// de sempre. É o único caminho do app para avaliar uma conversa que não foi um treino.
//
// A tela veio inteira do Início, sem cópia: a rota (`POST /api/analisar`), a ferramenta do assistente
// (`analisar_conversa`) e o formato do resultado são os mesmos de antes, e o Início agora manda para
// cá — inclusive o atalho `/?exemplo=1` da suíte, que chega redirecionado com os parâmetros.
//
// O resultado é o `Resultado` de `components/Resultado.tsx`, o mesmo que `/r/<id>` e a sala mostram:
// uma tela que aparece em dois lugares é um componente, nunca duas cópias.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, ErrorBox, Field, Loading, MaisDetalhes, Privacidade, Row, Stage, Topbar, data, lerErro, useScrollToResult, useStatus } from "@/components/ui";
import { Resultado } from "@/components/Resultado";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Analise, Cenario, Conversa, DadosAnalise } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

/** A lista de Equipe devolve muito mais do que isto (US-026); o seletor só precisa do nome. */
type PessoaOpcao = { id: string; nome: string };

/** A mesma conversa que a demonstração analisa (lib/demo.ts): título, cenário e resumo batem com ela. */
const EXEMPLO: DadosAnalise = {
  conversaColada: `Vendedor: Boa tarde, Beatriz! Obrigado por topar essa conversa. Antes de falarmos da renovação, queria entender: como o time tem usado a plataforma nos últimos meses?
Cliente: Boa tarde. Olha, para ser sincera, o uso caiu bastante. Ficou complicado no dia a dia e parte do time simplesmente parou de entrar no sistema.
Vendedor: Entendi. Quando você diz "complicado", é mais sobre não achar o que precisam ou sobre o fluxo de trabalho em si?
Cliente: Mais o fluxo. A gente configurou do jeito que veio, nunca ajustamos para a nossa rotina. E ninguém teve tempo de treinar o time direito.
Vendedor: Faz sentido, e isso é comum quando a implantação inicial não teve um acompanhamento próximo. Posso te mostrar rapidamente como dois clientes parecidos com vocês resolveram isso?
Cliente: Pode, mas já te aviso: preciso justificar esse gasto de novo para a diretoria, e hoje eu não tenho argumento forte para isso.
Vendedor: Justo. Então deixa eu propor o seguinte: incluo, sem custo adicional, quatro sessões de acompanhamento com seu time nas próximas seis semanas, focadas só no fluxo que vocês realmente usam. Se depois disso o uso não voltar, conversamos sobre outras opções. Funciona como primeiro passo?
Cliente: Isso ajuda bastante. Se o time reencontrar valor nisso, fica mais fácil eu defender a renovação lá dentro.
Vendedor: Perfeito. Vou te mandar hoje ainda um plano com as datas propostas e um resumo por escrito que você pode levar para a diretoria. Podemos marcar a primeira sessão para a semana que vem?
Cliente: Pode ser. Me manda as opções de horário que eu confirmo com o time.`,
  cenarioId: "renovacao",
  criterios: [...CRITERIOS_PADRAO],
};

const VAZIO: DadosAnalise = { conversaColada: "", vendedorId: undefined, cenarioId: undefined, criterios: [...CRITERIOS_PADRAO] };

const ETAPAS_CARREGANDO = ["Lendo a conversa...", "Comparando com os critérios de avaliação...", "Calculando a nota e os destaques..."];

/** O que a análise entrega, no lugar do resultado antes da primeira conversa. */
const ITENS_PREVIA = [
  "Nota geral da conversa",
  "Nota e evidência por critério",
  "Pontos fortes e o que melhorar",
  "Momentos-chave da ligação",
];

function IconeConversa() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h12v7H8l-4 4v-4H3z" />
      <path d="M11 12h10v7h-6l-3 3v-3h-1z" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Duas falas em balões com uma nota ao lado, no lugar de um glifo genérico. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 12h30v16H18l-6 6v-6H6z" />
      <path d="M12 18h18M12 23h11" />
      <path d="M28 34h30v16H40l-6 6v-6h-6z" />
      <path d="M34 40h18M34 45h11" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", no lugar do resultado antes da primeira análise. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <div className="text-accent mb-4">
        <IlustracaoConversa />
      </div>
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Ver a análise de exemplo</button>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; dados: DadosAnalise }
  | { fase: "pronto"; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string; dados: DadosAnalise };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [dados, setDados] = useState<DadosAnalise>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [pessoas, setPessoas] = useState<PessoaOpcao[]>([]);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [novaPessoaAberta, setNovaPessoaAberta] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [salvandoPessoa, setSalvandoPessoa] = useState(false);
  const [erroPessoa, setErroPessoa] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [avisoArquivo, setAvisoArquivo] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  // `?pessoa=<id>` chega de "Analisar uma conversa real" na linha de alguém, em /equipe. O parâmetro é
  // lido dentro da corrente da busca inicial e conferido contra a lista: um id que não existe mais
  // deixaria o seletor apontando para ninguém, e a análise sairia sem dono sem nenhum aviso.
  useEffect(() => {
    fetch("/api/equipe")
      .then((r) => r.json())
      .then((r) => {
        const itens = (r.itens || []) as PessoaOpcao[];
        setPessoas(itens);
        const escolhida = new URLSearchParams(window.location.search).get("pessoa");
        if (escolhida && itens.some((p) => p.id === escolhida)) setDados((d) => ({ ...d, vendedorId: escolhida }));
      })
      .catch(() => setPessoas([]));
    fetch("/api/cenarios").then((r) => r.json()).then((r) => setCenarios(r.itens)).catch(() => setCenarios([]));
    fetch("/api/analisar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/analisar", { method: "DELETE" }).then(() => fetch("/api/analisar")).then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  /** Sessão expirada em qualquer chamada: volta para a tela de entrar e retorna para cá depois. */
  function sessaoExpirou(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  const set = (campo: "conversaColada") => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  function setCriterio(i: number, valor: string) {
    setDados((d) => ({ ...d, criterios: (d.criterios || CRITERIOS_PADRAO).map((c, j) => (j === i ? valor : c)) }));
  }

  async function enviarArquivo(arquivo: File) {
    setEnviandoArquivo(true);
    setAvisoArquivo(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const r = await fetch("/api/analisar/arquivo", { method: "POST", body: corpo });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setAvisoArquivo({ tom: "danger", texto: info.mensagem });
        return;
      }
      const resposta = (await r.json()) as { texto: string; falas: number; aviso?: string };
      setDados((d) => ({ ...d, conversaColada: resposta.texto }));
      setAvisoArquivo(resposta.aviso ? { tom: "danger", texto: resposta.aviso } : { tom: "ok", texto: `${resposta.falas} falas reconhecidas. Confira o texto antes de analisar.` });
    } catch (e) {
      setAvisoArquivo({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setEnviandoArquivo(false);
    }
  }

  /** "Cadastrar pessoa" dentro do seletor: a mesma rota da tela de Equipe, sem sair daqui. */
  async function salvarPessoa() {
    if (!novoNome.trim()) return;
    setSalvandoPessoa(true);
    setErroPessoa(null);
    try {
      const r = await fetch("/api/equipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novoNome.trim(), email: novoEmail.trim() || undefined }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setErroPessoa(info.mensagem);
        return;
      }
      const { pessoa } = (await r.json()) as { pessoa: PessoaOpcao };
      setPessoas((v) => [...v.filter((p) => p.id !== pessoa.id), pessoa].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setDados((d) => ({ ...d, vendedorId: pessoa.id }));
      setNovaPessoaAberta(false);
      setNovoNome("");
      setNovoEmail("");
    } catch (e) {
      setErroPessoa((await lerErro(e)).mensagem);
    } finally {
      setSalvandoPessoa(false);
    }
  }

  async function gerar(d: DadosAnalise) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, dados: d });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", conversa: resposta.conversa, analise: resposta.analise, meta: resposta.meta, id: resposta.id, titulo: resposta.titulo, dados: d });
      fetch("/api/analisar").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, dados: d });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados);
  }

  /** "Ver a análise de exemplo" preenche o campo com a conversa que a demonstração analisa e já envia. */
  function verExemplo() {
    setDados(EXEMPLO);
    setAvisoArquivo(null);
    gerar(EXEMPLO);
  }

  // Atalho para demonstrações: ?exemplo=1 preenche e envia o formulário. É para cá que o Início manda
  // o /?exemplo=1 da suíte (o botão "Testar com um exemplo" de /setup e a captura do catálogo).
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const criterios = dados.criterios || CRITERIOS_PADRAO;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: a conversa e a análise exibidas são um exemplo." usuario={status?.usuario} />

      <div className="max-w-[1400px] mx-auto px-8 pt-7 max-md:px-4 max-md:pt-5">
        <Link href="/equipe" className="btn-link text-[13px]">← Equipe</Link>
        <h1 className="titulo-painel mt-1.5 mb-1.5">Analisar uma conversa real</h1>
        <p className="apoio">Uma conversa que aconteceu com um cliente de verdade, avaliada pelos mesmos critérios do treino.</p>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeConversa />} titulo="A conversa">
              <Field label="Cole a conversa" htmlFor="conversaColada" hint='Uma fala por linha, começando com "Vendedor:" ou "Cliente:".'>
                <textarea
                  id="conversaColada"
                  className="input min-h-28 resize-y font-mono text-[13px]"
                  required
                  placeholder={"Vendedor: Boa tarde! Como posso ajudar hoje?\nCliente: Oi, vi a proposta que vocês mandaram...\nVendedor: ..."}
                  value={dados.conversaColada}
                  onChange={set("conversaColada")}
                />
              </Field>

              <div className="flex items-center gap-2.5 flex-wrap mb-4">
                <label className="btn-ghost cursor-pointer" aria-disabled={enviandoArquivo}>
                  {enviandoArquivo ? "Lendo..." : "Enviar arquivo"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt,.vtt,.srt"
                    disabled={enviandoArquivo}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = "";
                      if (arquivo) enviarArquivo(arquivo);
                    }}
                  />
                </label>
                <span className="text-[12.5px] text-muted">Transcrição em .txt, .vtt ou .srt</span>
              </div>
              {avisoArquivo && <div className="mb-4"><Aviso tom={avisoArquivo.tom}>{avisoArquivo.texto}</Aviso></div>}

              <Row>
                <Field label="De quem foi a conversa" htmlFor="pessoa" hint="A análise entra no histórico dela, junto com os treinos.">
                  <select
                    id="pessoa"
                    className="input"
                    value={novaPessoaAberta ? "__nova__" : dados.vendedorId || ""}
                    onChange={(e) => {
                      if (e.target.value === "__nova__") { setNovaPessoaAberta(true); return; }
                      setNovaPessoaAberta(false);
                      setDados((d) => ({ ...d, vendedorId: e.target.value || undefined }));
                    }}
                  >
                    <option value="">Sem pessoa escolhida</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    <option value="__nova__">Cadastrar pessoa</option>
                  </select>
                </Field>
                <Field label="Cenário" htmlFor="cenario">
                  <select id="cenario" className="input" value={dados.cenarioId || ""} onChange={(e) => setDados((d) => ({ ...d, cenarioId: e.target.value || undefined }))}>
                    <option value="">Sem cenário escolhido</option>
                    {cenarios.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </select>
                </Field>
              </Row>

              {novaPessoaAberta && (
                <div className="border-l-2 border-accent-soft pl-3.5 mb-1">
                  <Row>
                    <Field label="Nome" htmlFor="novoNome"><input id="novoNome" className="input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da pessoa" /></Field>
                    <Field label="E-mail" htmlFor="novoEmail" hint="Recebe a análise quando você enviar."><input id="novoEmail" type="email" className="input" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="nome@empresa.com" /></Field>
                  </Row>
                  {erroPessoa && <div className="mb-3"><Aviso tom="danger">{erroPessoa}</Aviso></div>}
                  <div className="flex gap-2.5 mb-1">
                    <button type="button" className="btn-primary !w-auto" disabled={!novoNome.trim() || salvandoPessoa} onClick={salvarPessoa}>{salvandoPessoa ? "Salvando" : "Salvar pessoa"}</button>
                    <button type="button" className="btn-ghost" onClick={() => { setNovaPessoaAberta(false); setErroPessoa(null); }}>Cancelar</button>
                  </div>
                </div>
              )}

              <div className="[&>details]:mb-0">
                <MaisDetalhes titulo="Critérios de avaliação">
                  <p className="text-[12.5px] text-muted mb-3">A ordem aqui é a mesma da tabela de resultado.</p>
                  {criterios.map((c, i) => (
                    <Field key={i} label={`Critério ${i + 1}`} htmlFor={`criterio-${i}`}>
                      <input id={`criterio-${i}`} className="input" value={c} onChange={(e) => setCriterio(i, e.target.value)} />
                    </Field>
                  ))}
                </MaisDetalhes>
              </div>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar a conversa"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={verExemplo}>Ver a análise de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A conversa e a análise ficam salvas neste app por 90 dias, até você apagar." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={ITENS_PREVIA} onExemplo={verExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => gerar(estado.dados)} />}
          {estado.fase === "pronto" && <Resultado conversa={estado.conversa} analise={estado.analise} meta={estado.meta} id={estado.id} titulo={estado.titulo} acoesDoGestor />}
        </Stage>
      </main>
    </>
  );
}
