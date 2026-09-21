# Radar de Sinais: dados de teste e conexão de IA

Verificação e implementação em 20/09/2026.

Antes da mudança, conectar integrações não removia exemplos salvos. Início e Radar continuavam usando `radarDemo` na ausência de resultado real. A API de exclusão apagava todo o histórico e não havia limpeza seletiva visível. A síntese aceitava somente OpenRouter.

Agora Configurações e Radares anteriores oferecem **Remover dados de teste**, com confirmação. A ação exclui exclusivamente registros do tipo radar cuja marca `meta.demo` é o booleano `true`. Preserva conta, integrações, temas, fontes, monitoramentos, radares reais e registros sem proveniência inequívoca. A opção de ocultar a demonstração persiste, inclusive após recarregar ou desconectar a IA. Uma geração de exemplo em andamento não pode desfazer a limpeza. Conectar IA oculta o mapa ilustrativo, sem excluir registros.

**Conectar IA** permite escolher OpenRouter (OAuth/chave) ou ChatGPT (código de dispositivo pelo Codex App Server 0.155.1, reutilizado do build-agentflows). A escolha governa síntese, status, MCP e monitoramentos; erro do ChatGPT não usa OpenRouter como fallback. A sessão fica isolada em `DATA_DIR/chatgpt`. O pacote standalone inclui o binário oficial.

Validação:

- `npm test`: 31 testes aprovados, incluindo preservação de dados, limpeza durante geração, conta sem OpenRouter, seleção de modelo, fontes inventadas descartadas, erros sem fallback, protocolo de login, turnos e cancelamento.
- `npm run lint`, `npm run build`, verificador de jargão e `git diff --check`: aprovados.
- Navegador em standalone, 1440×1000 e 390×844: proteção das rotas sem sessão, cancelamento/confirmação da limpeza, estado vazio após recarregar, alternância dos provedores e início do conector oficial sem autenticação. Login por código, cancelamento, conexão e desconexão exercitados com respostas simuladas. Sem erros de página nem overflow horizontal.
- Verificador de padrão da suíte executado: continuam divergências anteriores em `lib/mcp-cliente.ts`, `lib/notificacoes.ts`, `lib/rotinas.ts` e `app/api/rotinas/route.ts`. Esses quatro arquivos permanecem byte a byte iguais ao HEAD anterior à tarefa. Exceções dos arquivos alterados registradas com seus motivos. Paleta aprovada.

Limites: não houve login nem consumo de uma conta ChatGPT real, entrega externa ou publicação. Testes feitos com IA real não são identificados como demonstração e não são removidos pela limpeza seletiva. A imagem Docker não foi construída nesta validação; o standalone foi construído e executado localmente.

Referência: [Codex App Server oficial](https://developers.openai.com/codex/app-server).
