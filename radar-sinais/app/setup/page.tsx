import { PesquisaEditor } from "@/components/Pesquisa";
import { AcessoMCP } from "@/components/AcessoMCP";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="R" nome="Radar de Sinais" area="Estratégia" segmento="Estratégia">
        <PesquisaEditor modo="fontes" />
        <section className="card p-6 mt-5"><h2 className="font-bold text-lg">Como a pesquisa se mantém atualizada</h2><p className="text-sm text-muted mt-2">Inspirado na abordagem da last30days: consultas com janela temporal, cruzamento de fontes, deduplicação e síntese apoiada em links. Este app usa seus próprios coletores; a skill não roda no servidor. Publicações sem data são identificadas, sem presumir que foram publicadas hoje.</p><a className="btn-link text-sm inline-block mt-3" href="https://github.com/mvanhorn/last30days-skill" target="_blank" rel="noreferrer">Conhecer a last30days ↗</a></section>
        <section className="card p-6 mt-5"><h2 className="font-bold text-lg">ChatGPT e geração das ontologias</h2><p className="text-sm text-muted mt-2">O radar usa OpenRouter para gerar sinais e conexões. Você pode escolher um modelo específico no cartão de IA. A assinatura ChatGPT oferece acesso ao Codex por login, mas não é uma chave de API para este servidor. Para usar seu assistente com o radar, veja a conexão MCP abaixo.</p><a className="btn-link text-sm inline-block mt-3" href="https://developers.openai.com/codex/auth" target="_blank" rel="noreferrer">Autenticação oficial da OpenAI ↗</a></section>
      </SetupPage>
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
