"use client";
// Retorno do "Conectar com a Netlify": a chave chega no fragmento da URL (#access_token=...&state=...), que só o
// navegador enxerga. A página grava a chave via PUT /api/setup e volta para Configurações com o aviso. Exige a
// sessão da conta (não está na lista pública de proxy.ts): quem chega aqui veio de /setup, já autenticado.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Page() {
  const router = useRouter();
  const [erro, setErro] = useState("");

  useEffect(() => {
    const parametros = new URLSearchParams(location.hash.replace(/^#/, ""));
    const chave = parametros.get("access_token");
    const state = parametros.get("state") ?? "";
    const esperado = /(?:^|; )netlify_state=([^;]+)/.exec(document.cookie)?.[1] ?? "";
    const t = setTimeout(() => {
      if (!chave) { setErro("A Netlify não devolveu a chave. Tente de novo ou cole uma chave de acesso pessoal."); return; }
      // O cookie de state é HttpOnly (a página não o lê): a conferência fica a cargo do valor devolvido não estar vazio.
      if (!state || (esperado && esperado !== state)) { setErro("A resposta da Netlify não corresponde ao pedido iniciado aqui. Tente de novo."); return; }
      fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores: { NETLIFY_ACCESS_TOKEN: chave } }) })
        .then((r) => { if (!r.ok) throw new Error(); router.replace("/setup?conectado=netlify"); })
        .catch(() => setErro("Não foi possível guardar a chave. Tente de novo."));
    }, 0);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="max-w-[560px] mx-auto px-8 max-md:px-4 py-16 text-center">
      {erro ? (
        <>
          <h1 className="text-xl font-bold mb-2">Não deu certo</h1>
          <p className="text-ink-2 mb-4">{erro}</p>
          <a className="btn-primary !w-auto" href="/setup#netlify">Voltar para Configurações</a>
        </>
      ) : (
        <p className="text-muted" role="status">Guardando a conexão com a Netlify...</p>
      )}
    </main>
  );
}
