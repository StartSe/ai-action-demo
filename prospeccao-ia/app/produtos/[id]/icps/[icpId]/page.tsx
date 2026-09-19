import { ICPEditar } from "@/components/ICPEditar";

export default async function Page({ params }: PageProps<"/produtos/[id]/icps/[icpId]">) {
  const { id, icpId } = await params;
  return <ICPEditar produtoId={id} icpId={icpId} />;
}
