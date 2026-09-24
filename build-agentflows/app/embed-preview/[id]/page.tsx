import { getFlow } from "@/lib/flow-store";
import { EmbedPreview } from "@/components/EmbedPreview";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function EmbedPreviewPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; try {getFlow(id);}catch{notFound();}
  return <EmbedPreview flowId={id}/>;
}
