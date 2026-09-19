import { ProspeccaoAndamento } from "@/components/ProspeccaoAndamento";

export default async function Page({ params }: PageProps<"/prospeccoes/[id]">) {
  const { id } = await params;
  return <ProspeccaoAndamento prospeccaoId={id} />;
}
