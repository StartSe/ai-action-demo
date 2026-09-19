"use client";
// "Colar uma descrição pronta", no topo de `/vagas/nova` (US-006).
//
// Quem abre uma vaga quase nunca começa do zero: a descrição já existe num documento, num e-mail ou
// no anúncio que foi publicado. Este bloco lê esse texto e preenche o formulário abaixo — o gestor
// revisa e salva, como se tivesse digitado.
//
// Ele NÃO salva nada e não é dono de nenhum campo: devolve a vaga lida por `onPreencher` e quem
// manda no formulário continua sendo a tela (`app/vagas/nova/page.tsx`). É o que permite a pessoa
// colar a descrição, editar o que a IA entendeu errado e colar outra por cima sem perder o resto.
import { useState } from "react";
import type { VagaEstruturada } from "./FormularioVaga";
import { Aviso, ErrorBox, Loading, lerErro, type ErroLido } from "./ui";
import type { CodigoErroIA } from "@/lib/ai";
import { ACAO_IA } from "@/lib/acoes";

/** O mesmo teto do prompt em `app/api/vagas/estruturar/route.ts`. */
const LIMITE_COLADO = 8000;

/** Abaixo disso é um título, não uma descrição: o botão fica desligado e o servidor recusa igual. */
const MINIMO_COLADO = 80;

const ETAPAS = ["Lendo a descrição...", "Separando requisitos e desafios...", "Escolhendo competências culturais..."];

export function DescricaoColada({ onPreencher }: { onPreencher: (vaga: VagaEstruturada) => void }) {
  const [texto, setTexto] = useState("");
  const [lendo, setLendo] = useState(false);
  const [falha, setFalha] = useState<ErroLido | null>(null);
  const [preenchido, setPreenchido] = useState<"ia" | "demo" | null>(null);

  async function preencher() {
    setLendo(true);
    setFalha(null);
    setPreenchido(null);
    try {
      const r = await fetch("/api/vagas/estruturar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!r.ok) throw r;
      const corpo = (await r.json()) as { vaga: VagaEstruturada; demo: boolean };
      onPreencher(corpo.vaga);
      setPreenchido(corpo.demo ? "demo" : "ia");
    } catch (err) {
      setFalha(await lerErro(err));
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="mb-6 pb-5 border-b border-line">
      <h2 className="font-bold text-[14px] mb-0.5">Colar uma descrição pronta</h2>
      <p className="text-muted text-[12.5px] mb-2.5">
        Já tem a vaga escrita em algum lugar? Cole aqui e a IA separa cargo, requisitos e desafios nos campos abaixo. Nada é salvo antes de você
        revisar.
      </p>

      {lendo ? (
        <Loading etapas={ETAPAS} />
      ) : (
        <>
          <textarea
            id="vaga-descricao"
            className="input min-h-28 resize-y"
            maxLength={LIMITE_COLADO}
            value={texto}
            placeholder="Cole aqui a descrição da vaga, com requisitos, responsabilidades e o que mais estiver escrito."
            aria-label="Descrição pronta da vaga"
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex items-center gap-3 flex-wrap mt-2.5">
            <button
              type="button"
              className="btn-secundario !w-auto max-md:!w-full"
              disabled={texto.trim().length < MINIMO_COLADO}
              onClick={() => void preencher()}
            >
              Preencher a vaga
            </button>
            {preenchido === "ia" && <span className="text-muted text-[13px]">Pronto. Revise campo a campo: o que não estava na descrição ficou em branco.</span>}
          </div>
        </>
      )}

      {preenchido === "demo" && (
        <div className="mt-3">
          <Aviso tom="warn" acao={ACAO_IA}>
            A IA ainda não está conectada, então preenchemos com uma vaga de exemplo em vez de ler a sua descrição. Conecte para valer a sua.
          </Aviso>
        </div>
      )}

      {falha && (
        <div className="mt-3">
          <ErrorBox mensagem={falha.mensagem} codigo={falha.codigo as CodigoErroIA | undefined} acao={falha.acao} onTentarNovamente={() => void preencher()} />
        </div>
      )}
    </div>
  );
}
