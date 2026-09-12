"use client";
// Volta da autorização do Trello: o token vem no fragmento da URL (#token=...), então a troca
// acontece aqui no navegador (o servidor nunca vê o fragmento) e é salva via PUT /api/setup.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Topbar, useStatus } from "@/components/ui";

export default function Page() {
  const { status, erro } = useStatus();
  const [mensagem, setMensagem] = useState("Concluindo a autorização com o Trello...");
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
      const token = new URLSearchParams(hash).get("token");
      if (!token) {
        setFalhou(true);
        setMensagem("Não recebemos o token do Trello. Tente autorizar novamente.");
        return;
      }
      fetch("/api/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores: { TRELLO_API_TOKEN: token } }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          location.replace("/setup?conectado=trello");
        })
        .catch(() => {
          setFalhou(true);
          setMensagem("Não foi possível salvar o token recebido do Trello.");
        });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Topbar marca="K" nome="Agente de Kanban" area="Gestão e RH" status={status} erro={erro} />
      <main className="max-w-[640px] mx-auto px-8 max-md:px-4 pt-14 pb-16 text-center">
        <div className="card p-8">
          <h1 className="text-xl font-bold mb-2">{falhou ? "Não deu certo" : "Autorizando..."}</h1>
          <p className="text-muted">{mensagem}</p>
          {falhou && (
            <Link href="/setup" className="btn-primary !w-auto inline-block mt-5">
              Voltar para a configuração
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
