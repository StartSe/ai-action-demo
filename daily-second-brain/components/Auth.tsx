"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icons";
import { request } from "./client";
import { REGRA_SENHA } from "@/lib/conta-comum";
export function Auth({ create = false }: { create?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth">
      <div className="auth-visual">
        <div className="auth-orb">
          <Icon name="brain" size={80} />
        </div>
        <span className="eyebrow">DAILY SECOND BRAIN</span>
        <h1>
          Seu universo.
          <br />
          Novas conexões.
        </h1>
        <p>
          Guarde o que importa. Conecte o que sabe.
          <br />
          Descubra o que ainda não viu.
        </p>
        <div className="auth-pipeline">
          raw <Icon name="arrow" size={15} /> wiki{" "}
          <Icon name="arrow" size={15} /> outputs
        </div>
      </div>
      <div className="auth-form">
        <Link className="brand" href="/">
          <Icon name="brain" size={28} />
          <span>
            daily<small>SECOND BRAIN</small>
          </span>
        </Link>
        <h2>
          {create ? "Um lugar para sua mente." : "Sua memória espera por você."}
        </h2>
        <p>
          {create
            ? "Crie a conta que protege sua memória e suas conexões."
            : "Entre para continuar de onde suas ideias pararam."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await request(
                create ? "/api/conta" : "/api/conta/entrar",
                "POST",
                data,
              );
              window.location.assign(window.location.origin);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {create && (
            <label>
              Seu nome
              <input name="nome" autoComplete="name" required />
            </label>
          )}
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Senha
            <input
              name="senha"
              type="password"
              autoComplete={create ? "new-password" : "current-password"}
              required
            />
            {create && <small>{REGRA_SENHA}</small>}
          </label>
          {create && (
            <label>
              Confirmar senha
              <input
                name="confirmarSenha"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy
              ? "Preparando…"
              : create
                ? "Criar meu segundo cérebro"
                : "Entrar"}
            <Icon name="arrow" size={17} />
          </button>
        </form>
        <span className="privacy">
          <Icon name="shield" size={15} /> Sua memória, na sua própria
          instância.
        </span>
      </div>
    </main>
  );
}
