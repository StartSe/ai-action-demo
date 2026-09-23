import { Library } from "@/components/Library";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const youtubeResult =
    params.settings === "youtube"
      ? {
          connected: params.youtube === "connected",
          error:
            typeof params.youtube_error === "string"
              ? params.youtube_error.slice(0, 500)
              : undefined,
        }
      : undefined;
  return <Library youtubeResult={youtubeResult} />;
}
