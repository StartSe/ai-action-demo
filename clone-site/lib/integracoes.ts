// Integrações que este app precisa. A configuração (/setup, components/Configuracoes.tsx) desenha os cartões
// a partir desta lista (GET /api/setup) mais as rotas próprias da IA (/api/ia, /api/chatgpt, /api/visao).
// A IA é obrigatória (OpenRouter por chave ou ChatGPT por assinatura; a leitura de captura é sempre pelo
// OpenRouter). Hospedagem é opcional: Netlify publica cada site num endereço próprio; Render cadastra o domínio
// próprio no serviço desta instância. Sem serviço de captura por endereço (o app lê o site de referência sozinho,
// lib/captura.ts) e sem notificações/rotinas (decisão de 21/09/2026).
import { CHAVE_NETLIFY, oauthNetlifyDisponivel, testarNetlify } from "./netlify";
import { CHAVE_RENDER, CHAVE_SERVICO_RENDER, testarRender } from "./render";
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

// Opcional: com a chave da hospedagem, o app cadastra sozinho o domínio próprio de cada site no serviço do Render
// (painel "Domínio próprio" do workspace); sem ela, a tela dá o passo a passo manual.
const RENDER: Integracao = {
  id: "render",
  titulo: "Domínio próprio no Render",
  descricao: "Com a chave da sua conta no Render e o identificador deste serviço, o app cadastra o domínio próprio de cada site sozinho, sem você abrir o painel da hospedagem.",
  beneficio: "Cadastra o domínio próprio dos sites nesta hospedagem sozinho",
  obrigatoria: false,
  link: { url: "https://dashboard.render.com/u/settings#api-keys", rotulo: "Criar uma chave no Render" },
  campos: [
    { chave: CHAVE_RENDER, rotulo: "Chave da conta", tipo: "secret", placeholder: "rnd_...", ajuda: "Em Account Settings, API Keys." },
    { chave: CHAVE_SERVICO_RENDER, rotulo: "Identificador deste serviço", tipo: "text", placeholder: "srv-...", ajuda: "Começa com srv-; está no endereço do serviço no painel do Render." },
  ],
  testar: testarRender,
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, NETLIFY, RENDER];
