import { zipSync, strToU8 } from "fflate";
import { notes, note, markdown, rules } from "@/lib/brain";
import { api } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const n = note(id);
      return new Response(markdown(n), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${n.id}.md"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const files: Record<string, Uint8Array> = {
      "REGRAS.md": strToU8(rules()),
      "LEIA-ME.md": strToU8(
        "# Daily Second Brain\n\nAbra esta pasta como um cofre no Obsidian. As páginas mantêm aliases com seus títulos, fontes e links. raw contém originais; wiki, conhecimento conectado; outputs, artefatos. Exportação de conteúdo; não inclui chaves, conta ou conversas. Para backup integral, copie DATA_DIR com o serviço parado.\n",
      ),
    };
    for (const n of notes())
      files[`${n.kind}/${n.id}.md`] = strToU8(markdown(n));
    return new Response(new Uint8Array(zipSync(files)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="daily-second-brain.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return api(() => {
      throw e;
    });
  }
}
