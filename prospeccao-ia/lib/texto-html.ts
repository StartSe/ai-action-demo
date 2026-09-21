/** HTML de uma fonte pública vira texto; scripts, estilos e marcação não entram na análise. */
export function textoDeHtml(html: string): string {
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:p|div|section|article|li|h[1-6]|br|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, s => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[s]!)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (s, n: string) => { const v = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n); return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : s; })
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
}
