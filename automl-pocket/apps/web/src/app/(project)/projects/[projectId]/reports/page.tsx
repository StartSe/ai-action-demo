import { redirect } from "next/navigation";

// O Insights Report vive dentro do Prever (US-004/US-005); a rota fica só
// como redirect para que nenhum link antigo a /reports quebre
export default async function ReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/predict`);
}
