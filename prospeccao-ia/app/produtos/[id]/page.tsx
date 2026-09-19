import { ProdutoEditar } from "@/components/ProdutoEditar";

export default async function Page({ params }: PageProps<"/produtos/[id]">) {
  const { id } = await params;
  return <ProdutoEditar produtoId={id} />;
}
