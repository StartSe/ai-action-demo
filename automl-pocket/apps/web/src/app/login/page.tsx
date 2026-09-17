import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { hasAccount } from "@/lib/setup-state";

import { LoginForm } from "./login-form";

// Enquanto a tabela users está vazia não há o que logar: o Pocket ainda não
// foi configurado e qualquer visita cai no primeiro acesso (PRD "primeiro
// acesso e envs", US-003). A checagem fica aqui, no servidor — o proxy edge
// não abre o SQLite.
export default async function LoginPage() {
  // headers() antes de hasAccount(): marca a rota como dinâmica no prerender
  // do build, que não pode abrir o SQLite (no `docker build` não existe banco
  // e o prerender estático falhava com "no such table: users")
  await headers();
  if (!(await hasAccount())) {
    redirect("/setup");
  }
  return <LoginForm />;
}
