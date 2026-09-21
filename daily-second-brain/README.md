# Daily Second Brain · v1.0.0

Uma memória pessoal conectada: capture o que chega, transforme em conhecimento e converse para criar novos resultados. A experiência combina um observatório de ideias com páginas Markdown, fontes rastreáveis, regras próprias e um assistente por texto ou voz.

**raw → wiki → outputs → raw**

- **Caixa de entrada:** cole textos ou importe `.md`, `.txt`, `.csv` e `.json` de até 100 KB. A fonte original permanece imutável.
- **Wiki:** o assistente organiza cada fonte, conecta ideias com `[[wikilinks]]`, evita títulos duplicados e atualiza páginas relacionadas. Edições e restaurações guardam revisões. Renomear uma página atualiza os links de wiki e outputs.
- **Mapa:** navegue pelas conexões reais entre páginas. Mostra até 28 páginas recentes; a wiki e a busca continuam disponíveis para todo o acervo.
- **Conversas:** recuperação por relevância e recência, com até 12 fontes por interação e histórico recente. A tela mostra o contexto consultado; referências clicáveis permitem conferir o raciocínio.
- **Artefatos:** briefings, planos e reflexões em Markdown, com fontes. “Voltar à memória” cria uma nova fonte para revisar e organizar.
- **Regras:** edite `REGRAS.md` pela interface. As regras acompanham organização, conversa e geração.
- **Portabilidade:** exporte uma página ou um ZIP com raw/wiki/outputs e regras. Abra a pasta como cofre no Obsidian; aliases ligam títulos aos arquivos de identificador estável.

O exemplo é opt-in, com conteúdos fictícios e respostas claramente demonstrativas. Abra `/?exemplo=1` ou use “Explorar com um exemplo”. Conteúdo próprio exige uma IA conectada; falhas do provedor nunca são substituídas por uma resposta simulada.

## Conexões

| Integração | Uso na v1 | Como conectar |
| --- | --- | --- |
| ChatGPT | Organização, conversa e artefatos pela assinatura | Conexões → ChatGPT → login oficial por código. O uso segue os limites da conta. Não reutiliza a sessão de outra aplicação. |
| OpenRouter | Alternativa explícita de IA, catálogo de modelos | Cole a chave em Conexões. Modelo automático ou escolha no catálogo. Créditos separados da assinatura ChatGPT. |
| Zapier MCP | Coleta e ações em Gmail, Drive, Notion, Slack e ferramentas configuradas pelo usuário | Crie o servidor no Zapier, habilite ferramentas e salve sua URL e token opcional. “Testar e ver ferramentas” consulta o servidor real. |
| ElevenLabs | Falar para escrever e ouvir respostas | Salve a chave e opcionalmente a voz. Transcrição é revisada antes do envio. Até 60 s/15 MB por gravação; leitura de até 2.500 caracteres. |

Zapier é a integração agregadora recomendada para a v1: reduz a quantidade de credenciais e conectores específicos. O assistente prepara a ação com os argumentos e aguarda confirmação; o servidor executa uma única vez e grava o resultado em raw. Falhas/interrupções pedem conferência no serviço antes de repetir, pois uma chamada externa pode ter sido concluída sem resposta. Não há sincronização automática nem agendador na v1. Coleta sob demanda evita importar informação sem intenção. Ferramentas disponíveis dependem da configuração da conta Zapier.

A voz é por turnos (gravar → revisar → enviar → ouvir), sem ligação telefônica ou conversa full duplex. Leitura de PDFs, imagens, áudio anexado, crawling de URLs e embeddings não estão nesta versão; textos desses materiais podem ser colados ou obtidos pelas ferramentas Zapier.

Referências oficiais utilizadas: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [OpenRouter](https://openrouter.ai/docs/quickstart), [Zapier MCP](https://docs.zapier.com/mcp/get-started/quickstart), [ElevenLabs Speech to Text](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [discos persistentes do Render](https://render.com/docs/disks).

## Executar

Requer Node 22.18+ (produção Node 22 Alpine) ou Node 24.

```sh
npm ci
npm run dev -- --port 3020
```

Crie a conta em `/conta` e abra Conexões. Nenhuma variável é obrigatória. Uma conta administrativa e um acervo por instância; não é um serviço multiusuário.

```sh
docker compose up --build
# http://localhost:3020
```

## Render e dados

[Publicar no Render](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-daily-second-brain)

O push em `main` executa o workflow da suíte: constrói `ghcr.io/startse/daily-second-brain`, publica tags `latest` e SHA, captura a interface e atualiza o catálogo público e o branch `deploy-daily-second-brain`. Blueprint gerado a partir de `catalogo.json`: plano Starter, disco de 1 GB em `/app/data`, porta 10000 e `/api/health`. Uma instância instalada no Render é criada a partir desse Blueprint; a publicação do catálogo por si só não cria uma instância na conta de um usuário.

O processo usa usuário não root. `/app/data` contém `app.sqlite`, chave mestra, sessão ChatGPT isolada e espelho Markdown `vault/`. SQLite é a fonte de verdade. O ZIP é gerado do banco, mesmo se um espelho em disco falhar. Não edite os espelhos esperando importação automática. Para backup completo, pare o serviço e copie todo o volume, incluindo a chave mestra. O ZIP é uma exportação de conhecimento: não contém conta, credenciais nem conversas.

## Configuração alternativa por ambiente

| Variável | Finalidade | Onde obter |
| --- | --- | --- |
| `DATA_DIR` | Diretório persistente; padrão `./data` | Volume da instalação |
| `BRAIN_PROVIDER` | `chatgpt` (padrão) ou `openrouter` | Escolha do usuário |
| `CHATGPT_MODEL` | Modelo opcional da conta conectada | Catálogo da própria conta |
| `OPENROUTER_API_KEY` | Chave do OpenRouter | [OpenRouter Keys](https://openrouter.ai/settings/keys) |
| `OPENROUTER_MODEL` | Modelo, padrão `openrouter/auto` | Catálogo OpenRouter |
| `ZAPIER_MCP_URL` | URL secreta HTTPS do servidor | [Zapier MCP](https://mcp.zapier.com) |
| `ZAPIER_MCP_TOKEN` | Bearer opcional do servidor | Configuração Zapier MCP |
| `ELEVENLABS_API_KEY` | Transcrição e voz | [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) |
| `ELEVENLABS_VOICE_ID` | Voz opcional; padrão Rachel | Biblioteca da conta ElevenLabs |
| `BRAIN_RULES` | Regras editoriais; preferir editar na interface | Usuário |
| `CHAVE_MESTRA` | 32 bytes em base64; sem ela, app gera arquivo local | Gerada pela instalação |
| `PORT` | Porta HTTP; Docker 10000 | Hospedagem |

Variáveis do ambiente prevalecem sobre configurações da interface. `CONTA_DESLIGADA=1` é reservado ao contêiner efêmero de captura do catálogo e nunca deve ser configurado em uma instância real.

Credenciais salvas usam AES-256-GCM. Conta usa scrypt, sessão HttpOnly e proteção de origem nas mutações. O bridge ChatGPT limita o agente às ferramentas fornecidas, sem terminal, navegador ou ambiente da aplicação. Fontes e resultados são tratados como conteúdo não confiável.

## Verificação

```sh
npm test
npm run lint
npm run build
node ../scripts/verificar-jargao.mjs daily-second-brain
```

`tests/browser.mjs` valida conta, captura, organização, edição/restauração, chat, artefatos, reciclagem, regras, exportação, busca e layout móvel em um servidor com banco temporário vazio. Configure `PLAYWRIGHT_MODULE` para o pacote Playwright instalado e `TEST_BASE_URL` para o servidor. Gera capturas em `TEST_ARTIFACTS` (padrão `/tmp/daily-brain-review`). Testes de integração usam respostas controladas dos provedores; acesso real depende das credenciais conectadas pelo usuário.
