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
          <span className="eyebrow">Um espaço para pensar melhor</span>
          <h1>
            Menos informação solta.
            <br />
            <em>Mais ideias conectadas.</em>
          </h1>
          <p>
            Transforme o que você lê e assiste em conhecimento que faz sentido.
          </p>
          <div className="auth-map">
            <span>Conhecimento</span>
            <i />
            <div>
              <b>Explore</b>
              <b>Conecte</b>
              <b>Coloque em prática</b>
            </div>
          </div>
        </div>
        <small>Mapia · IA para Executivos / StartSe</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="pill">
            <Icon name="spark" size={15} /> Seu próximo insight começa aqui
          </span>
          <h2>
            {exists === false
              ? "Crie seu espaço de ideias"
              : "Bem-vindo de volta"}
          </h2>
          <p>
            {exists === false
              ? "Crie a conta de acesso desta instalação do Mapia."
              : "Entre para continuar explorando seus mapas."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await request("/api/auth", "POST", {
                  name: f.get("name"),
                  email: f.get("email"),
                  password: f.get("password"),
                  create: !exists,
                });
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
                <input
                  name="name"
                  required
                  autoComplete="name"
                  placeholder="Como podemos chamar você?"
                />
              </label>
            )}
            <label>
              E-mail
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com"
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete={exists ? "current-password" : "new-password"}
                placeholder="Sua senha de acesso"
              />
            </label>
            {exists === false && (
              <small>
                Mínimo de 8 caracteres, com maiúscula, minúscula, número e
                caractere especial.
              </small>
            )}
            <ErrorBox error={error} />
            <button className="primary" disabled={busy || exists === null}>
              {busy
                ? "Entrando…"
                : exists
                  ? "Entrar no Mapia"
                  : "Criar minha conta"}
            </button>
          </form>
          <small className="auth-note">
            Conecte sua IA depois de entrar. Você pode explorar um mapa de
            exemplo primeiro.
          </small>
        </div>
      </section>
    </main>
  );
}
