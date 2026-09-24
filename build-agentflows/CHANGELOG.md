# Histórico de versões

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
