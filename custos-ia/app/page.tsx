"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Aviso,
  Chip,
  DataTable,
  Destaque,
  Entregar,
  ErrorBox,
  Field,
  Hero,
  Loading,
  MaisDetalhes,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  Section,
  SeloIA,
  Stage,
  Topbar,
  data,
  lerErro,
  numero,
  useScrollToResult,
  useStatus,
  type PassoIndicador,
} from "@/components/ui";
import { GraficoGastoPlanejado } from "@/components/GraficoGastoPlanejado";
import { OrcamentoPlanejado } from "@/components/OrcamentoPlanejado";
import { LancarManualmente } from "@/components/LancarManualmente";
import { EnviarNotas, PreviaNotas, type ResultadoUpload } from "@/components/EnviarNotas";
import { ResumoImportacao } from "@/components/ImportarEmail";
import { ReceberFechamento } from "@/components/ReceberFechamento";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { NOME_PROVEDOR, PROVEDORES_EMAIL, type Alerta, type Fatura, type Leitura, type Periodo, type ProvedorEmail, type ResultadoImportacao } from "@/lib/types";

const ETAPAS_CARREGANDO = ["Lendo as faturas do período...", "Comparando com o orçamento planejado...", "Montando o resultado..."];
const ETAPAS_LENDO_NOTAS = ["Abrindo os arquivos...", "Reconhecendo fornecedor, valor e data...", "Montando a prévia..."];
const ETAPAS_IMPORTANDO = ["Abrindo a caixa de e-mail...", "Procurando notas e recibos no período...", "Reconhecendo fornecedor, valor e data...", "Lançando as faturas..."];

/** O botão "Ler as notas do e-mail" usa o mesmo período escolhido para o gasto. */
const DIAS_DO_PERIODO: Record<Periodo, 30 | 90 | 365> = { mes: 30, "3meses": 90, ano: 365 };

const ROTULOS_PERIODICIDADE: Record<Fatura["periodicidade"], string> = { mensal: "Mensal", anual: "Anual", unica: "Única" };
const ROTULOS_ORIGEM: Record<Fatura["origem"], string> = { email: "Lida do e-mail", upload: "Enviada por upload", manual: "Lançada manualmente" };

// Textos do topo (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Financeiro",
  titulo: "Quanto sua empresa gasta com IA",
  apoio: "As notas saem da sua caixa de e-mail e viram o gasto do período, comparado ao planejado.",
  itens: [
    "Total do período em reais",
    "Variação contra o mês anterior",
    "Gasto por ferramenta contra o planejado",
    "Alertas de estouro e duplicidade",
    "Lista de faturas para baixar",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Notas", apoio: "Do e-mail ou em PDF" },
  { titulo: "Período", apoio: "Mês, trimestre ou ano" },
  { titulo: "Gasto", apoio: "Comparado ao planejado" },
];

function IconePeriodo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

function IconeNotas() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M15 3.5v4h4M9 12h7M9 16h5" />
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

/** Cartão de entrada com ícone circular e título, no lugar da coluna única de campos crus. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3 [&>details:last-child]:mb-0">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes da primeira leitura. */
function Previa({ itens }: { itens: string[] }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string } }
  | { fase: "lendo-notas" }
  | { fase: "previa"; resultado: ResultadoUpload }
  | { fase: "importando" }
  | { fase: "importado"; resultado: ResultadoImportacao }
  | { fase: "pronto"; leitura: Leitura; faturas: Fatura[]; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [enviarNotasAberto, setEnviarNotasAberto] = useState(false);
  /** Aberto quando Gmail e Outlook estão conectados e a pessoa precisa dizer qual caixa ler. */
  const [escolhendoCaixa, setEscolhendoCaixa] = useState(false);
  /** Falha do "Ler as notas do e-mail": aviso junto do botão, sem derrubar o resultado que já está na tela. */
  const [avisoEmail, setAvisoEmail] = useState<{ mensagem: string; acao?: { rotulo: string; url: string } } | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "previa" || estado.fase === "importado");

  /** 401 sem sessão (proxy.ts) manda para a tela de entrar guardando o destino. */
  function semSessao(codigo?: string): boolean {
    if (codigo !== "sem_sessao") return false;
    router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
    return true;
  }

  async function gerar(periodoEscolhido: Periodo) {
    setEstado({ fase: "carregando" });
    setAvisoEmail(null);
    try {
      const r = await fetch(`/api/leitura?periodo=${periodoEscolhido}`);
      if (!r.ok) {
        // lerErro lê { error, codigo, acao } da rota (respostaErro/responderErro): nunca status cru na tela.
        const info = await lerErro(r);
        if (r.status === 401 && semSessao(info.codigo)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", leitura: resposta.leitura, faturas: resposta.faturas, meta: resposta.meta, id: resposta.id });
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem });
    }
  }

  /** Sem `provedor`, o servidor lê todas as caixas conectadas. */
  async function importarEmail(provedor?: ProvedorEmail) {
    setEscolhendoCaixa(false);
    setAvisoEmail(null);
    const anterior = estado;
    setEstado({ fase: "importando" });
    try {
      const r = await fetch("/api/faturas/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dias: DIAS_DO_PERIODO[periodo], provedor }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && semSessao(info.codigo)) return;
        // Ler a caixa é uma ação lateral: a falha vira aviso junto do botão e o palco volta ao que era.
        setAvisoEmail({ mensagem: info.mensagem, acao: info.acao });
        setEstado(anterior);
        return;
      }
      setEstado({ fase: "importado", resultado: (await r.json()) as ResultadoImportacao });
    } catch (e) {
      const info = await lerErro(e);
      setAvisoEmail({ mensagem: info.mensagem });
      setEstado(anterior);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(periodo);
  }

  // Atalho para demonstrações: /?exemplo=1 dispara a leitura do mês atual sozinho.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => gerar("mes"), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const importando = estado.fase === "importando";
  const passoAtual = estado.fase === "pronto" ? 3 : 2;
  /** Caixas conectadas em /setup (Gmail e/ou Outlook): o botão habilita com qualquer uma. */
  const caixas = PROVEDORES_EMAIL.filter((p) => Boolean(status?.integrations?.[p]));
  const emailConectado = caixas.length > 0;
  const podeImportar = emailConectado && Boolean(status?.ai);
  const dicaEmail = !status
    ? "Conecte seu e-mail para ler as notas sozinho"
    : !emailConectado
      ? "Conecte seu e-mail (Gmail ou Outlook) para ler as notas sozinho"
      : !status.ai
        ? "Conecte a inteligência artificial para reconhecer as notas do e-mail"
        : caixas.length > 1
          ? `Busca notas dos últimos ${DIAS_DO_PERIODO[periodo]} dias no Gmail e no Outlook`
          : `Busca notas dos últimos ${DIAS_DO_PERIODO[periodo]} dias no ${NOME_PROVEDOR[caixas[0]]}`;

  /** Com uma caixa só, lê direto; com as duas, pergunta qual usar antes. */
  function clicarLerEmail() {
    if (caixas.length > 1) setEscolhendoCaixa((v) => !v);
    else importarEmail(caixas[0]);
  }

  return (
    <>
      <Topbar marca="C" nome="Custos de IA" area="Financeiro" status={status} erro={erro} resumo="Modo demonstração: o gasto exibido é um exemplo com dados fictícios." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Financeiro">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit} className="entrada">
            <CartaoEntrada icone={<IconeNotas />} titulo="As notas">
              <div className="flex flex-col gap-2.5 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" className="btn-ghost !w-auto" disabled={!podeImportar || importando || carregando} onClick={clicarLerEmail} aria-expanded={caixas.length > 1 ? escolhendoCaixa : undefined} aria-controls={caixas.length > 1 ? "escolher-caixa" : undefined}>
                    {importando ? "Lendo o e-mail" : "Ler as notas do e-mail"}
                  </button>
                  {status && !emailConectado ? (
                    <Link href="/setup#gmail" className="text-[12.5px] text-muted underline">{dicaEmail}</Link>
                  ) : status && emailConectado && !status.ai ? (
                    <Link href="/setup#openrouter" className="text-[12.5px] text-muted underline">{dicaEmail}</Link>
                  ) : (
                    <span className="text-[12.5px] text-muted">{dicaEmail}</span>
                  )}
                </div>
                {escolhendoCaixa && caixas.length > 1 && (
                  <div id="escolher-caixa" role="group" aria-label="Qual caixa ler?" className="flex items-center gap-2 flex-wrap rounded-[10px] border border-line bg-bg px-3 py-2.5">
                    <span className="text-[12.5px] font-semibold text-ink mr-1">Qual caixa ler?</span>
                    {caixas.map((c) => (
                      <button key={c} type="button" className="btn-ghost !w-auto" onClick={() => importarEmail(c)}>{NOME_PROVEDOR[c]}</button>
                    ))}
                    <button type="button" className="btn-ghost !w-auto" onClick={() => importarEmail()}>As duas</button>
                  </div>
                )}
                {avisoEmail && <Aviso tom="danger" acao={avisoEmail.acao}>{avisoEmail.mensagem}</Aviso>}
                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" className="btn-ghost !w-auto" aria-expanded={enviarNotasAberto} aria-controls="enviar-notas" onClick={() => setEnviarNotasAberto((v) => !v)}>
                    {enviarNotasAberto ? "Fechar envio de notas" : "Enviar notas em PDF"}
                  </button>
                  <span className="text-[12.5px] text-muted">Até 10 por vez; você confere antes de gravar</span>
                </div>
                {enviarNotasAberto && (
                  <div id="enviar-notas" className="mt-1.5">
                    <EnviarNotas
                      onInicio={() => setEstado({ fase: "lendo-notas" })}
                      onLido={(resultado) => setEstado({ fase: "previa", resultado })}
                      onErro={(mensagem) => setEstado({ fase: "erro", mensagem })}
                    />
                  </div>
                )}
              </div>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconePeriodo />} titulo="O período">
              <Field label="Ver o gasto de" htmlFor="periodo">
                <select id="periodo" className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
                  <option value="mes">Mês atual</option>
                  <option value="3meses">Últimos 3 meses</option>
                  <option value="ano">Último ano</option>
                </select>
              </Field>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>
              {carregando ? "Lendo o período" : "Ver gasto do período"}
            </button>
          </form>

          {/* Orçamento e lançamento manual têm `<form>` próprio: ficam FORA do formulário principal
              (um <form> dentro de outro é HTML inválido e quebra a hidratação do React). */}
          <div className="card p-5 mt-4">
            <div id="orcamento">
              <MaisDetalhes titulo="Orçamento planejado">
                <OrcamentoPlanejado onSalvo={() => gerar(periodo)} />
              </MaisDetalhes>
            </div>
            <MaisDetalhes titulo="Lançar uma nota à mão">
              <LancarManualmente onLancado={() => gerar(periodo)} />
            </MaisDetalhes>
            <Privacidade detalhe="As faturas lançadas ficam só neste app; apague quando quiser." />
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "lendo-notas" && <Loading etapas={ETAPAS_LENDO_NOTAS} />}
          {estado.fase === "importando" && <Loading etapas={ETAPAS_IMPORTANDO} />}
          {estado.fase === "importado" && <ResumoImportacao resultado={estado.resultado} onVerGasto={() => gerar(periodo)} />}
          {estado.fase === "previa" && (
            <PreviaNotas
              key={estado.resultado.reconhecidas.map((f) => f.id).join(",")}
              resultado={estado.resultado}
              onConfirmado={() => {
                setEnviarNotasAberto(false);
                gerar(periodo);
              }}
              onCancelar={() => setEstado({ fase: "vazio" })}
            />
          )}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => gerar(periodo)} />}
          {estado.fase === "pronto" && <Resultado leitura={estado.leitura} faturas={estado.faturas} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>
    </>
  );
}
/** Abre a dobra "Orçamento planejado" do painel e rola até ela (o convite da linha de proveniência
 * aponta para um <details> fechado na mesma tela, não para outra página). */
function abrirOrcamento() {
  const dobra = document.querySelector<HTMLDetailsElement>("#orcamento details");
  if (!dobra) return;
  dobra.open = true;
  dobra.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Linha de proveniência própria deste app. `Origem` (compartilhado) só sabe convidar a conectar a IA,
 * mas aqui o que falta é o DADO, não o modelo — e `meta.demo` é um booleano só, que não distingue
 * "tudo de exemplo" de "minhas faturas contra um orçamento de exemplo". Dizer "faturas fictícias" sobre
 * faturas reais seria uma frase falsa na tela. */
function OrigemDoGasto({ leitura, model }: { leitura: Leitura; model: string }) {
  const origem = leitura.origemDados ?? { faturas: "exemplo" as const, orcamento: "exemplo" as const };
  const mes = leitura.mesAtual.replace(/ de \d{4}$/, "");
  if (origem.faturas === "reais" && origem.orcamento === "exemplo") {
    return (
      <p className="text-muted text-[13px] mb-4" title={model}>
        As faturas são suas; o orçamento comparado é um exemplo. Cadastre o seu para a comparação valer.{" "}
        <button type="button" className="font-semibold text-accent underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer" onClick={abrirOrcamento}>
          Cadastrar o meu orçamento
        </button>
      </p>
    );
  }
  return (
    <p className="text-muted text-[13px] mb-4" title={model}>
      Exemplo ilustrativo com faturas fictícias de {mes}; conecte o e-mail ou envie notas em PDF para ver o seu gasto.{" "}
      <Link href="/setup#gmail" className="font-semibold text-accent underline underline-offset-2">Conectar o e-mail</Link>
    </p>
  );
}

function tomDaDiferenca(diferenca: number, planejadoBRL: number): "ok" | "warn" | "danger" {
  if (diferenca <= 0) return "ok";
  const proporcao = planejadoBRL > 0 ? diferenca / planejadoBRL : 1;
  return proporcao > 0.1 ? "danger" : "warn";
}

export function Resultado({ leitura, faturas, meta, id }: { leitura: Leitura; faturas: Fatura[]; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={`Gasto com IA de ${leitura.mesAtual}`}>
        <Entregar
          id={id}
          titulo={`Gasto com IA de ${leitura.mesAtual}`}
          texto={() => leituraParaTexto(leitura, faturas)}
          extras={[{ rotulo: "Baixar faturas (CSV)", onClick: () => exportarFaturasCSV(faturas, leitura.mesAtual) }]}
        />
      </ResultHead>

      {meta.demo ? <OrigemDoGasto leitura={leitura} model={meta.model} /> : <Origem meta={meta} />}

      <ConteudoLeitura leitura={leitura} faturas={faturas} />

      <ReceberFechamento />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da leitura (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoLeitura({ leitura, faturas }: { leitura: Leitura; faturas: Fatura[] }) {
  const diferenca = leitura.totalBRL - leitura.planejadoBRL;
  const tom = tomDaDiferenca(diferenca, leitura.planejadoBRL);
  const interpretacao =
    diferenca > 0
      ? `R$ ${numero(diferenca, 2)} acima do planejado (R$ ${numero(leitura.planejadoBRL, 2)})`
      : diferenca < 0
        ? `R$ ${numero(Math.abs(diferenca), 2)} abaixo do planejado (R$ ${numero(leitura.planejadoBRL, 2)})`
        : `Exatamente dentro do planejado (R$ ${numero(leitura.planejadoBRL, 2)})`;

  const maxFerramenta = Math.max(...leitura.porFerramenta.map((f) => f.totalBRL), 1);
  const alertas = leitura.alertas ?? [];

  return (
    <>
      <Destaque valor={`R$ ${numero(leitura.totalBRL, 2)}`} rotulo={`Gasto de ${leitura.mesAtual}`} interpretacao={interpretacao} tom={tom} />

      <p className="summary">
        {leitura.variacaoMesAnterior > 0 ? "Alta" : leitura.variacaoMesAnterior < 0 ? "Queda" : "Estabilidade"} de{" "}
        {numero(Math.abs(leitura.variacaoMesAnterior), 1)}% em relação ao mês anterior.
      </p>

      <Section titulo="Alertas">
        {alertas.length === 0 ? (
          <p className="text-muted text-sm">Nenhum alerta no período: ninguém passou do planejado, nenhuma assinatura nova apareceu e nada foi pago duas vezes.</p>
        ) : (
          <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
            {alertas.map((a) => (
              <li key={`${a.tipo}-${a.alvo}-${a.mes}`} className="flex items-start gap-2.5 flex-wrap">
                <span className="shrink-0 pt-px"><Chip nivel={a.nivel}>{a.titulo}</Chip></span>
                <span className="text-sm flex-1 min-w-[200px]">{a.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section titulo="Gasto contra o planejado, mês a mês">
        <GraficoGastoPlanejado meses={leitura.porMes} />
      </Section>

      <Section titulo="Gasto por ferramenta">
        {leitura.porFerramenta.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma fatura no período.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {leitura.porFerramenta.map((f) => {
              const largura = Math.max((f.totalBRL / maxFerramenta) * 100, 2);
              return (
                <div key={f.ferramenta} className="flex items-center gap-2.5 flex-wrap">
                  <span className="w-[160px] shrink-0 text-[13px] text-muted text-right truncate" title={f.ferramenta}>
                    {f.ferramenta}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`h-7 rounded-[4px] ${f.acimaDoPlanejado ? "bg-danger" : "bg-accent"}`}
                      style={{ width: `${largura}%` }}
                      title={`${f.ferramenta}: R$ ${numero(f.totalBRL, 2)}`}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-[13px] font-bold text-ink">R$ {numero(f.totalBRL, 0)}</span>
                  {f.acimaDoPlanejado && <Chip nivel="alta">Acima do planejado</Chip>}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section titulo="Faturas do período">
        {faturas.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma fatura lançada neste período ainda.</p>
        ) : (
          <DataTable
            colunas={[
              {
                chave: "fornecedor",
                titulo: "Fornecedor",
                papel: "titulo",
                largura: "24%",
                render: (f: Fatura) => {
                  const alerta = alertaDaFatura(alertas, f);
                  return (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <strong>{f.fornecedor}</strong>
                      {alerta && <Chip nivel={alerta.nivel}>{alerta.titulo}</Chip>}
                    </span>
                  );
                },
              },
              // Uma coluna de resumo só (a ferramenta) com largura explícita e 3 linhas: com o palco na
              // metade da tela, "ferramenta · periodicidade" em 2 linhas punha um "Ver mais" em todas as
              // linhas. Periodicidade e origem viraram uma única coluna de detalhe, ao lado da data.
              { chave: "ferramenta", titulo: "Ferramenta", papel: "resumo", linhas: 3, largura: "34%", render: (f: Fatura) => f.ferramenta },
              { chave: "valor", titulo: "Valor", papel: "chip", largura: "108px", render: (f: Fatura) => <span className="font-bold">R$ {numero(f.valorBRL, 2)}</span> },
              {
                chave: "data",
                titulo: "Data",
                papel: "detalhe",
                render: (f: Fatura) => (
                  <>
                    {data(new Date(`${f.data}T00:00:00`), { comAno: true })}
                    <span className="block text-[12.5px] text-muted">{ROTULOS_PERIODICIDADE[f.periodicidade]} · {ROTULOS_ORIGEM[f.origem]}</span>
                  </>
                ),
              },
            ]}
            linhas={faturas}
          />
        )}
      </Section>
    </>
  );
}

/** Alerta que marca esta fatura: ferramenta paga duas vezes no mês, estouro dela no mês, ou fornecedor
 * novo nesse mês — nessa ordem, porque a duplicidade é a que rende economia imediata. */
function alertaDaFatura(alertas: Alerta[], f: Fatura): Alerta | undefined {
  const mes = f.data.slice(0, 7);
  return (
    alertas.find((a) => a.mes === mes && a.tipo === "assinatura-duplicada" && a.alvo === f.ferramenta) ??
    alertas.find((a) => a.mes === mes && a.tipo === "acima-do-planejado" && a.alvo === f.ferramenta) ??
    alertas.find((a) => a.mes === mes && a.tipo === "assinatura-nova" && a.alvo === f.fornecedor)
  );
}

function leituraParaTexto(leitura: Leitura, faturas: Fatura[]) {
  const l: string[] = [
    `Gasto com IA de ${leitura.mesAtual}`,
    "",
    `Total: R$ ${numero(leitura.totalBRL, 2)}`,
    `Planejado: R$ ${numero(leitura.planejadoBRL, 2)}`,
    `Variação em relação ao mês anterior: ${numero(leitura.variacaoMesAnterior, 1)}%`,
    "",
    "Por ferramenta:",
  ];
  leitura.porFerramenta.forEach((f) => l.push(`- ${f.ferramenta}: R$ ${numero(f.totalBRL, 2)}${f.acimaDoPlanejado ? " (acima do planejado)" : ""}`));
  l.push("", "Alertas:");
  if ((leitura.alertas ?? []).length === 0) l.push("- Nenhum alerta no período");
  (leitura.alertas ?? []).forEach((a) => l.push(`- ${a.titulo}: ${a.descricao}`));
  l.push("", "Faturas do período:");
  faturas.forEach((f) => l.push(`- ${f.data} · ${f.fornecedor} (${f.ferramenta}): R$ ${numero(f.valorBRL, 2)}`));
  return l.join("\n");
}

/** Baixa as faturas do período em CSV (separador ";" e BOM, para abrir direto no Excel em português). */
function exportarFaturasCSV(faturas: Fatura[], mesAtual: string) {
  const cabecalho = ["Data", "Fornecedor", "Ferramenta", "Categoria", "Valor", "Moeda", "Valor em reais", "Periodicidade", "Origem", "Referência"];
  const linhas = [cabecalho.join(";")];
  faturas.forEach((f) => {
    const campos = [f.data, f.fornecedor, f.ferramenta, f.categoria, numero(f.valor, 2), f.moeda, numero(f.valorBRL, 2), ROTULOS_PERIODICIDADE[f.periodicidade], ROTULOS_ORIGEM[f.origem], f.referencia ?? ""];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "\ufeff" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `faturas-ia-${mesAtual.replace(/\s+/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
