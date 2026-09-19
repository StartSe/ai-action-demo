import { AbordagemLead } from "@/components/AbordagemLead";

export default async function Page({ params }: PageProps<"/leads/[id]/abordagem">) {
  const { id } = await params;
  return <AbordagemLead leadId={id} />;
}
