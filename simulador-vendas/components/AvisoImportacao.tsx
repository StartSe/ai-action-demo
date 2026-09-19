"use client";
import { useEffect, useState } from "react";
import { Aviso } from "./ui";
export function AvisoImportacao({ id }: { id: string }) {
  const [mensagem, setMensagem] = useState("");
  useEffect(() => {
    const aviso = sessionStorage.getItem(`importacao-${id}`);
    if (aviso) { queueMicrotask(() => setMensagem(aviso)); sessionStorage.removeItem(`importacao-${id}`); }
  }, [id]);
  return mensagem ? <div className="mb-4"><Aviso>{mensagem}</Aviso></div> : null;
}
