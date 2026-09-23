"use client";
// O convite do candidato (US-014): o link da conversa, a mensagem pronta e o envio por e-mail.
//
// Aparece nos três lugares que falam da mesma entrevista — a página da vaga, a página do candidato e
// (mais adiante) a lista de Entrevistas —, sempre com o mesmo texto: a pessoa de RH não pode mandar
// uma promessa numa tela e outra na seguinte. Quem escreve a mensagem é o servidor (lib/convite.ts),
// porque o envio por e-mail manda exatamente o mesmo texto.
//
// Só é montado enquanto está aberto, então o estado nasce limpo a cada abertura.
import Link from "next/link";
import { ProgressoConvite, usePrepararConvite } from "./ProgressoConvite";
import { useDialogo } from "./useDialogo";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, CopyButton, ErrorBox, lerErro, useStatus, type ErroLido } from "./ui";
import type { Convite } from "@/lib/convite";
import { PRAZOS_VALIDOS, PRAZO_PADRAO, dataParaCampo, dataDoPrazo, periodoPadrao, validarPeriodo, type PeriodoConvite } from "@/lib/prazo-convite";

export function DialogoConvite({
  entrevistaId,
  reenviar = false,
  onFechar,
  onMudou,
}: {
  entrevistaId: string;
  /** Renova automaticamente apenas convites vencidos; reenvios preservam o período salvo. */
  reenviar?: boolean;
  onFechar: () => void;
  /** Chamado quando o prazo ou o estado da entrevista mudou, para a tela de trás se atualizar. */
  onMudou?: () => void;
}) {
  const { status } = useStatus();
  const [convite, setConvite] = useState<Convite | null>(null);
  const { progresso, preparar } = usePrepararConvite();
  const [semConvite, setSemConvite] = useState(false);
  const [prazo, setPrazo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [ocupado, setOcupado] = useState(true);
  const [erroEnvio, setErroEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  useDialogo(caixaRef, onFechar);

  // `onMudou` entra por referência, e não na lista de dependências: um pai que passe uma função nova
  // a cada render faria o efeito de abertura reenviar o convite de novo a cada render.
  const aoMudar = useRef(onMudou);
  useEffect(() => {
    aoMudar.current = onMudou;
  }, [onMudou]);



  const carregar = useCallback(async (gerar = false, dias = PRAZO_PADRAO, periodo?: PeriodoConvite) => {
    setOcupado(true); setErroTela(null); setErroEnvio(false); setRecado("");
    try {
      let corpo: { convite: Convite };
      let mudou = gerar;
      if (gerar) {
        corpo = await preparar<{ convite: Convite }>(`/api/entrevistas/${entrevistaId}/convite`, periodo ?? { expiraEmDias: dias });
      } else {
        const r = await fetch(`/api/entrevistas/${entrevistaId}/convite`, { signal: AbortSignal.timeout(15000) });
        setSemConvite(r.status === 409);
        if (!r.ok) throw r;
        corpo = await r.json();
        if (reenviar && corpo.convite.status === "expirada") {
          corpo = await preparar<{ convite: Convite }>(`/api/entrevistas/${entrevistaId}/convite`, { expiraEmDias: dias });
          mudou = true;
        }
      }
      setConvite(corpo.convite); setSemConvite(false);
      const padrao = periodoPadrao();
      setInicio(dataParaCampo(corpo.convite.iniciaEm ?? padrao.iniciaEm));
      setFim(dataParaCampo(corpo.convite.expiraEm ?? padrao.expiraEm));
      if (mudou) aoMudar.current?.();
    } catch (e) { setErroTela(await lerErro(e)); }
    finally { setOcupado(false); setPrazo(""); }
  }, [entrevistaId, reenviar, preparar]);

  useEffect(() => {
    const inicio = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(inicio);
  }, [carregar]);

  function trocarPrazo(dias: number) {
    setPrazo(String(dias));
    void carregar(true, dias);
  }

  async function salvarPeriodo() {
    try {
      const periodo = validarPeriodo({ iniciaEm: new Date(inicio).toISOString(), expiraEm: new Date(fim).toISOString() });
      await carregar(true, PRAZO_PADRAO, periodo);
    } catch (e) { setErroTela(await lerErro(e)); }
  }

  const podeEditarPeriodo = convite && ["convidada", "aberta", "expirada"].includes(convite.status);
  const periodoAlterado = Boolean(convite && podeEditarPeriodo && (
    !convite.iniciaEm || !convite.expiraEm || inicio !== dataParaCampo(convite.iniciaEm) || fim !== dataParaCampo(convite.expiraEm)
  ));

  async function enviarPorEmail() {
    setErroEnvio(true);
    setEnviando(true);
    setErroTela(null);
    setRecado("");
    try {
      const r = await fetch(`/api/entrevistas/${entrevistaId}/convite/email`, { method: "POST" });
      if (!r.ok) throw r;
      const corpo = await r.json();
      setRecado(corpo.mensagem || "Convite enviado.");
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 py-6 overflow-y-auto" role="presentation">
      <div ref={caixaRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="titulo-convite" className="card w-full max-w-[520px] p-7 max-md:p-5 max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <p className="sobretitulo mb-2">Compartilhar entrevista</p>
        <button type="button" aria-label="Fechar convite" className="btn-link float-right ml-3 sticky top-0 bg-white" onClick={onFechar}>Fechar</button>
        <h2 id="titulo-convite" className="text-xl font-extrabold mb-1.5">
          {convite ? `Convite de ${convite.candidatoNome}` : "Convite do candidato"}
        </h2>
        <p className="text-muted text-sm mb-5">
          {convite
            ? `Mande este link para ${convite.candidatoNome} conversar com a entrevistadora sobre a vaga de ${convite.cargo}, no horário que preferir.`
            : ocupado ? "Preparando seu convite. Acompanhe abaixo." : "Gere ou recupere o link sem refazer o cadastro."}
        </p>

        <ProgressoConvite estado={progresso} />
        {erroTela && <div className="mb-4"><ErrorBox mensagem={erroTela.mensagem} codigo={erroTela.codigo} acao={erroTela.acao} /></div>}

        {convite && (
          <div className="flex flex-col gap-4">
            {status?.demo && (
              <Aviso tom="warn">A IA ainda está em demonstração. <Link href="/setup#openrouter" className="underline font-semibold">Configure a IA</Link> antes de enviar este convite para uma entrevista real.</Aviso>
            )}
            <label htmlFor="link-convite" className="text-sm font-semibold">Link exclusivo do candidato</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input id="link-convite" className="input flex-1 min-w-0" readOnly value={convite.link} onFocus={(evento) => evento.currentTarget.select()} />
              <CopyButton texto={() => convite.link} rotulo="Copiar link" disabled={ocupado || periodoAlterado} />
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <CopyButton texto={() => convite.mensagem} rotulo="Copiar convite" disabled={ocupado || periodoAlterado} />
              {convite.podeEnviarPorEmail && (
                <button type="button" className="btn-ghost !w-auto" disabled={enviando || ocupado || periodoAlterado} onClick={() => void enviarPorEmail()}>
                  {enviando ? "Enviando..." : "Enviar por e-mail"}
                </button>
              )}
              <span className="text-muted text-[12.5px]">
                {convite.candidatoEmail && !convite.podeEnviarPorEmail
                  ? "Copie a mensagem e envie pelo seu e-mail ou WhatsApp."
                  : "A mensagem já explica o que esperar da conversa."}
              </span>
            </div>

            <details className="border border-line rounded-card px-3.5 py-2.5">
              <summary className="text-[13px] font-semibold cursor-pointer">Ver a mensagem</summary>
              <p className="text-sm whitespace-pre-line mt-2.5 text-muted">{convite.mensagem}</p>
            </details>

            {podeEditarPeriodo ? <form className="flex flex-col gap-3 border border-line rounded-card p-3.5" onSubmit={(e) => { e.preventDefault(); void salvarPeriodo(); }}>
              <p className="text-sm font-semibold">Período da entrevista</p>
              <p className="text-[12.5px] text-muted">Por padrão, começa hoje e termina em 7 dias. Datas e horários no fuso do seu dispositivo.</p>
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
                <label className="text-[13px] font-semibold" htmlFor="convite-inicio">Início
                  <input id="convite-inicio" className="input mt-1" type="datetime-local" required value={inicio} disabled={ocupado || enviando} onChange={(e) => setInicio(e.target.value)} />
                </label>
                <label className="text-[13px] font-semibold" htmlFor="convite-fim">Fim
                  <input id="convite-fim" className="input mt-1" type="datetime-local" required min={inicio} value={fim} disabled={ocupado || enviando} onChange={(e) => setFim(e.target.value)} />
                </label>
              </div>
              <button type="submit" className="btn-ghost !w-auto self-start" disabled={ocupado || enviando || !periodoAlterado}>{ocupado ? "Salvando…" : "Salvar período"}</button>
              {periodoAlterado && <p role="status" className="text-[12.5px] text-muted">Salve o período antes de compartilhar o convite.</p>}
              <label htmlFor="convite-prazo" className="text-[13px] font-semibold">Renovar validade a partir de hoje</label>
              <select
                id="convite-prazo"
                className="input"
                value={prazo}
                disabled={ocupado || enviando}
                onChange={(e) => void trocarPrazo(Number(e.target.value))}
              >
                <option value="">Escolher novo prazo</option>
                {PRAZOS_VALIDOS.map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
              <span className="text-[12.5px] text-muted">Exclusivo para uma conversa com este candidato.</span>
            </form> : <p className="text-[13px] text-muted">O período não pode ser alterado depois de iniciar ou cancelar a entrevista.</p>}
            {convite.iniciaEm && convite.expiraEm && <p className="text-[12.5px] text-muted">Período salvo: de {dataDoPrazo(convite.iniciaEm)} até {dataDoPrazo(convite.expiraEm)} (horário de Brasília).</p>}

            <p className="text-sm text-muted">Depois de compartilhar, acompanhe a resposta em <Link href={`/entrevistas/${entrevistaId}`} className="btn-link">Ver entrevista</Link>.</p>
            {recado && <Aviso tom="ok">{recado}</Aviso>}

            <button type="button" className="btn-ghost !w-auto self-start" onClick={onFechar}>Fechar</button>
          </div>
        )}

        {!convite && ocupado && !progresso && <p role="status" className="text-muted text-sm">Buscando o convite salvo…</p>}
        {erroTela && !ocupado && !erroEnvio && (
          <div className="flex gap-3 flex-wrap">
            <button type="button" className="btn-primary !w-auto" onClick={() => void carregar(semConvite || reenviar || Boolean(progresso))}>{semConvite ? "Gerar link da entrevista" : "Tentar novamente"}</button>
            {!convite && <button type="button" className="btn-ghost !w-auto" onClick={onFechar}>Fechar</button>}
          </div>
        )}
      </div>
    </div>
  );
}
