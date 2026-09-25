# Base de Conhecimento

Acesso pela tela inicial ou pelo menu **Base de Conhecimento**. A implementação segue a jornada do Document Store do Flowise, com código próprio e a interface do Build Agentflows.

## Jornada

1. **Criar base:** dê um nome e uma descrição para identificar o conteúdo.
2. **Documentos:** escolha uma fonte, configure a conexão ou envie os arquivos e clique em **Extrair e revisar**. É possível salvar a configuração sem extrair ainda. A extração não gera embeddings.
3. **Revisar fragmentos:** pesquise, edite o texto e os metadados ou remova trechos. A divisão pode ser recursiva ou por separador, com tamanho e sobreposição configuráveis. Reextrair substitui os fragmentos da fonte, inclusive suas edições manuais.
4. **Embeddings:** configure OpenAI/API compatível ou Ollama, modelo, endereço e credencial. Essa conexão é independente do modelo do Agente. Uma assinatura ChatGPT não é usada como credencial de embeddings.
5. **Vector Store:** use vetores persistidos localmente em SQLite ou um servidor Qdrant. Cada base e cada geração têm isolamento próprio.
6. **Record Manager:** use SQLite para reaproveitar embeddings da indexação anterior ou desative para recalcular. O reaproveitamento exige texto, provedor, endereço e modelo iguais. Metadados editados permanecem associados ao trecho, mesmo quando seu vetor é reaproveitado.
7. **Indexar base:** a nova geração só fica disponível após a conclusão. O histórico informa quantos embeddings foram gerados e reaproveitados. Alterações nas fontes/configuração exigem nova indexação antes de consultar.
8. **Testar consulta:** digite uma pergunta para ver conteúdo, origem, metadados e pontuação dos trechos encontrados. Ajuste a quantidade e a pontuação mínima quando necessário.
9. **Agente:** selecione a base no bloco, escolha **Retornar referências encontradas** e salve o fluxo. O sistema consulta a base antes da chamada ao modelo e acrescenta as referências ao final da resposta apenas quando essa opção está ativa. A lista descreve os trechos recuperados; não é uma comprovação de que o modelo citou cada um deles.

## Extratores (ordem alfabética)

| Opção | Configuração e comportamento |
| --- | --- |
| Apify Website Content Crawler | URL, chave Apify e limite; executa o ator `apify/website-content-crawler`, acompanha o resultado e lê o dataset. |
| Cheerio Web Scraper | URL, seletor CSS opcional e limite; HTML estático, links do mesmo domínio e remoção de scripts/navegação. Não executa JavaScript do site. |
| Csv File | Arquivo `.csv`, cabeçalho na primeira linha e coluna de conteúdo opcional; um documento por linha. |
| Custom Document Loader | JavaScript e variáveis JSON executados em sandbox remoto E2B, com chave própria. Retorne `[{ pageContent: "texto", metadata: {} }]`; as variáveis ficam em `input`. O código não acessa o processo nem as credenciais do app. |
| Docx File | Arquivos `.docx`. |
| FireCrawl | URL e chave; extrai a página pelo endpoint de scrape em Markdown. |
| Github | Organização/repositório, branch, caminho opcional, limite e token para repositório privado. Preserva o endereço de cada arquivo; importa formatos textuais, não binários. |
| Google Drive | ID de arquivo **ou** pasta e token OAuth com permissão de leitura; exporta documentos, planilhas e apresentações nativos e baixa arquivos compatíveis. Pastas consideram os arquivos diretamente contidos, sem recursão. |
| Google Sheets | ID da planilha, intervalo e token OAuth de leitura; preserva a posição da linha no intervalo. |
| JSON File | Arquivo `.json`, objeto ou lista, com caminho opcional como `dados.itens`. |
| Microsoft Excel | Arquivos `.xlsx` e `.ods`. |
| Microsoft Power Point | Arquivos `.pptx` e `.odp`, incluindo notas. |
| Microsoft Word | Arquivos `.docx` e `.odt`. |
| PDF File | Texto por página, preservando número da página. Documentos digitalizados precisam de reconhecimento de texto prévio. |
| Plain Text | Texto digitado ou colado. |
| S3 | Bucket, região, chave do objeto e credenciais AWS; token de sessão opcional. Usa parsers locais dos formatos compatíveis. |
| S3 Directory | Bucket, região, prefixo e limite; lista objetos e usa os mesmos parsers de S3. |
| SearchAPI For Web Search | Pesquisa e chave; importa título, resumo e referência dos resultados orgânicos do Google. |
| Spider Document Loaders | URL, chave e limite; rastreamento em Markdown. |
| TextFile | Arquivos `.txt`, `.md`, `.markdown` e `.log`. |

Tokens OAuth Google são informados na fonte e precisam ser atualizados quando expirarem. Esta configuração não inicia um novo consentimento OAuth nem usa as antigas rotas `/api/setup/oauth` desativadas do app. Serviços externos continuam exigindo contas e permissões próprias.

## Persistência, erros e limites

- A base, suas fontes, fragmentos, vetores e histórico ficam no SQLite de `DATA_DIR`. Credenciais e arquivos de entrada são cifrados pelo armazenamento de configurações existente. Fragmentos e metadados são dados privados do aplicativo e ficam no mesmo volume persistente.
- As rotas `/api/knowledge/**` são administrativas e passam pela sessão existente. Nenhuma fonte ou credencial é publicada junto com a exportação do grafo: o grafo guarda somente o identificador da base e as opções de consulta.
- Upload de até 20 arquivos, somando 10 MB. Documento remoto de até 10 MB, até 5 milhões de caracteres por extração, 10.000 documentos/fragmentos por fonte e 10.000 fragmentos por base. Fontes remotas com limite aceitam de 1 a 100 documentos e avisam quando pode haver conteúdo adicional.
- Fragmentos de 100 a 8.000 caracteres; sobreposição menor que o tamanho. Busca de até 20.000 caracteres, com 1 a 20 resultados e pontuação mínima entre -1 e 1.
- Cada extração/indexação tem limite de 10 minutos. Uma trava persistente impede operações concorrentes na mesma base; a expiração em 15 minutos permite recuperar um processo interrompido. O índice novo só substitui o anterior depois de completo.
- Falhas de serviços aparecem na fonte ou no histórico. Credenciais e corpos de erro de provedores não entram nessas mensagens. Não há retorno silencioso a uma busca por palavras quando embeddings falham.
- Excluir uma fonte remove seus vetores locais e do Qdrant; a base fica pendente de indexação. Excluir uma base vinculada a um Agente é recusado, com orientação para remover o vínculo.
- Índices Qdrant anteriores são removidos após a troca. Limpeza que falhou fica registrada e pode ser repetida pela interface. A limpeza processa até cinco gerações por tentativa. Os índices antigos nunca entram na consulta ativa.
- Fontes HTTP exigem endereços públicos e fixam a conexão no endereço DNS validado. Servidores de Embeddings/Qdrant configurados pelo administrador podem usar rede privada, para instalações locais. Ao mudar de serviço, a credencial anterior não é encaminhada ao novo endereço.

## Contratos e verificação

Os testes em `lib/knowledge.test.ts` exercitam arquivos PDF, DOCX, XLSX e PPTX reais, CSV/JSON/texto, fragmentação, metadados, criptografia, isolamento, travas, falhas, reindexação, exclusão e recuperação. Os provedores externos são testados com respostas controladas, incluindo os contratos HTTP OpenAI, Ollama e Qdrant, conectores cloud, SDK S3, sandbox E2B e RAG com ChatGPT/OpenRouter. Não consomem credenciais nem serviços pagos reais.

Contratos de referência: [embeddings OpenAI](https://developers.openai.com/api/docs/guides/embeddings), [Ollama embed](https://docs.ollama.com/api/embed), [Firecrawl scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape) e implementação local do [Document Store Flowise](https://github.com/FlowiseAI/Flowise/tree/main/packages/ui/src/views/docstore).

Validação visual: biblioteca, catálogo dos 20 extratores, extração e revisão, configuração nas três etapas, indexação, consulta, histórico, edição/reindexação e seleção no Agente; desktop, 390 px e tema escuro. Os artefatos temporários da verificação ficam fora do repositório.
