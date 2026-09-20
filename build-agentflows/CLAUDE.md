# Build Agentflows — decisões

Produto próprio focado em Agentflows, editor e execuções. A solicitação explícita do usuário substitui a experiência padrão da suíte por uma interface inspirada em Flowise v2. ChatGPT por assinatura é a conexão principal; o OpenRouter entrou na rodada 2 como alternativa explícita (Conexões, OAuth PKCE em app/api/conexoes/openrouter), escolhida bloco a bloco pelo prefixo "openrouter:" no modelo. Nunca há fallback automático entre provedores. Simulação somente por escolha explícita.

Usa @xyflow/react e @openai/codex fixado em 0.155.1. Login por dispositivo e execução pelo App Server oficial. Dados privados em DATA_DIR/chatgpt; nunca herdar credenciais da máquina. Ferramentas limitadas às selecionadas no bloco, sem terminal ou ambiente de projeto.

Exceções de infraestrutura registradas em scripts/padrao-excecoes.json para status e endpoints de configuração retirados. Infra compartilhada não utilizada permanece compatível; rotinas não são agendadas. Exceções de jargão webhook/token se limitam a contratos HTTP e caminhos técnicos internos.

Motor sequencial; snapshot publicado separado do rascunho; aprovação persistente com claim condicional; reinício não repete ações externas. Importação exclusiva build-agentflows/v1.

Editor no padrão Flowise Agentflows v2 (PLANO.md): cores dos blocos de AGENTFLOW_ICONS, alças e conexões em components/flow, regras de conexão em lib/flow-graph.ts (uma conexão por saída, ciclo só pela saída Repetir, Início sem entrada). Gerador de fluxos em lib/flow-generator.ts exige ChatGPT conectado e valida a resposta com validateGraph; nunca cai em simulação. O colorMode do React Flow fica fixo em "light": trocá-lo depois da montagem faz as arestas sumirem; o tema escuro é todo por CSS. As regras legadas de React Flow foram retiradas de app/globals.css.

Rodada 2 (PLANO.md): mensagem em branco no LLM/Agente recebe a conversa ou o resultado anterior (lib/flow-runtime.ts message); autocompletar {{ em components/ReferenceField.tsx; ferramentas com ids "interno:<nome>" e "mcp:<prefixo>:<nome>" em lib/tools.ts (nome sem prefixo é o servidor antigo FERRAMENTAS); canais WhatsApp (lib/whatsapp.ts, três provedores) e ElevenLabs (lib/elevenlabs.ts) com avisos em app/webhook/*; conexões em lib/conexoes.ts com chaves conhecidas (CHAVES_LIVRES). O verificador de jargão tem exceção para "OpenRouter" neste app. O script lint ignora data/** porque o Codex grava arquivos JS dentro de DATA_DIR.

Verificar npm test, npm run lint, npm run build, scripts/verificar-padrao.sh build-agentflows e scripts/verificar-jargao.mjs build-agentflows. Testes de navegador com dados temporários, sem credenciais reais. Referências e limitações em README.md.
