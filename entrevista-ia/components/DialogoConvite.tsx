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
import { useDialogo } from "./useDialogo";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, CopyButton, ErrorBox, lerErro, useStatus, type ErroLido } from "./ui";
import type { Convite } from "@/lib/convite";

/** Os mesmos prazos que o servidor aceita (`PRAZOS_VALIDOS`, lib/convite.ts). A duplicação é
 * deliberada: importar o valor traria o banco para o pacote do navegador. */
const PRAZOS = [7, 15, 30];
const PRAZO_PADRAO = 15;

export function DialogoConvite({
  entrevistaId,
  reenviar = false,
  onFechar,
  onMudou,
}: {
  entrevistaId: string;
  /** Abrir já estendendo o prazo: é o "Reenviar convite" das tabelas. */
  reenviar?: boolean;
  onFechar: () => void;
  /** Chamado quando o prazo ou o estado da entrevista mudou, para a tela de trás se atualizar. */
  onMudou?: () => void;
}) {
  const { status } = useStatus();
  const [convite, setConvite] = useState<Convite | null>(null);
  const [prazo, setPrazo] = useState("");
  const [ocupado, setOcupado] = useState(true);
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



  // A abertura vai em corrente, e não `await`: a regra `react-hooks/set-state-in-effect` acusa
  // qualquer função que mexa em estado chamada no corpo de um efeito, mesmo assíncrona.
  useEffect(() => {
    const pedido = reenviar
      ? fetch(`/api/entrevistas/${entrevistaId}/convite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiraEmDias: PRAZO_PADRAO }),
        })
      : fetch(`/api/entrevistas/${entrevistaId}/convite`);
    pedido
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => {
        setConvite(corpo.convite);
        setOcupado(false);
        if (reenviar) aoMudar.current?.();
      })
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setOcupado(false);
      });
  }, [entrevistaId, reenviar]);

  /** Trocar o prazo reemite o convite: o link continua o mesmo enquanto ninguém o usou. */
  const trocarPrazo = useCallback(
    async (dias: number) => {
      setPrazo(String(dias));
      setOcupado(true);
      setErroTela(null);
      setRecado("");
      try {
        const r = await fetch(`/api/entrevistas/${entrevistaId}/convite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiraEmDias: dias }),
        });
        if (!r.ok) throw r;
        setConvite((await r.json()).convite);
        aoMudar.current?.();
      } catch (e) {
        setErroTela(await lerErro(e));
      } finally {
        setPrazo("");
        setOcupado(false);
      }
    },
    [entrevistaId],
  );

  async function enviarPorEmail() {
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
        <button type="button" aria-label="Fechar convite" className="btn-link float-right ml-3" onClick={onFechar}>Fechar</button>
        <h2 id="titulo-convite" className="text-xl font-extrabold mb-1.5">
          {convite ? `Convite de ${convite.candidatoNome}` : "Convite do candidato"}
        </h2>
        <p className="text-muted text-sm mb-5">
          {convite
            ? `Mande este link para ${convite.candidatoNome} conversar com a entrevistadora sobre a vaga de ${convite.cargo}, no horário que preferir.`
            : "Preparando o convite..."}
        </p>

        {erroTela && <div className="mb-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {convite && (
          <div className="flex flex-col gap-4">
            {status?.demo && (
              <Aviso tom="warn">A IA ainda está em demonstração. <Link href="/setup#openrouter" className="underline font-semibold">Configure a IA</Link> antes de enviar este convite para uma entrevista real.</Aviso>
            )}
            <label htmlFor="link-convite" className="text-sm font-semibold">Link exclusivo do candidato</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input id="link-convite" className="input flex-1 min-w-0" readOnly value={convite.link} onFocus={(evento) => evento.currentTarget.select()} />
              <CopyButton texto={() => convite.link} rotulo="Copiar link" disabled={ocupado} />
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <CopyButton texto={() => convite.mensagem} rotulo="Copiar convite" disabled={ocupado} />
              {convite.podeEnviarPorEmail && (
                <button type="button" className="btn-ghost !w-auto" disabled={enviando || ocupado} onClick={() => void enviarPorEmail()}>
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="convite-prazo" className="text-[13px] font-semibold">Renovar validade a partir de hoje</label>
              <select
                id="convite-prazo"
                className="input"
                value={prazo}
                disabled={ocupado}
                onChange={(e) => void trocarPrazo(Number(e.target.value))}
              >
                <option value="">Escolher novo prazo</option>
                {PRAZOS.map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
              <span className="text-[12.5px] text-muted">{convite.expiraEm ? `Válido até ${new Date(convite.expiraEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. ` : ""}Exclusivo para uma conversa com este candidato.</span>
            </div>

            <p className="text-sm text-muted">Depois de compartilhar, acompanhe a resposta em <Link href={`/entrevistas/${entrevistaId}`} className="btn-link">Ver entrevista</Link>.</p>
            {recado && <Aviso tom="ok">{recado}</Aviso>}

            <button type="button" className="btn-ghost !w-auto self-start" onClick={onFechar}>Fechar</button>
          </div>
        )}

        {!convite && !erroTela && <p className="text-muted text-sm">Carregando...</p>}
        {!convite && erroTela && (
          <button type="button" className="btn-ghost !w-auto" onClick={onFechar}>Fechar</button>
        )}
      </div>
    </div>
  );
}
