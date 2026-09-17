import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  orgId: string;
};

async function getSessionUser(): Promise<SessionUser | null> {
  // headers() antes de getAuth(): marca a rota como dinâmica no prerender
  // do build, que não deve abrir o arquivo SQLite
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
  });
  const user = session?.user as unknown as SessionUser | undefined;
  return user?.orgId ? user : null;
}

/**
 * Valida a sessão no servidor e retorna o usuário com sua org. Conta única
 * do Pocket (US-009): sem gate de beta fechado nem de aceite de política —
 * só sessão válida. Redireciona para /login quando não há sessão.
 */
export async function requireSession(): Promise<{ user: SessionUser }> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return { user };
}

/**
 * Autenticação das rotas de API de produto: 401 sem sessão. As rotas
 * públicas por chave de API (/api/v1, /api/mcp) não passam por aqui.
 */
export async function getApiUser(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      ),
    };
  }
  return { ok: true, user };
}
