"use client";
// Aviso das conversas de exemplo, único para as três telas que o mostram (Início, Conversas e
// Relatórios). Ele existe como componente para as três nunca divergirem: a política das conversas de
// exemplo é "aparecem sozinhas, somem sozinhas, não voltam" (ver CLAUDE.md, US-020), e a frase muda
// conforme o número da empresa já esteja conectado ou não.
//
// Com o número conectado, a demonstração continua na tela até o primeiro cliente escrever — é a
// primeira mensagem real que apaga os exemplos. Quem não quer esperar apaga por aqui, sem precisar
// procurar o mesmo link no cartão do WhatsApp em Configurações.
import { useState } from "react";
import { Aviso, useConfirmacao } from "./ui";
import {
  ACAO_CONECTAR_NUMERO,
  AVISO_CONVERSAS_EXEMPLO,
  AVISO_CONVERSAS_EXEMPLO_CONECTADO,
  CONFIRMAR_APAGAR_EXEMPLOS,
  ROTULO_APAGAR_EXEMPLOS,
} from "@/lib/demo";

export function AvisoConversasExemplo({ conectado, aoApagar }: { conectado: boolean; aoApagar: () => void }) {
  const [apagando, setApagando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const { confirmar, Dialogo } = useConfirmacao();

  async function apagar() {
    if (apagando) return;
    const confirmado = await confirmar(CONFIRMAR_APAGAR_EXEMPLOS, { confirmarRotulo: "Apagar", cancelarRotulo: "Manter" });
    if (!confirmado) return;
    setApagando(true);
    setFalhou(false);
    try {
      const r = await fetch("/api/conversas/exemplos", { method: "DELETE" });
      if (!r.ok) throw r;
      aoApagar();
    } catch {
      setFalhou(true);
    } finally {
      setApagando(false);
    }
  }

  if (!conectado) return <Aviso acao={ACAO_CONECTAR_NUMERO}>{AVISO_CONVERSAS_EXEMPLO}</Aviso>;

  return (
    <>
      <Aviso acao={{ rotulo: apagando ? "Apagando…" : ROTULO_APAGAR_EXEMPLOS, onClick: apagar }}>
        {AVISO_CONVERSAS_EXEMPLO_CONECTADO}
        {falhou && <span className="block mt-2">Não foi possível apagar agora. Tente de novo em alguns segundos.</span>}
      </Aviso>
      {Dialogo}
    </>
  );
}
