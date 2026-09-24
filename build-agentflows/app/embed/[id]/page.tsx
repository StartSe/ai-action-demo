import { notFound } from "next/navigation";
import { EmbedChat } from "@/components/EmbedChat";
import { embedSettings } from "@/lib/embed-store";
export const dynamic = "force-dynamic";
export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let settings;
  try { settings = embedSettings(id); } catch { notFound(); }
  if (!settings.enabled) notFound();
  return <EmbedChat title={settings.title} welcome={settings.welcome} displayMode={settings.displayMode}/>;
}
