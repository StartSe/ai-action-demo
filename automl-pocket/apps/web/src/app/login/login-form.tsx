"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/auth/logo";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        // 5xx ou resposta sem status = servidor fora do ar, não credencial errada
        const connectionFailure = !error.status || error.status >= 500;
        setError(
          connectionFailure
            ? "Não foi possível conectar ao servidor. Tente novamente."
            : "Email ou senha inválidos.",
        );
        return;
      }
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
      return;
    } finally {
      setLoading(false);
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-8 text-center">
          <Logo />

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
            <p className="text-sm text-muted-foreground">
              Use o e-mail e a senha definidos no primeiro acesso.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="voce@empresa.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
