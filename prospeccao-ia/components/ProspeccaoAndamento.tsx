"use client";
// Tela de andamento de uma prospecção (US-013): a mesma rota de polling (GET
// /api/prospeccoes/[id]/andamento) serve a carga inicial e o poll a cada 2 s, então sair da tela e
// voltar (ou recarregar) sempre mostra o andamento correto, inclusive já concluído. O poll só roda
// enquanto a aba está visível (document.visibilityState === "visible") e só enquanto o estado é
// "executando" — mesmo padrão de components/ConexaoWhatsApp.tsx (whatsapp-atendente): o efeito depende
// do ESTADO (primitivo), não do objeto inteiro de andamento, para não reiniciar o intervalo a cada poll.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, Topbar, data, useConfirmacao, useStatus, lerErro } from "@/components/ui";
import { ExploracaoEmpresa } from "@/components/ExploracaoEmpresa";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { sinalAntigo } from "@/lib/qualificacao";
import { NIVEL_CHIP_EVIDENCIA, ROTULO_FIT, ROTULO_MODO, ROTULO_PAPEL, ROTULO_RESULTADO_EVIDENCIA, ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import { ETAPAS_PROSPECCAO } from "@/lib/execucao-etapas";
import type { Conta, Evidencia, Jornada, LeadProspeccao, Prospeccao, SinalProspeccao } from "@/lib/types";

/** Chip de um sinal de intenção (US-020): descrição + data, em cinza e com "· Antigo" quando passou dos
 * 90 dias (lib/qualificacao.ts:sinalAntigo) — sinal sem essa marca é recente e continua em verde
 * (`positivo`), mesmo tom já usado para sinal nas contas do modo "empresas". */
function ChipSinal({ sinal }: { sinal: SinalProspeccao }) {
  const antigo = sinalAntigo(sinal);
  return (
    <Chip nivel={antigo ? "cinza" : "positivo"}>
      {sinal.descricao} · {data(sinal.data, { comAno: true })}
      {antigo ? " · Antigo" : ""}
    </Chip>
  );
}

/** Evidências item a item (US-024, prd.json > regras: "com o valor encontrado e o resultado"): um chip
 * por critério (atende/não atende/não foi possível verificar) e, quando a IA citou um trecho (critério
 * interpretativo, ver lib/qualificacao-ia.ts), a frase literal que embasou a resposta. */
function EvidenciasLista({ evidencias }: { evidencias: Evidencia[] }) {
  if (evidencias.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {evidencias.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 flex-wrap text-[12px] text-muted">
          <Chip nivel={NIVEL_CHIP_EVIDENCIA[e.resultado]}>{ROTULO_RESULTADO_EVIDENCIA[e.resultado]}</Chip>
          <span>
            {e.criterio}: {e.valor}
            {e.trecho && <span className="italic"> · “{e.trecho}”</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Hipótese de dor (US-025): bloco separado de `EvidenciasLista` de propósito ("a ficha nunca mistura
 * hipótese e evidência no mesmo bloco") — texto condicional citando um sinal, gerado por
 * `lib/qualificacao-ia.ts:gerarHipoteseDor` na etapa 5 do pipeline. Sem nenhum sinal público, o lead nunca
 * teve de onde partir (`hipotese` fica `null` sem nem chamar a IA): mostra a frase fixa em vez de nada. */
function HipoteseDor({ hipotese, semSinal }: { hipotese: string | null; semSinal: boolean }) {
  if (!hipotese && !semSinal) return null;
  return (
    <div className="text-[12px] text-ink">
      <p className="font-semibold text-[12px] mb-0.5 flex items-center gap-1">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.6.8.6 1.3V16h5.8v-.8c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3Z" />
        </svg>
        Hipótese de dor
      </p>
      <p className={hipotese ? "italic" : "text-muted"}>{hipotese || "Ainda sem sinais públicos suficientes para uma hipótese."}</p>
    </div>
  );
}

type Andamento = {
  prospeccao: Prospeccao;
  produtoNome: string;
  icpNome: string;
  jornada: Jornada;
  contas: Conta[];
  leads: LeadProspeccao[];
  contasEncontradas: number;
  leadsEncontrados: number;
};

const INTERVALO_POLL_MS = 2000;

export function ProspeccaoAndamento({ prospeccaoId }: { prospeccaoId: string }) {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [repetindo, setRepetindo] = useState(false);
  const [erroRepetir, setErroRepetir] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [buscandoPessoasId, setBuscandoPessoasId] = useState<string | null>(null);
  const [erroVerPessoas, setErroVerPessoas] = useState<string | null>(null);
  const [apagandoPessoaId, setApagandoPessoaId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    fetch(`/api/prospeccoes/${prospeccaoId}/andamento`)
      .then(async (r) => {
        if (r.status === 404) {
          setNaoEncontrada(true);
          return;
        }
        const dados = (await r.json()) as Andamento;
        setAndamento(dados);
      })
      .catch(() => { /* próxima consulta tenta de novo; a tela mantém o último andamento conhecido */ });
  }, [prospeccaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (andamento?.prospeccao.estado !== "executando") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [andamento?.prospeccao.estado, carregar]);

  async function repetir() {
    if (!andamento || repetindo) return;
    setRepetindo(true);
    setErroRepetir(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: andamento.prospeccao.produtoId,
          icpId: andamento.prospeccao.icpId,
          modo: andamento.prospeccao.modo,
          criterios: andamento.prospeccao.criterios,
        }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroRepetir(lido.mensagem);
        setRepetindo(false);
        return;
      }
      const nova = (await r.json()) as Prospeccao;
      router.push(`/prospeccoes/${nova.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErroRepetir(lido.mensagem);
      setRepetindo(false);
    }
  }

  /** "Ver pessoas" de uma conta (US-017): abre uma nova prospecção no modo "Explorar uma empresa" já
   * preenchida com o que a conta encontrada trouxe — mesmo caminho de "Explorar uma empresa" (modo
   * `empresa_unica`) que a pessoa já usaria manualmente, sem inventar uma segunda tela. */
  async function verPessoas(conta: Conta) {
    if (!andamento || buscandoPessoasId) return;
    setBuscandoPessoasId(conta.id);
    setErroVerPessoas(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: andamento.prospeccao.produtoId,
          icpId: andamento.prospeccao.icpId,
          modo: "empresa_unica",
          criterios: { empresaNome: conta.nome, segmento: conta.setor ?? "", localizacao: conta.cidade ?? "", porte: conta.porte ?? "" },
        }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroVerPessoas(lido.mensagem);
        setBuscandoPessoasId(null);
        return;
      }
      const nova = (await r.json()) as Prospeccao;
      router.push(`/prospeccoes/${nova.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErroVerPessoas(lido.mensagem);
      setBuscandoPessoasId(null);
    }
  }

  async function cancelar() {
    if (cancelando) return;
    setCancelando(true);
    setErroCancelar(null);
    try {
      const r = await fetch(`/api/prospeccoes/${prospeccaoId}/cancelar`, { method: "POST" });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroCancelar(lido.mensagem);
        setCancelando(false);
        return;
      }
      const atualizada = (await r.json()) as Prospeccao;
      setAndamento((a) => (a ? { ...a, prospeccao: atualizada } : a));
    } catch (e) {
      const lido = await lerErro(e);
      setErroCancelar(lido.mensagem);
    } finally {
      setCancelando(false);
    }
  }

  async function apagar() {
    const ok = await confirmar("Apagar esta prospecção? As empresas, pessoas e abordagens encontradas aqui somem junto.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagando(true);
    await fetch(`/api/prospeccoes/${prospeccaoId}`, { method: "DELETE" });
    router.push("/prospeccoes");
  }

  /** "Apagar dados desta pessoa" (US-021, jornada B2C): apaga o lead e as abordagens dele por completo,
   * sem afetar mais ninguém da prospecção — diferente de "Apagar" (acima), que apaga a prospecção inteira. */
  async function apagarPessoa(leadId: string) {
    const ok = await confirmar("Apagar os dados desta pessoa? A ação não pode ser desfeita.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagandoPessoaId(leadId);
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    setAndamento((a) => (a ? { ...a, leads: a.leads.filter((l) => l.id !== leadId) } : a));
    setApagandoPessoaId(null);
  }

  const indiceEtapaAtual = andamento ? ETAPAS_PROSPECCAO.findIndex((e) => e.chave === andamento.prospeccao.etapa) : -1;

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[720px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        {naoEncontrada ? (
          <Aviso tom="danger" acao={{ rotulo: "Nova prospecção", url: "/prospeccoes/nova" }}>
            Esta prospecção não existe mais.
          </Aviso>
        ) : !andamento ? (
          <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full h-11" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1.5">
              <h1 className="titulo-painel !mb-0">Nova prospecção</h1>
              <button type="button" className="btn-link text-[13px] text-danger" onClick={apagar} disabled={apagando}>
                {apagando ? "Apagando…" : "Apagar"}
              </button>
            </div>
            <p className="apoio mb-6">
              {andamento.produtoNome} · {andamento.icpNome} · {ROTULO_MODO[andamento.prospeccao.modo]}
            </p>

            {(andamento.prospeccao.estado === "executando" || andamento.prospeccao.estado === "pronta") && (
              <div className="card p-6 flex flex-col gap-4 mb-4">
                <ol className="flex flex-col gap-3">
                  {ETAPAS_PROSPECCAO.map((etapa, i) => {
                    const concluida = andamento.prospeccao.estado === "pronta" || i < indiceEtapaAtual;
                    const atual = andamento.prospeccao.estado === "executando" && i === indiceEtapaAtual;
                    return (
                      <li key={etapa.chave} className="flex items-center gap-3">
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${
                            concluida ? "bg-ok text-white" : atual ? "border-2 border-accent" : "border-2 border-line"
                          }`}
                          aria-hidden="true"
                        >
                          {concluida ? "✓" : ""}
                        </span>
                        <span className={concluida ? "text-ink" : atual ? "text-ink font-semibold" : "text-muted"}>{etapa.rotulo}</span>
                        {atual && <span className="text-[12px] text-accent-ink" aria-live="polite">Em andamento…</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-[13px] text-muted">
                  {andamento.contasEncontradas} empresas · {andamento.leadsEncontrados} pessoas encontradas até agora
                </p>
              </div>
            )}

            {andamento.prospeccao.estado === "executando" && (
              <div className="flex flex-col gap-3">
                <button type="button" className="btn-ghost self-start !w-auto" onClick={cancelar} disabled={cancelando}>
                  {cancelando ? "Cancelando…" : "Cancelar"}
                </button>
                {erroCancelar && <Aviso tom="danger">{erroCancelar}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "pronta" && (
              <div className="flex flex-col gap-3">
                <p className="font-semibold text-[15px]">Prospecção concluída</p>
                {andamento.prospeccao.erro && <Aviso tom="warn">{andamento.prospeccao.erro}</Aviso>}
                <p className="text-[13px] text-muted">
                  {andamento.contasEncontradas} empresas e {andamento.leadsEncontrados} pessoas encontradas.
                </p>

                {andamento.prospeccao.modo === "empresas" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.contas.length === 0 ? (
                      <Aviso tom="warn">Nenhuma empresa encontrada com esses critérios.</Aviso>
                    ) : (
                      andamento.contas.map((conta) => (
                        <div key={conta.id} className="card p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="font-semibold text-[14px]">{conta.nome}</p>
                              <p className="text-[13px] text-muted">
                                {[conta.cidade, conta.porte].filter(Boolean).join(" · ") || "Cidade e porte não identificados"}
                              </p>
                            </div>
                            {conta.fit && <Chip nivel={conta.fit}>{ROTULO_FIT[conta.fit]}</Chip>}
                          </div>
                          {conta.sinais.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {conta.sinais.slice(0, 3).map((sinal, i) => (
                                <ChipSinal key={i} sinal={sinal} />
                              ))}
                            </div>
                          )}
                          <EvidenciasLista evidencias={conta.evidencias} />
                          <button
                            type="button"
                            className="btn-link text-[13px] self-start"
                            onClick={() => verPessoas(conta)}
                            disabled={buscandoPessoasId === conta.id}
                          >
                            {buscandoPessoasId === conta.id ? "Abrindo…" : "Ver pessoas"}
                          </button>
                        </div>
                      ))
                    )}
                    {erroVerPessoas && <Aviso tom="danger">{erroVerPessoas}</Aviso>}
                  </div>
                )}

                {andamento.prospeccao.modo === "pessoas" && andamento.jornada === "b2c" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    <Aviso tom="warn">Só entram dados que a própria pessoa publicou em perfil público; nada de lista comprada, inferência ou dado sensível.</Aviso>
                    {andamento.leads.length === 0 ? (
                      <Aviso tom="warn">Nenhuma pessoa encontrada com esses critérios.</Aviso>
                    ) : (
                      andamento.leads.map((lead) => (
                        <div key={lead.id} className="card p-4 flex flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="font-semibold text-[14px]">{lead.nome}</p>
                              <p className="text-[13px] text-muted">
                                {[lead.cargo, lead.cidade].filter(Boolean).join(" · ") || "Contexto não identificado"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {lead.fit && <Chip nivel={lead.fit}>{ROTULO_FIT[lead.fit]}</Chip>}
                              <Chip nivel="neutral">{ROTULO_STATUS_LEAD[lead.status]}</Chip>
                            </div>
                          </div>
                          {lead.sinais.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {lead.sinais.map((sinal, i) => (
                                <ChipSinal key={i} sinal={sinal} />
                              ))}
                            </div>
                          )}
                          {lead.evidencias.length > 0 && (
                            <div className="text-[12px] text-muted">
                              <p className="font-semibold text-ink text-[12px] mb-0.5">Como este dado chegou aqui</p>
                              <EvidenciasLista evidencias={lead.evidencias} />
                              <p className="mt-0.5">
                                {lead.fonte || "Fonte não identificada"} · {data(lead.criadoEm, { comAno: true })}
                              </p>
                            </div>
                          )}
                          <HipoteseDor hipotese={lead.hipotese} semSinal={lead.sinais.length === 0} />
                          <div className="flex items-center gap-3 flex-wrap">
                            {lead.linkedin && (
                              <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline">
                                Ver perfil
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn-link text-[12px] text-danger"
                              onClick={() => apagarPessoa(lead.id)}
                              disabled={apagandoPessoaId === lead.id}
                            >
                              {apagandoPessoaId === lead.id ? "Apagando…" : "Apagar dados desta pessoa"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {andamento.prospeccao.modo === "pessoas" && andamento.jornada === "b2b" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.leads.length === 0 ? (
                      <Aviso tom="warn">Nenhuma pessoa encontrada com esses critérios.</Aviso>
                    ) : (
                      andamento.leads.map((lead) => {
                        const rotuloPapel = ROTULO_PAPEL[lead.papel];
                        return (
                          <div key={lead.id} className="card p-4 flex flex-col gap-1.5">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-[14px]">{lead.nome}</p>
                                  {rotuloPapel && <Chip nivel="neutral">{rotuloPapel}</Chip>}
                                </div>
                                <p className="text-[13px] text-muted">
                                  {[lead.cargo, lead.empresa, lead.cidade].filter(Boolean).join(" · ") || "Dados não identificados"}
                                </p>
                              </div>
                              {lead.fit && <Chip nivel={lead.fit}>{ROTULO_FIT[lead.fit]}</Chip>}
                            </div>
                            <EvidenciasLista evidencias={lead.evidencias} />
                            <HipoteseDor hipotese={lead.hipotese} semSinal={lead.sinais.length === 0} />
                            <div className="flex items-center gap-3 flex-wrap">
                              {lead.linkedin && (
                                <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline">
                                  Ver perfil
                                </a>
                              )}
                              {lead.fonte && <span className="text-[12px] text-muted">{lead.fonte}</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {andamento.prospeccao.modo === "empresa_unica" && (
                  andamento.contas.length === 0 ? (
                    <Aviso tom="warn">Não encontramos essa empresa.</Aviso>
                  ) : (
                    <ExploracaoEmpresa
                      conta={andamento.contas[0]}
                      leads={andamento.leads}
                      prospeccaoId={prospeccaoId}
                      onLeadsAtualizados={(leads) => setAndamento((a) => (a ? { ...a, leads } : a))}
                    />
                  )
                )}

                {andamento.prospeccao.modo === "oportunidades" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.contas.length === 0 && andamento.leads.length === 0 ? (
                      <Aviso tom="warn">Nenhuma oportunidade encontrada com esses critérios.</Aviso>
                    ) : (
                      <>
                        {andamento.contas.map((conta) => (
                          <div key={conta.id} className="card p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <p className="font-semibold text-[14px]">{conta.nome}</p>
                                <p className="text-[13px] text-muted">{conta.setor || "Segmento não identificado"}</p>
                              </div>
                              {conta.fit && <Chip nivel={conta.fit}>{ROTULO_FIT[conta.fit]}</Chip>}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {conta.sinais.map((sinal, i) => (
                                <ChipSinal key={i} sinal={sinal} />
                              ))}
                            </div>
                            <EvidenciasLista evidencias={conta.evidencias} />
                          </div>
                        ))}
                        {andamento.leads.map((lead) => (
                          <div key={lead.id} className="card p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <p className="font-semibold text-[14px]">{lead.nome}</p>
                                <p className="text-[13px] text-muted">
                                  {[lead.cargo, lead.empresa, lead.cidade].filter(Boolean).join(" · ") || "Dados não identificados"}
                                </p>
                              </div>
                              {lead.fit && <Chip nivel={lead.fit}>{ROTULO_FIT[lead.fit]}</Chip>}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {lead.sinais.map((sinal, i) => (
                                <ChipSinal key={i} sinal={sinal} />
                              ))}
                            </div>
                            <EvidenciasLista evidencias={lead.evidencias} />
                            <HipoteseDor hipotese={lead.hipotese} semSinal={lead.sinais.length === 0} />
                            {lead.linkedin && (
                              <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline self-start">
                                Ver perfil
                              </a>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3.5">
                  <Link href="/leads" className="btn-link text-[13px]">Ver leads</Link>
                  <button type="button" className="btn-link text-[13px]" onClick={repetir} disabled={repetindo}>
                    {repetindo ? "Repetindo…" : "Repetir prospecção"}
                  </button>
                </div>
                {erroRepetir && <Aviso tom="danger">{erroRepetir}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "falhou" && (
              <div className="flex flex-col gap-3">
                <Aviso tom="danger" acao={{ rotulo: repetindo ? "Repetindo…" : "Repetir", onClick: repetir }}>
                  {andamento.prospeccao.erro ?? "Não foi possível concluir esta prospecção."}
                </Aviso>
                {erroRepetir && <Aviso tom="danger">{erroRepetir}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "cancelada" && (
              <Aviso tom="warn">Esta prospecção foi cancelada.</Aviso>
            )}
          </>
        )}
      </main>

      {Dialogo}
    </>
  );
}
