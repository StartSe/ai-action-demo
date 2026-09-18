"use client";
// O convite do candidato (US-014): o link da conversa, a mensagem pronta e o envio por e-mail.
//
// Aparece nos três lugares que falam da mesma entrevista — a página da vaga, a página do candidato e
// (mais adiante) a lista de Entrevistas —, sempre com o mesmo texto: a pessoa de RH não pode mandar
// uma promessa numa tela e outra na seguinte. Quem escreve a mensagem é o servidor (lib/convite.ts),
// porque o envio por e-mail manda exatamente o mesmo texto.
//
// Só é montado enquanto está aberto, então o estado nasce limpo a cada abertura.
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, CopyButton, ErrorBox, lerErro, type ErroLido } from "./ui";
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
  const [convite, setConvite] = useState<Convite | null>(null);
  const [prazo, setPrazo] = useState(PRAZO_PADRAO);
  const [ocupado, setOcupado] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  // `onMudou` entra por referência, e não na lista de dependências: um pai que passe uma função nova
  // a cada render faria o efeito de abertura reenviar o convite de novo a cada render.
  const aoMudar = useRef(onMudou);
  useEffect(() => {
    aoMudar.current = onMudou;
  }, [onMudou]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    function onClickFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) onFechar();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [onFechar]);

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
      setPrazo(dias);
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
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-convite" className="card w-full max-w-[520px] p-7 max-md:p-5">
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
            <div className="flex items-center gap-2 flex-wrap">
              <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{convite.link}</code>
              <CopyButton texto={() => convite.link} rotulo="Copiar link" />
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <CopyButton texto={() => convite.mensagem} rotulo="Copiar convite" />
              {convite.podeEnviarPorEmail && (
                <button type="button" className="btn-ghost !w-auto" disabled={enviando || ocupado} onClick={() => void enviarPorEmail()}>
                  {enviando ? "Enviando..." : "Enviar por e-mail"}
                </button>
              )}
              <span className="text-muted text-[12.5px]">
                {convite.candidatoEmail && !convite.podeEnviarPorEmail
                  ? "Conecte um e-mail em Configurações para enviar daqui."
                  : "A mensagem já explica o que esperar da conversa."}
              </span>
            </div>

            <details className="border border-line rounded-card px-3.5 py-2.5">
              <summary className="text-[13px] font-semibold cursor-pointer">Ver a mensagem</summary>
              <p className="text-sm whitespace-pre-line mt-2.5 text-muted">{convite.mensagem}</p>
            </details>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="convite-prazo" className="text-[13px] font-semibold">O convite vale por</label>
              <select
                id="convite-prazo"
                className="input"
                value={prazo}
                disabled={ocupado}
                onChange={(e) => void trocarPrazo(Number(e.target.value))}
              >
                {PRAZOS.map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
              <span className="text-[12.5px] text-muted">Vale para uma conversa só; depois do prazo o link deixa de abrir.</span>
            </div>

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
