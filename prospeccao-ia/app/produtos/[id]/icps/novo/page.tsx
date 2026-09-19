import { ICPNovo } from "@/components/ICPNovo";

export default async function Page({ params }: PageProps<"/produtos/[id]/icps/novo">) {
  const { id } = await params;
  return <ICPNovo produtoId={id} />;
}
