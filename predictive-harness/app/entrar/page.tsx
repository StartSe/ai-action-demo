"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Icon, ErrorBox, request } from "@/components/ui";
export default function Login() {
  const router = useRouter();
  const [exists, setExists] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ exists: boolean }>("/api/auth")
      .then((d) => setExists(d.exists))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">Seu estrategista de predições baseadas em dados</span>
          <h1>
            Transforme dados em predições.
            <br />
            <em>Planeje seu próximo movimento.</em>
          </h1>
          <p>Envie matrículas, custos e marketing, pergunte “e se abrirmos uma turma?” e veja a conta com premissas visíveis, a fórmula e cada decisão do caminho.</p>
          <div className="auth-flow">
            <span>Pergunta</span>
            <i />
            <div>
              <b>Triagem pelo Jev</b>
              <b>Conta no motor, com premissas</b>
              <b>Leitura pelo ChatGPT</b>
              <b>Verificação pelo Jev</b>
            </div>
          </div>
        </div>
        <small>Cowork Jev · IA para Executivos / StartSe</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="pill">
            <Icon name="spark" size={15} /> Decisões rápidas, respostas verificadas
          </span>
          <h2>{exists === false ? "Crie a conta desta instalação" : "Bem-vindo de volta"}</h2>
          <p>{exists === false ? "Uma conta administrativa por instalação. Depois, conecte ChatGPT e OpenRouter." : "Entre para continuar planejando com a sua base."}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await request("/api/auth", "POST", { name: f.get("name"), email: f.get("email"), password: f.get("password"), create: !exists });
                router.push("/");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {exists === false && (
              <label>
                Seu nome
                <input name="name" required autoComplete="name" placeholder="Como podemos chamar você?" />
              </label>
            )}
            <label>
              E-mail
              <input type="email" name="email" required autoComplete="email" placeholder="voce@empresa.com" />
            </label>
            <label>
              Senha
              <input type="password" name="password" required minLength={8} autoComplete={exists ? "current-password" : "new-password"} placeholder="Sua senha de acesso" />
            </label>
            {exists === false && <small>Mínimo de 8 caracteres, com maiúscula, minúscula, número e caractere especial.</small>}
            <ErrorBox error={error} />
            <button className="primary" disabled={busy || exists === null}>
              {busy ? "Entrando…" : exists ? "Entrar" : "Criar minha conta"}
            </button>
          </form>
          <small className="auth-note">Uma escola de negócios de exemplo já vem pronta. Conecte a IA quando quiser perguntar qualquer coisa.</small>
        </div>
      </section>
    </main>
  );
}
