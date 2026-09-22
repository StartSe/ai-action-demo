import { notFound } from "next/navigation";
import { sharedCanvas } from "@/lib/flow/share";
import PublicCanvas from "@/components/PublicCanvas";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Preview · Creative Flows",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = sharedCanvas(token);
  if (!share) notFound();
  return <PublicCanvas canvas={share.canvas} />;
}
