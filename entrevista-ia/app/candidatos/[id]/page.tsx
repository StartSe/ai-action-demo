"use client";
// A tela de um candidato (US-013): a ficha com a origem de cada informação, as decisões que só uma
// pessoa pode tomar e o processo dele.
//
// A ordem dos blocos é a ordem das perguntas de quem abre a tela: quem é (cabeçalho e ações), o que
// ainda depende de mim (identidade e divergências), o que sabemos (a ficha e as fontes) e em que
// ponto o processo está (as entrevistas).
//
// Enquanto a pesquisa na web corre, a tela SONDA `GET /api/candidatos/[id]` a cada três segundos —
// uma rodada leva até um minuto (US-012) e nenhum pedido HTTP fica aberto tanto tempo.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DialogoAtribuirVaga } from "@/components/DialogoAtribuirVaga";
import { DadosEncontrados } from "@/components/DadosEncontrados";
import { PesquisaComplementar } from "@/components/PesquisaComplementar";
import { DialogoConvite } from "@/components/DialogoConvite";
import { FichaCandidato, type FonteNaTela } from "@/components/FichaCandidato";
import { ChipSituacao, NotaDaEntrevista, PODE_CONVIDAR, ROTULO_DECISAO, VIVAS, esperaDoParecer, rotuloConvite, type EntrevistaNaTabela } from "@/components/RotulosEntrevista";
import { Aviso, Chip, DataTable, ErrorBox, Topbar, data, lerErro, useConfirmacao, useStatus, type Coluna, type ErroLido } from "@/components/ui";
import type { EdicaoFicha } from "@/lib/ficha";
import type { Ficha, OrigemCampo } from "@/lib/types";

type PesquisaStatus = "nao_pedida" | "pendente" | "em_andamento" | "concluida" | "sem_resultado" | "falhou";

type CandidatoDaPagina = {
  id: string;
  nome: string;
  email?: string;
  cidade?: string;
  linkedinUrl?: string;
  termoBusca?: string;
  ficha?: Ficha;
  cvNome?: string;
  temCvTexto: boolean;
  pesquisaStatus: PesquisaStatus;
  pesquisaEm?: string;
  identidadeConfirmada: boolean;
  exemplo: boolean;
};

const ROTULO_ORIGEM: Record<OrigemCampo, string> = { cv: "CV", web: "Web", gestor: "Editado por você" };

const ROTULO_FONTE: Record<FonteNaTela["tipo"], string> = {
  cv: "Currículo enviado",
  linkedin: "Perfil profissional",
  busca: "Resultado da busca",
  pagina: "Página na web",
};

/** O nome de cada campo, para as divergências. O mesmo de `ROTULOS_FICHA` (lib/ficha.ts), repetido
 * aqui porque importar aquele módulo num componente de navegador arrastaria o banco junto. */
const ROTULO_CAMPO: Record<string, string> = {
  resumo: "Resumo",
  cargoAtual: "Cargo atual",
  empresaAtual: "Empresa atual",
  cidade: "Cidade",
  anosExperiencia: "Anos de experiência",
  pretensaoSalarial: "Pretensão salarial",
  disponibilidade: "Disponibilidade",
  observacoes: "Observações",
};

/** A pesquisa na web em uma frase. São quatro desfechos e quatro frases — o motivo técnico de uma
 * falha fica no registro do servidor, nunca aqui (US-012). */
function frasePesquisa(c: CandidatoDaPagina): string {
  switch (c.pesquisaStatus) {
    case "pendente":
    case "em_andamento":
      return "Pesquisando na web...";
    case "concluida":
      return c.pesquisaEm ? `Pesquisa concluída em ${data(c.pesquisaEm)}` : "Pesquisa concluída";
    case "sem_resultado":
      return "Não encontramos a pessoa na web";
    case "falhou":
      return "A pesquisa não deu certo";
    default:
      return "Ainda não procuramos esta pessoa na web";
  }
}

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [candidato, setCandidato] = useState<CandidatoDaPagina | null>(null);
  const [fontes, setFontes] = useState<FonteNaTela[]>([]);
  const [origens, setOrigens] = useState<OrigemCampo[]>([]);
  const [entrevistas, setEntrevistas] = useState<EntrevistaNaTabela[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [erroFicha, setErroFicha] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);
  // O reenvio preserva o período salvo; se o convite venceu, o diálogo renova o prazo.
  const [convite, setConvite] = useState<{ entrevistaId: string; reenviar: boolean } | null>(null);
  const [recado, setRecado] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);

  const aplicar = useCallback((corpo: { candidato: CandidatoDaPagina; fontes?: FonteNaTela[]; origens?: OrigemCampo[] }) => {
    setCandidato(corpo.candidato);
    if (corpo.fontes) setFontes(corpo.fontes);
    if (corpo.origens) setOrigens(corpo.origens);
  }, []);

  /** Relê só a tabela de entrevistas: a ficha não muda quando o convite muda. */
  const recarregarEntrevistas = useCallback(() => {
    fetch(`/api/candidatos/${id}/entrevistas`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setEntrevistas(corpo.itens))
      .catch(() => {});
  }, [id]);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/candidatos/${id}`);
    if (!r.ok) throw r;
    aplicar(await r.json());
  }, [id, aplicar]);

  // A primeira leitura vai em corrente, e não `await carregar()`: a regra
  // `react-hooks/set-state-in-effect` acusa qualquer função que mexa em estado chamada no corpo de um
  // efeito, mesmo assíncrona (mesmo padrão de app/vagas/[id]/page.tsx).
  useEffect(() => {
    Promise.all([
      fetch(`/api/candidatos/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch(`/api/candidatos/${id}/entrevistas`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([doCandidato, dasEntrevistas]) => {
        aplicar(doCandidato);
        setEntrevistas(dasEntrevistas.itens);
      })
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setEntrevistas([]);
      });
  }, [id, aplicar]);

  // A sondagem enquanto a pesquisa corre. Ela para sozinha quando o estado deixa de ser "correndo":
  // o efeito depende justamente dele.
  const correndo = candidato?.pesquisaStatus === "pendente" || candidato?.pesquisaStatus === "em_andamento";
  useEffect(() => {
    if (!correndo) return;
    const relogio = setInterval(() => {
      fetch(`/api/candidatos/${id}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then(aplicar)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(relogio);
  }, [correndo, id, aplicar]);

  async function salvarFicha(campos: EdicaoFicha) {
    if (!Object.keys(campos).length) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    setErroFicha("");
    try {
      const r = await fetch(`/api/candidatos/${id}/ficha`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campos }) });
      if (!r.ok) throw r;
      setEditando(false);
      setRecado("Ficha atualizada. O que você mudou fica marcado como seu.");
      await carregar();
    } catch (e) {
      setErroFicha((await lerErro(e)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  async function decidirIdentidade(escolha: number | null) {
    if (revisando) return;
    setRevisando(true);
    setErroTela(null);
    try {
      const r = await fetch(`/api/candidatos/${id}/identidade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escolha }) });
      if (!r.ok) throw r;
      setRecado(escolha === null ? "Descartamos o que a pesquisa tinha encontrado." : "Pronto: a ficha agora tem também o que encontramos na web.");
      await carregar();
      if (escolha !== null) requestAnimationFrame(() => document.getElementById("curriculo-digital")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setRevisando(false);
    }
  }

  async function resolverDivergencia(campo: string, escolha: "cv" | "web") {
    setErroTela(null);
    try {
      const r = await fetch(`/api/candidatos/${id}/ficha`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ divergencia: { campo, escolha } }) });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  async function apagar() {
    if (!candidato) return;
    const quantas = entrevistas?.length ?? 0;
    const junto = ["a ficha", candidato.cvNome ? "o currículo" : "", quantas ? `${quantas === 1 ? "1 entrevista" : `${quantas} entrevistas`} e os pareceres` : ""]
      .filter(Boolean)
      .join(", ");
    if (!(await confirmar(`Apagar ${candidato.nome}? Vão junto ${junto}. Isso não tem volta.`, { confirmarRotulo: "Apagar candidato", cancelarRotulo: "Voltar" }))) return;
    try {
      const r = await fetch(`/api/candidatos/${id}`, { method: "DELETE" });
      if (!r.ok) throw r;
      router.push("/candidatos");
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  const ficha = candidato?.ficha;
  const pendente = ficha?.web;
  const precisaEscolher = Boolean(candidato && !candidato.identidadeConfirmada && pendente?.identidades.length);
  useEffect(() => {
    if (!precisaEscolher) return;
    const direcionar = () => {
      if (window.location.hash !== "#dados-encontrados") return;
      const secao = document.getElementById("dados-encontrados");
      secao?.scrollIntoView({ behavior: "smooth" });
      secao?.focus({ preventScroll: true });
    };
    direcionar();
    window.addEventListener("hashchange", direcionar);
    return () => window.removeEventListener("hashchange", direcionar);
  }, [precisaEscolher]);

  const divergencias = ficha?.divergencias ?? [];
  const jaEm = (entrevistas ?? []).filter((e) => VIVAS.includes(e.status)).map((e) => e.vagaId);
  const cabecalho = [ficha?.cargoAtual?.valor, ficha?.empresaAtual?.valor].filter(Boolean).join(" · ");
  const cidade = ficha?.cidade?.valor || candidato?.cidade || "";

  const colunas: Coluna<EntrevistaNaTabela>[] = [
    { chave: "vaga", titulo: "Vaga", papel: "titulo", render: (e) => <Link href={`/vagas/${e.vagaId}`} className="btn-link">{e.vagaCargo}</Link> },
    { chave: "situacao", titulo: "Situação", papel: "chip", render: (e) => <ChipSituacao entrevista={e} /> },
    {
      chave: "nota",
      titulo: "Nota",
      // A mesma frase de `/entrevistas` sobre a mesma linha: "Preparando o parecer...", "Encerrada
      // cedo demais para avaliar" ou a nota. Um traço aqui e uma frase lá seriam dois registros.
      render: (e) => {
        const espera = esperaDoParecer(e);
        return espera ? <span className="text-muted">{espera}</span> : <NotaDaEntrevista entrevista={e} />;
      },
    },
    { chave: "decisao", titulo: "Sua decisão", render: (e) => (e.decisao ? ROTULO_DECISAO[e.decisao] : <span className="text-muted">—</span>) },
    { chave: "quando", titulo: "Quando", render: (e) => <span className="text-muted">{data(e.concluidaEm ?? e.criadoEm)}</span> },
    {
      chave: "acoes",
      titulo: "Ações",
      render: (e) => {
        // Uma coluna sem conteúdo devolve um traço: no celular o rótulo "Ações" sozinho parece defeito.
        const acoes = [
          e.resultadoId ? <Link key="parecer" href={`/entrevistas/${e.id}`} className="btn-link">Ver parecer</Link> : null,
          PODE_CONVIDAR.includes(e.status) ? (
            <button key="convite" type="button" className="btn-link" onClick={() => setConvite({ entrevistaId: e.id, reenviar: true })}>
              {rotuloConvite(e)}
            </button>
          ) : null,
        ].filter(Boolean);
        if (!acoes.length) return <span className="text-muted">—</span>;
        return <span className="flex items-center gap-3 flex-wrap">{acoes}</span>;
      },
    },
  ];

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1180px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/candidatos" className="btn-link text-[13px]">← Candidatos</Link>

        {erroTela && <div className="mt-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar para os candidatos", url: "/candidatos" }} /></div>}

        {!candidato ? (
          !erroTela && <p className="text-muted text-sm mt-4">Carregando...</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mt-3 mb-4 max-md:flex-col max-md:gap-3">
              <div className="min-w-0">
                <h1 className="titulo-painel mb-1.5">{candidato.nome}</h1>
                <p className="apoio mb-2">{[cabecalho, cidade].filter(Boolean).join(" — ") || "Sem cargo nem cidade na ficha ainda."}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {origens.map((o) => <Chip key={o} nivel={o === "gestor" ? "positivo" : "neutral"}>{ROTULO_ORIGEM[o]}</Chip>)}
                  {candidato.exemplo && <Chip nivel="cinza">Exemplo</Chip>}
                  <span className="text-muted text-[12.5px]">{frasePesquisa(candidato)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 max-md:w-full">
                <button type="button" className="btn-ghost !w-auto !p-3" aria-label="Editar ficha" title="Editar ficha" disabled={editando} onClick={() => { setErroFicha(""); setEditando(true); requestAnimationFrame(() => document.getElementById("curriculo-digital")?.scrollIntoView({ block: "start" })); }}>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>
                </button>
                <button type="button" className="btn-ghost !w-auto !p-3 text-danger" aria-label="Excluir candidato" title="Excluir candidato" onClick={() => void apagar()}>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
                </button>
              <button type="button" className="btn-primary !w-auto max-md:flex-1 max-md:!px-3" onClick={() => setAtribuindo(true)}>
                Atribuir a uma vaga
              </button>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap mb-5">
              {candidato.cvNome && (
                <a href={`/api/candidatos/${id}/cv`} target="_blank" rel="noreferrer" className="btn-link">Abrir currículo</a>
              )}
            </div>

            <PesquisaComplementar candidato={candidato} correndo={correndo} aoPesquisar={() => { void fetch(`/api/candidatos/${id}`).then((r) => r.ok ? r.json() : Promise.reject(r)).then(aplicar).catch(() => {}); }} />
            {recado && <div className="mb-5"><Aviso tom="ok">{recado}</Aviso></div>}

            {precisaEscolher && pendente && (
              <section id="dados-encontrados" tabIndex={-1} className="card p-6 max-md:p-5 mb-5 scroll-mt-6 border-accent/30">
                <h2 className="font-extrabold text-xl mb-1">Revise os dados encontrados</h2>
                <p className="apoio mb-4">
                  Confira as informações e as fontes antes de atualizar a ficha. Seus dados atuais e anotações são preservados; diferenças em relação ao currículo ficam sinalizadas para revisão.
                </p>
                {pendente.exemplo && (
                  <div className="mb-4">
                    <Aviso>Este resultado é um exemplo, para você ver como a tela funciona. Ele não foi lido de nenhuma página de verdade.</Aviso>
                  </div>
                )}
                <DadosEncontrados ficha={pendente.ficha} fontes={fontes} />
                {pendente.identidades.length > 1 && <p className="text-sm font-semibold mb-3">Há mais de uma identidade possível. Escolha o perfil correto; apenas as fontes compatíveis serão aplicadas.</p>}
                <div className="flex flex-col gap-3 mb-4">
                  {pendente.identidades.map((pessoa, i) => (
                    <div key={i} className="border border-line rounded-card p-4">
                      <p className="font-bold text-sm">{pessoa.nome}</p>
                      <p className="text-muted text-[12.5px] mb-2">{pessoa.descricao}</p>
                      {pessoa.url && (
                        <p className="mb-2">
                          <a href={pessoa.url} target="_blank" rel="noreferrer" className="btn-link text-[13px] break-all">{pessoa.url}</a>
                        </p>
                      )}
                      {pessoa.bate.length > 0 && <p className="text-[12.5px]"><strong>Bate com:</strong> {pessoa.bate.join("; ")}</p>}
                      {pessoa.naoBate.length > 0 && <p className="text-[12.5px]"><strong>Não bate com:</strong> {pessoa.naoBate.join("; ")}</p>}
                      <button type="button" className="btn-ghost !w-auto mt-3 max-md:!w-full" disabled={revisando} onClick={() => void decidirIdentidade(i)}>{pendente.identidades.length > 1 ? "Confirmar esta pessoa e atualizar ficha" : "Atualizar ficha com estes dados"}</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-link" disabled={revisando} onClick={() => void decidirIdentidade(null)}>Descartar resultados e manter a ficha</button>
              </section>
            )}

            {divergencias.length > 0 && (
              <section className="card p-5 mb-5">
                <h2 className="font-extrabold text-[17px] mb-1">Divergências entre o currículo e a web</h2>
                <p className="apoio mb-4">Vale o que está no currículo, até você dizer o contrário.</p>
                <div className="flex flex-col gap-3">
                  {divergencias.map((d) => {
                    const fonte = d.fonteId ? fontes.find((f) => f.id === d.fonteId) : undefined;
                    return (
                      <div key={d.campo} className="border border-line rounded-card p-4">
                        <p className="text-[12.5px] font-bold text-muted mb-2">{ROTULO_CAMPO[d.campo] ?? d.campo}</p>
                        <div className="grid grid-cols-2 gap-4 mb-3 max-md:grid-cols-1">
                          <div>
                            <p className="text-[11px] font-bold text-muted">No currículo</p>
                            <p className="text-sm">{d.cv}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-muted">Na web</p>
                            <p className="text-sm">{d.web}</p>
                            {fonte?.url && (
                              <a href={fonte.url} target="_blank" rel="noreferrer" className="btn-link text-[11px]">fonte</a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <button type="button" className="btn-link" onClick={() => void resolverDivergencia(d.campo, "cv")}>Manter o currículo</button>
                          <button type="button" className="btn-link" onClick={() => void resolverDivergencia(d.campo, "web")}>Usar o da web</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div id="curriculo-digital" className="scroll-mt-6" />
            <FichaCandidato
              pessoa={candidato}
              ficha={ficha}
              fontes={fontes}
              editando={editando}
              salvando={salvando}
              erro={erroFicha}
              onSalvar={(campos) => void salvarFicha(campos)}
              onCancelar={() => setEditando(false)}
            />

            {fontes.length > 0 && (
              <section id="fontes-pesquisa" className="card p-5 mt-4 scroll-mt-6">
                <h2 className="font-extrabold text-[17px] mb-1">Onde procuramos</h2>
                <p className="apoio mb-4">O currículo enviado e as páginas públicas que a pesquisa leu. Enquanto a organização não termina, mostramos trechos do material coletado.</p>
                <ul className="flex flex-col gap-2.5">
                  {fontes.map((f) => (
                    <li key={f.id}>
                      <p className="text-sm font-semibold">
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noreferrer" className="btn-link break-all">{f.titulo || f.url}</a>
                        ) : (
                          f.titulo || ROTULO_FONTE[f.tipo]
                        )}
                      </p>
                      <p className="text-muted text-[12.5px]">{f.resumo || ROTULO_FONTE[f.tipo]}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6">
              <h2 className="font-extrabold text-[17px] mb-0.5">Entrevistas</h2>
              <p className="apoio mb-3">Em quais vagas esta pessoa está e em que ponto cada conversa parou.</p>
              {entrevistas === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : entrevistas.length === 0 ? (
                <p className="text-muted text-sm border border-dashed border-line rounded-card p-8 text-center">
                  Esta pessoa ainda não foi chamada para nenhuma vaga. Atribua a uma vaga e a entrevistadora conversa com ela sobre o que está lá.
                </p>
              ) : (
                <DataTable colunas={colunas} linhas={entrevistas} />
              )}
            </section>
          </>
        )}
      </main>

      {atribuindo && candidato && (
        <DialogoAtribuirVaga
          candidatoId={candidato.id}
          candidatoNome={candidato.nome}
          jaEm={jaEm}
          onFechar={() => setAtribuindo(false)}
          onAtribuido={({ cargo, entrevistaId }) => {
            setAtribuindo(false);
            setRecado(`${candidato.nome} entrou na vaga de ${cargo}. Mande o convite para a conversa começar.`);
            setConvite({ entrevistaId, reenviar: false });
            recarregarEntrevistas();
          }}
        />
      )}
      {convite && (
        <DialogoConvite
          entrevistaId={convite.entrevistaId}
          reenviar={convite.reenviar}
          onFechar={() => setConvite(null)}
          onMudou={recarregarEntrevistas}
        />
      )}
      {Dialogo}
    </>
  );
}
