// Integrações que este app precisa. A configuração (/setup, components/Configuracoes.tsx) desenha os cartões
// a partir desta lista (GET /api/setup) mais as rotas próprias da IA (/api/ia, /api/chatgpt, /api/visao).
// A IA é obrigatória (OpenRouter por chave ou ChatGPT por assinatura; a leitura de captura é sempre pelo
// OpenRouter). Hospedagem é opcional: Netlify publica cada site num endereço próprio; Render cria um serviço independente por projeto. Sem serviço de captura por endereço (o app lê o site de referência sozinho,
// lib/captura.ts) e sem notificações/rotinas (decisão de 21/09/2026).
import { CHAVE_NETLIFY, oauthNetlifyDisponivel, testarNetlify } from "./netlify";
import { CHAVE_RENDER, CHAVE_WORKSPACE_RENDER, testarRender } from "./render";
import { openrouter, type Integracao } from "./setup-comum";

// O modelo que lê a captura fica no cartão do OpenRouter da tela própria de configuração (seletor com "Testar
// leitura de imagem", app/api/visao/route.ts); por isso `visao` fica desligado no cartão genérico.
const OPENROUTER = openrouter({ beneficio: "Lê a captura e escreve a sua página" });

// Opcional: publica o site num endereço próprio da Netlify (HTTPS e domínio próprio grátis pelo painel de lá).
const NETLIFY: Integracao = {
  id: "netlify",
  titulo: "Publicar na Netlify",
  descricao: "Com a sua conta na Netlify conectada, cada site pode ser publicado num endereço próprio (nome.netlify.app), com HTTPS, fora desta instalação.",
  beneficio: "Publica cada site num endereço próprio da Netlify, com um clique",
  obrigatoria: false,
  link: { url: "https://app.netlify.com/user/applications#personal-access-tokens", rotulo: "Criar uma chave de acesso na Netlify" },
  ...(oauthNetlifyDisponivel() ? { oauth: { tipo: "netlify", rotulo: "Conectar com a Netlify", url: "/api/setup/oauth/netlify" } } : {}),
  notaConexao: "Conta gratuita da Netlify basta.",
  campos: [
    { chave: CHAVE_NETLIFY, rotulo: "Chave de acesso pessoal", tipo: "secret", placeholder: "nfp_...", ajuda: "Na Netlify: User settings, Applications, Personal access tokens, New access token." },
  ],
  testar: testarNetlify,
};

// Cada projeto publica em seu próprio Static Site no workspace conectado.
const RENDER: Integracao = {
  id: "render",
  titulo: "Publicar no Render",
  descricao: "Cada projeto ganha um serviço independente no Render, com endereço próprio, versões publicadas e restauração pelo histórico.",
  beneficio: "Publica cada site em seu próprio serviço",
  obrigatoria: false,
  link: { url: "https://dashboard.render.com/u/settings#api-keys", rotulo: "Criar uma chave no Render" },
  campos: [
    { chave: CHAVE_RENDER, rotulo: "Chave da conta", tipo: "secret", placeholder: "rnd_...", ajuda: "Em Account Settings, API Keys." },
    { chave: CHAVE_WORKSPACE_RENDER, rotulo: "Identificador do workspace", tipo: "text", placeholder: "tea-...", ajuda: "Em Workspace Settings no painel do Render. Cada site será criado nesse workspace." },
  ],
  testar: testarRender,
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, NETLIFY, RENDER];
