"use client";
// Diálogo do painel: cria o link público de coleta de respostas a partir do questionário em edição,
// com prazo e limite de respostas configuráveis, e mostra o link pronto para copiar. Antes de criar,
// avisa sobre o endereço (o link circula fora do app) e sobre o disco efêmero do plano gratuito (US-029).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, CopyButton, lerErro } from "./ui";
import type { ContextoAssessment, Questionario } from "@/lib/types";

type Props = {
  onFechar: () => void;
  aoCriar: () => void;
  questionario: Questionario;
  titulo: string;
  empresa: string;
  contexto?: ContextoAssessment;
  /** Render sem disco persistente: as respostas se perdem quando o app reinicia (GET /api/bussola/link). */
  discoEfemero: boolean;
};

type Fase = "form" | "gerando" | "pronto" | "erro";

function enderecoLocal(): boolean {
  return /^(localhost|127\.)/.test(location.hostname);
}

/** Só é montado enquanto o diálogo está aberto (ver app/page.tsx), para o estado nascer limpo a cada abertura. */
export function DialogoLinkAvaliacao({
  onFechar,
  aoCriar,
  questionario,
  titulo,
  empresa,
  contexto,
  discoEfemero,
}: Props) {
  const [expiraEmDias, setExpiraEmDias] = useState("30");
  const [limite, setLimite] = useState("50");
  const [fase, setFase] = useState<Fase>("form");
  const [link, setLink] = useState("");
  const [mensagemErro, setMensagemErro] = useState("");
  const caixaRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = caixaRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  function manterFoco(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab") return;
    const alvos = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
      ),
    );
    const primeiro = alvos[0],
      ultimo = alvos.at(-1);
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo?.focus();
    }
    if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro?.focus();
    }
  }

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setFase("gerando");
    try {
      const corpo = {
        ...contexto,
        questionario,
        titulo,
        empresa,
        expiraEmDias: Number(expiraEmDias),
        limite: limite === "sem-limite" ? null : Number(limite),
      };
      const r = await fetch("/api/bussola/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) {
        setMensagemErro((await lerErro(r)).mensagem);
        setFase("erro");
        return;
      }
      const resposta = (await r.json()) as { codigo: string; url?: string };
      // O servidor monta o endereço a partir do pedido (baseUrl), o mesmo que rotinas e e-mails vão usar.
      setLink(resposta.url || `${location.origin}/f/${resposta.codigo}`);
      setFase("pronto");
      aoCriar();
    } catch (err) {
      setMensagemErro((await lerErro(err)).mensagem);
      setFase("erro");
    }
  }

  return (
    <dialog
      ref={caixaRef}
      onKeyDown={manterFoco}
      onCancel={(e) => {
        e.preventDefault();
        if (fase !== "gerando") onFechar();
      }}
      aria-labelledby="titulo-link-avaliacao"
      className="assessment-dialog card w-[calc(100%-32px)] max-w-[480px] p-7 max-md:p-5 max-h-[92vh] overflow-y-auto m-auto"
    >
      <h2 id="titulo-link-avaliacao" className="text-xl font-extrabold mb-1.5">
        Criar link de avaliação
      </h2>
      <p className="text-muted text-sm mb-5">
        Quem abrir o link responde sem precisar entrar no app. Acompanhe a
        participação do grupo no painel de assessments.
      </p>

      {fase === "pronto" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">
              {link}
            </code>
            <CopyButton texto={() => link} rotulo="Copiar link" />
          </div>
          {enderecoLocal() ? (
            <Aviso tom="warn">
              Este endereço só abre neste computador. Para o time responder,
              publique o app e crie o link pelo endereço publicado.
            </Aviso>
          ) : (
            <p className="text-muted text-[12.5px]">
              O link usa o endereço pelo qual você abriu o app. Envie por e-mail
              ou mensagem ao time.
            </p>
          )}
          <button
            type="button"
            className="btn-ghost !w-auto self-start"
            onClick={onFechar}
          >
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={gerar}>
          <div className="flex flex-col gap-1.5 mb-4">
            <label
              htmlFor="expiraEmDiasLinkAvaliacao"
              className="text-[13px] font-semibold"
            >
              O link expira em
            </label>
            <select
              id="expiraEmDiasLinkAvaliacao"
              className="input"
              value={expiraEmDias}
              onChange={(e) => setExpiraEmDias(e.target.value)}
            >
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 mb-4">
            <label
              htmlFor="limiteLinkAvaliacao"
              className="text-[13px] font-semibold"
            >
              Limite de respostas
            </label>
            <select
              id="limiteLinkAvaliacao"
              className="input"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
            >
              <option value="10">10 respostas</option>
              <option value="50">50 respostas</option>
              <option value="200">200 respostas</option>
              <option value="sem-limite">Sem limite</option>
            </select>
          </div>

          {discoEfemero && (
            <div className="mb-4">
              <Aviso tom="warn">
                No plano gratuito sem disco, as respostas se perdem quando o app
                reinicia. Analise assim que chegarem ou peça à equipe técnica um
                disco em &ldquo;/app/data&rdquo;.
              </Aviso>
            </div>
          )}

          {fase === "erro" && (
            <div className="mb-4">
              <Aviso tom="danger">{mensagemErro}</Aviso>
            </div>
          )}
          <div className="flex gap-2.5">
            <button
              type="submit"
              className="btn-primary !w-auto flex-1"
              disabled={fase === "gerando"}
            >
              {fase === "gerando" ? "Gerando" : "Gerar link"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={fase === "gerando"}
              onClick={onFechar}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
