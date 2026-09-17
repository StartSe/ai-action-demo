import { redirect } from "next/navigation";

// Sem a home pública (PRD US-001), "/" só é alcançado com sessão — o proxy já
// redireciona quem não tem cookie para /login antes de chegar aqui.
export default function HomePage() {
  redirect("/projects");
}
