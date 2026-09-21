import { MapEditor } from "@/components/MapEditor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <MapEditor id={(await params).id} />;
}
