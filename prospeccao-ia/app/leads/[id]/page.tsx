import { FichaLeadPagina } from "@/components/FichaLeadPagina";

export default async function Page({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  return <FichaLeadPagina leadId={id} />;
}
