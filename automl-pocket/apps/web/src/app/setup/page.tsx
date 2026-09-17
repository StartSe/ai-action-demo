import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { hasAccount } from "@/lib/setup-state";

import { SetupForm } from "./setup-form";

// Tela de primeiro acesso (PRD "primeiro acesso e envs", US-003): só existe
// enquanto não há conta. Com sessão válida vai para /projects; sem sessão mas
// com a conta já criada vai para /login. A decisão fica neste server
// component (o proxy edge não abre o SQLite) e `hasAccount()` não tem cache,
// então a página some assim que `completeSetup` cria a conta.
export default async function SetupPage() {
  // headers() antes de getAuth(): marca a rota como dinâmica no prerender
  // do build, que não deve abrir o arquivo SQLite (mesmo padrão de session.ts)
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (session) {
    redirect("/projects");
  }
  if (await hasAccount()) {
    redirect("/login");
  }
  return <SetupForm />;
}
