"use client";
import { useState } from "react";
import { useConfirmacao } from "./ui";
export function DadosExemplo() {
  const { confirmar, Dialogo } = useConfirmacao();
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  async function remover() {
    if (!await confirmar("Remover os dados de exemplo? Seus dados reais e conexões serão preservados. Exemplos usados por treinos reais serão mantidos.", { confirmarRotulo: "Remover exemplos" })) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/setup/exemplos", { method: "DELETE" });
      if (!r.ok) throw new Error();
      setMensagem("Exemplos removidos. Eles não serão recriados ao reiniciar a aplicação.");
      window.dispatchEvent(new Event("configuracao-atualizada"));
    } catch { setMensagem("Não foi possível remover os exemplos. Tente novamente."); }
    finally { setOcupado(false); }
  }
  return <section id="dados" className="card p-5">
    <h2 className="font-bold mb-2">Dados de exemplo</h2>
    <p className="text-sm text-muted mb-4">Remova os produtos, treinos, pessoas e avaliações de demonstração. Dados reais, conexões e exemplos vinculados a treinos reais serão preservados.</p>
    <button className="btn-ghost !w-auto" disabled={ocupado} onClick={remover}>{ocupado ? "Removendo..." : "Remover dados de exemplo"}</button>
    {mensagem && <p role="status" className="text-sm mt-3">{mensagem}</p>}{Dialogo}
  </section>;
}
