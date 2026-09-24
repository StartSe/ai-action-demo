# Histórico de versões

## 0.9.2 — 24/09/2026

- Conexões sempre visíveis; seta de saída no hover do bloco, com acesso permanente no touch e alvos de toque ampliados.
- Chat sem simulação ou exemplos, com botão Conectar ChatGPT abaixo da apresentação quando nenhum motor está conectado.
- Campo de mensagem com uma linha inicial, crescimento até três linhas e rolagem para textos maiores.
- Modais de blocos aplicam alterações ao fechar ou clicar fora, mantendo a validação e removendo os botões Salvar e Cancelar.
- Variáveis do Início separadas em cartões com exclusão por ícone.
- Agente e LLM com seleção de modelo, indicação de conexão e menos avisos.
- Pesquisa web do ChatGPT ativa automaticamente para Agente e LLM, incluindo fluxos existentes.

## 0.9.1 — 24/09/2026

- Pontos de saída sempre visíveis, linhas com maior contraste e área de entrada ampliada para conectar blocos.
- Dicas distinguem saídas já conectadas de saídas disponíveis.

## 0.9.0 — 24/09/2026

- Chat incorporado com retomada da conversa, eventos da página, captura de tela, aprovação humana e cancelamento.
- Execuções persistentes com limite de tempo e revisão de tarefas interrompidas.
- Início com nome fixo, editor de variáveis e referências `{{fluxo.NomeVariavel}}`, preservando `{{state.nome}}`.
- Atualização de variáveis ao concluir Agente/LLM e resposta direta em etapas terminais.
- Modelo como primeiro campo e pesquisa web opcional na conexão ChatGPT.
- Domínios autorizados em Configurações > Segurança, aplicados ao acesso e ao iframe.
- Compose para Coolify com volume persistente e documentação de instalação.

## 0.5.0 — 20/09/2026

- Conexões com quatro cartões alinhados: ChatGPT, OpenRouter, WhatsApp e ElevenLabs.
- Aceite dos termos StartSe para Z-API e ZapperHub, com registro e validação no servidor.
- Limites da assinatura ChatGPT: percentual disponível, janela e próxima renovação, pelo protocolo oficial.
- Chat com limpar, expandir e fechar no topo, sem cabeçalho duplicado. Exemplos e simulação somem com IA conectada.
- Catálogo com todas as 24 ferramentas solicitadas, seleção independente por agente e credenciais reutilizáveis entre agentes e fluxos.
- Gestão de credenciais e servidores dentro do Agente; remoção explicita o impacto sobre os demais agentes.
- Google Workspace e Microsoft 365 por credenciais OAuth; renovação opcional. Browserless e Slack pelo SDK MCP oficial; E2B em sandbox remoto. Arquivos confinados à pasta dos agentes e operações OpenAPI 3 em JSON.
