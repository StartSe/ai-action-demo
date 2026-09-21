import { youtubeSource } from "../lib/sources.ts";

const url = process.argv[2];
if (!url) {
  console.error(
    "Uso: npm run check:youtube -- 'https://www.youtube.com/watch?v=ID'",
  );
  process.exit(1);
}
try {
  const source = await youtubeSource(url);
  console.log(
    JSON.stringify(
      {
        title: source.title,
        url: source.url,
        segments: source.segments.length,
        characters: source.characters,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
