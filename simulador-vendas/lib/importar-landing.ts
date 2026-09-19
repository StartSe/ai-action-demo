import { getConfig } from "./store";
import { chamar, conectar, listarFerramentas } from "./brightdata-http";
import { conferirEndereco, extrairPagina, FalhaExtracao, type PaginaExtraida } from "./extrair-pagina";

function conexao(chave: string) {
  const url = new URL("https://mcp.brightdata.com/mcp");
  url.searchParams.set("token", chave);
  return conectar(url.href);
}

export async function testarBrightData(chave: string) {
  try {
    const ferramentas = await listarFerramentas(conexao(chave));
    const ok = ferramentas.some(f => f.nome === "scrape_as_markdown");
    return { ok, mensagem: ok ? "Bright Data conectado e leitura de páginas disponível." : "A conta não disponibilizou a leitura de páginas." };
  } catch { return { ok: false, mensagem: "Não foi possível conectar ao Bright Data. Confira a chave e o acesso ao MCP na sua conta." }; }
}

export async function importarLanding(endereco: string): Promise<PaginaExtraida> {
  const chave = getConfig("BRIGHTDATA_API_KEY");
  if (!chave) return extrairPagina(endereco);
  const url = await conferirEndereco(endereco.trim());
  try {
    const resultado = await chamar(conexao(chave), "scrape_as_markdown", { url: url.href });
    const texto = typeof resultado === "string" ? resultado :
      resultado && typeof resultado === "object" && "markdown" in resultado && typeof resultado.markdown === "string" ? resultado.markdown : "";
    if (texto.replace(/\s/g, "").length < 200) throw new FalhaExtracao("conteudo_curto", "Página sem conteúdo suficiente.");
    if (texto.length > 2_000_000) throw new FalhaExtracao("grande_demais", "Página excedeu o limite.");
    return { url: url.href, titulo: texto.match(/^# +(.+)$/m)?.[1]?.slice(0, 120) || url.hostname, texto };
  } catch (erro) {
    if (erro instanceof FalhaExtracao) throw erro;
    throw new FalhaExtracao("sem_resposta", "Não foi possível importar a página pelo Bright Data. Confira a conexão nas configurações.");
  }
}
