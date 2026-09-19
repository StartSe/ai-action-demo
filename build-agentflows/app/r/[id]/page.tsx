import { notFound } from "next/navigation";
import { getRun } from "@/lib/flow-store";
import { RunView } from "@/components/RunView";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let run;
  try {
    run = getRun((await params).id);
  } catch {
    notFound();
  }
  return (
    <main className="flows-main">
      <a href="/historico">Voltar às execuções</a>
      <RunView run={run} />
    </main>
  );
}
