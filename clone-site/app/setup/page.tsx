import { Configuracoes } from "@/components/Configuracoes";

// Tela própria deste app (independente da SetupPage compartilhada): seções "Inteligência artificial" (ChatGPT ×
// OpenRouter, com o modelo que lê a captura dentro do cartão do OpenRouter), "Hospedagem e publicação" (Netlify e
// Render) e "Assistente de IA" (MCP), mais "Para a equipe técnica". Sem notificações e sem rotinas.
export default function Page() {
  return <Configuracoes />;
}
