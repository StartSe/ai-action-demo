"use client";
// "Apagar os dados de exemplo", dentro do cartão da IA em Configurações (US-004).
//
// Fica ali, e não num cartão separado, porque é o mesmo assunto: o app nasce cheio justamente enquanto
// a IA não está conectada. Quem chega a este ponto da tela já entendeu que aquela vaga e aqueles
// candidatos são de mentira, e é aqui que ele decide começar do zero.
//
// Some por completo quando não há mais nada de exemplo — um botão que não faz nada é pior que
// nenhum botão. Os dois primeiros dados de verdade (a primeira vaga, o primeiro candidato) já tiram o
// exemplo de cena sozinhos, em lib/exemplos.ts; este botão é para quem quer a lista vazia antes disso.
import { useEffect, useState } from "react";
import { lerErro, useConfirmacao } from "./ui";

type Contagem = { vagas: number; candidatos: number; entrevistas: number };

function resumo(c: Contagem): string {
  const partes = [
    c.vagas === 1 ? "1 vaga" : `${c.vagas} vagas`,
    c.candidatos === 1 ? "1 candidato" : `${c.candidatos} candidatos`,
    c.entrevistas === 1 ? "1 entrevista" : `${c.entrevistas} entrevistas`,
  ];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

export function DadosDeExemplo() {
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [apagando, setApagando] = useState(false);
  const [falha, setFalha] = useState("");
  const { confirmar, Dialogo } = useConfirmacao();

  useEffect(() => {
    fetch("/api/exemplo")
      .then((r) => r.json())
      .then((d: { exemplos: Contagem }) => setContagem(d.exemplos))
      .catch(() => setContagem(null));
  }, []);

  async function apagar() {
    const ok = await confirmar("Apagar a vaga, os candidatos e as entrevistas de exemplo? As telas voltam vazias e isso não pode ser desfeito.", {
      confirmarRotulo: "Apagar",
    });
    if (!ok) return;
    setApagando(true);
    setFalha("");
    try {
      const r = await fetch("/api/exemplo", { method: "DELETE" });
      if (!r.ok) throw r;
      const d = (await r.json()) as { exemplos: Contagem };
      setContagem(d.exemplos);
    } catch (err) {
      setFalha((await lerErro(err)).mensagem);
    } finally {
      setApagando(false);
    }
  }

  if (!contagem || contagem.vagas + contagem.candidatos + contagem.entrevistas === 0) return null;

  return (
    <>
      <h3 className="text-sm font-bold mb-1">Dados de exemplo</h3>
      <p className="text-[13px] text-muted mb-3">
        O app começou com {resumo(contagem)} de mentira, para você ver as telas cheias. Some sozinho quando a primeira vaga ou o primeiro candidato de verdade for criado.
      </p>
      <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={apagar} disabled={apagando}>
        {apagando ? "Apagando" : "Apagar os dados de exemplo"}
      </button>
      {falha && <p className="mt-3 text-sm font-semibold text-danger">{falha}</p>}
      {Dialogo}
    </>
  );
}
