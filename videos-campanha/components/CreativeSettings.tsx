"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CartaoIntegracao } from "./setup";
import type { IntegracaoStatus } from "@/lib/setup-comum";

type Settings = {
  integracoes: IntegracaoStatus[];
  demo: boolean;
};

export default function CreativeSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/setup");
      if (!response.ok) throw new Error("Não foi possível carregar as configurações.");
      setData(await response.json());
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      const params = new URLSearchParams(window.location.search);
      if (params.get("conectado")) setNotice("Conta autorizada. A conexão foi salva.");
      if (params.get("erro")) setNotice(params.get("erro")!);
      if (params.has("conectado") || params.has("erro")) history.replaceState(null, "", "/setup" + location.hash);
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const providers = ["muapi", "higgsfield"].map((id) => data?.integracoes.find((i) => i.id === id)).filter((i): i is IntegracaoStatus => Boolean(i));
  return (
    <div className="cf-app cf-settings">
      <header className="cf-top">
        <Link href="/" className="cf-brand"><span>V</span><div><strong>Vídeos de Campanha</strong><small>Creative Flow</small></div></Link>
        <nav aria-label="Navegação principal"><Link href="/">Fluxos</Link><Link href="/?view=assets">Assets</Link><Link className="active" href="/setup" aria-current="page">Configurações</Link></nav>
        {data?.demo && <span className="cf-demo-badge">✧ Modo demonstração</span>}
      </header>
      <main className="cf-settings-main">
        <div className="cf-heading"><div><p className="cf-eyebrow">SEU ESPAÇO DE CRIAÇÃO</p><h1>Configurações</h1><p>Conecte suas contas e escolha como criar.</p></div></div>
        {notice && <div className="cf-settings-notice" role="status">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button></div>}
        {error && <div className="cf-settings-notice" role="alert">{error}<button onClick={() => void load()}>Tentar novamente</button></div>}
        {!data && !error && <p role="status" className="cf-muted">Carregando configurações…</p>}
        {data && <>
          <section className={`cf-mode-panel ${data.demo ? "is-demo" : "is-connected"}`}>
            <span aria-hidden="true">{data.demo ? "✧" : "✓"}</span>
            <div><h2>{data.demo ? "Modo demonstração" : "Conexão configurada"}</h2><p>{data.demo ? "Explore as receitas, monte ramificações e salve seus projetos. Conecte MuAPI ou autorize Higgsfield quando quiser começar a usar sua conta." : "Suas contas ficam centralizadas aqui. Cada geração usa a conexão correspondente ao modelo escolhido."}</p></div>
            <Link href="/" className="cf-secondary">{data.demo ? "Explorar demonstração" : "Abrir meus fluxos"} ↗</Link>
          </section>
          <div className="cf-settings-section"><div><h2>Conexões de geração</h2><p>Escolha uma para sair do modo demonstração. Você pode conectar as duas.</p></div><span>Chaves protegidas no servidor</span></div>
          <div className="cf-provider-grid">{providers.map((integration, index) => <div className="cf-provider" key={integration.id}>
            <p className="cf-provider-method">{integration.id === "muapi" ? "CHAVE DE API" : "AUTORIZAÇÃO DA CONTA"}</p>
            <CartaoIntegracao integracao={integration} numero={index + 1} aoSalvar={() => void load()} />
            <p className="cf-provider-note">{integration.id === "muapi" ? "Imagens e vídeos com Nano Banana, Veo, Wan e Kling. As gerações utilizam o saldo MuAPI." : "Entre no Higgsfield para autorizar sua conta. A geração com modelos Higgsfield no editor ainda está em integração; autorizar não libera o Seedance nos blocos por enquanto."}</p>
          </div>)}</div>
          {data.integracoes.filter((i) => i.id === "openrouter").map((integration) => <section key={integration.id}>
            <div className="cf-settings-section"><div><h2>Melhoria de prompts com IA</h2><p>A varinha usa seu prompt, a ideia e as imagens conectadas. Configure um modelo de visão para considerar as referências.</p></div></div>
            <CartaoIntegracao integracao={{ ...integration, beneficio: "Melhora prompts com o contexto e as imagens do fluxo" }} numero={3} aoSalvar={() => void load()} />
          </section>)}
          <footer className="cf-settings-footer">As credenciais ficam cifradas no servidor. Valores definidos no ambiente têm prioridade sobre os salvos nesta tela.</footer>
        </>}
      </main>
    </div>
  );
}
