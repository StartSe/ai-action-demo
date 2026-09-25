# Base de Conhecimento — comparação com Flowise

Revisão da versão 0.13.0, em 25/09/2026. Referência: código local de `Flowise-main/packages/components/nodes` (documentloaders, embeddings, vectorstores e recordmanager) e catálogo `packages/components/models.json`.

A jornada principal está contemplada: extrair documentos, revisar e dividir o texto, gerar embeddings, indexar, evitar processamento repetido, consultar e entregar os trechos ao Agente. Os campos avançados não têm paridade integral com o Flowise.

## Etapas

| Etapa | Disponível no projeto | Diferenças relevantes em relação ao Flowise |
| --- | --- | --- |
| Fontes | 20 extratores com os logos da referência, campos por serviço, upload, credenciais cifradas, extração, metadados e revisão dos trechos. | Catálogo limitado às 20 fontes selecionadas. PDF digitalizado exige OCR prévio. Custom Document Loader executa no E2B. |
| Divisão | Divisores recursivo e por caracteres, tamanho, sobreposição e separador; edição de conteúdo/metadados dos trechos. | Não inclui todos os divisores especializados, por tokens e semânticos do Flowise. |
| Embeddings | Gemini, OpenAI, VoyageAI e Ollama, com logos e listas de modelos. Credenciais compartilhadas no menu Credenciais. Dimensões automáticas, URL configurável, credencial, lote, timeout e remoção opcional de quebras de linha. | Não há seletor de dimensões, encoding base64, cabeçalhos arbitrários, task type manual ou ajustes de GPU/threads do Ollama. Recuperação usa documento/query conforme o provedor. |
| Vector Store | Os 11 serviços abaixo recebem vetores reais e participam da consulta e exclusão. Top K, similaridade mínima, metadados e referências do documento. | Busca por similaridade de cosseno. Não expõe MMR, filtros arbitrários do usuário, busca híbrida, reranking nem todos os ajustes de índices de cada serviço. |
| Record Manager | SQLite e Postgres, com logos, hash do conteúdo/configuração, reaproveitamento de embeddings e limpeza da versão anterior. Postgres permite tabela e namespace. | Limpeza completa por versão. Não expõe modos `none`/`incremental` nem `sourceIdKey` do Flowise. SQLite usa o banco persistente do app; fonte/base são identificadas automaticamente. |
| Consulta no Agente | Recupera os trechos da versão publicada e pode incluir referências na resposta, com ChatGPT e OpenRouter. | É necessário salvar e indexar a configuração; uma falha na nova indexação preserva os dados da versão anterior, mas a consulta exige a base novamente indexada e pronta. |

## Modelos e dimensões

Esses valores ficam no catálogo interno; o usuário escolhe o modelo. A resposta do serviço é validada para impedir mistura de tamanhos incompatíveis.

| Provedor | Modelo | Dimensões |
| --- | --- | ---: |
| Google Gemini | gemini-embedding-001, gemini-embedding-2 | 3072 |
| OpenAI | text-embedding-3-small | 1536 |
| OpenAI | text-embedding-3-large | 3072 |
| OpenAI | text-embedding-ada-002 | 1536 |
| VoyageAI | voyage-4, voyage-4-large, voyage-4-lite, voyage-code-4, voyage-3.5, voyage-3.5-lite, voyage-code-3, voyage-finance-2, voyage-law-2 | 1024 |
| Ollama | nomic-embed-text | 768 |
| Ollama | mxbai-embed-large, bge-m3 | 1024 |
| Ollama | all-minilm | 384 |

O modelo precisa estar disponível na conta ou instalado no servidor Ollama. Configurações anteriores com modelo personalizado continuam preservadas. As opções legadas de armazenamento local e Record Manager desativado continuam legíveis, mas não aparecem como novos provedores.

Referências dos protocolos: [OpenAI](https://developers.openai.com/api/docs/guides/embeddings), [Gemini](https://ai.google.dev/gemini-api/docs/embeddings), [VoyageAI](https://docs.voyageai.com/docs/embeddings) e [Ollama](https://docs.ollama.com/capabilities/embeddings). Gemini 001 usa `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`; Gemini 2 usa os prefixos de tarefa próprios do modelo. Voyage usa `input_type`.

## Bancos vetoriais

| Opção | Implementação e preparação necessária |
| --- | --- |
| Chroma | API v2; tenant e database configuráveis. Cria coleção com cosseno e fornece embeddings próprios. |
| Elasticsearch | REST com `dense_vector`, índice por versão e k-NN. API key ou usuário/senha. Requer uma versão com suporte às APIs utilizadas e permissão de criação de índices. |
| Faiss | Índice nativo `IndexFlatIP` com vetores normalizados, persistido em `DATA_DIR/knowledge-faiss`. É o padrão para novas bases, sem serviço externo. |
| MongoDB Atlas | Driver MongoDB, coleção por versão e Atlas Vector Search. Aguarda o índice ficar consultável. Exige Atlas Vector Search e permissão de criar índices de busca. MongoDB sem esse recurso não basta. |
| Pinecone | API do host de um índice existente, com namespace por versão. Confere dimensões e aguarda visibilidade da gravação. O índice deve usar cosseno e o tamanho do modelo escolhido. |
| Postgres | Driver `pg` e extensão pgvector, tabela por versão, schema configurável, busca `<=>`. Extensão instalada e permissão de criar tabelas necessárias. |
| Qdrant | REST, coleção com cosseno, gravação/consulta/exclusão; mantém os nomes e IDs das bases criadas anteriormente. |
| Weaviate | REST para schema/objetos e GraphQL `nearVector`. Vetores externos, sem vectorizer automático. Valida falhas individuais no lote. |
| Supabase | PostgREST e função RPC com pgvector. A interface fornece SQL para criar tabela e função conforme o modelo; execute no SQL Editor. Requer chave com leitura/escrita e acesso à função. Ao mudar as dimensões, prepare outra tabela/função compatível. RLS fica habilitado; a aplicação usa filtro de base/versão nas consultas e exclusões. |
| SingleStore | Driver MySQL, `JSON_ARRAY_PACK` e `DOT_PRODUCT` com vetores normalizados. Requer banco existente e permissão para criar tabelas; não basta um servidor MySQL comum. |
| OpenSearch | REST, índice k-NN e mapeamento vetorial. Requer recurso k-NN habilitado e autenticação compatível com API key ou usuário/senha; assinatura AWS IAM não está implementada. |

Coleções/tabelas/namespaces são gerados pelo app para isolar bases e versões, em vez de escrever em coleções escolhidas livremente. Após a publicação, a versão anterior é removida. Falhas de limpeza permanecem registradas para nova tentativa. As conexões usadas por cada geração ficam cifradas, permitindo limpar o destino antigo mesmo depois de trocar a configuração.

Os trechos e vetores também permanecem no SQLite do app para controle de versões, metadados e reaproveitamento. Portanto, configurar um banco remoto **não elimina a necessidade de persistir `DATA_DIR`**. A ordenação é obtida pelo provedor e os resultados são conferidos com a similaridade de cosseno dos vetores armazenados.

## Validação

- Suíte automatizada: extração, persistência, credenciais, publicação, reindexação, busca, exclusão e execução do Agente, além dos contratos de embeddings e bancos vetoriais.
- Faiss nativo: gravação em disco, leitura, busca e exclusão de IDs; carregamento e busca também verificados na imagem Docker Alpine standalone.
- Postgres + pgvector e Chroma: serviços reais descartáveis, com indexação, consulta, reaproveitamento no Record Manager Postgres, remoção da geração anterior e exclusão de fonte/base.
- SQL de preparação do Supabase: executado no Postgres com pgvector, incluindo busca e isolamento por filtro.
- MongoDB Atlas e SingleStore: contratos dos drivers com substitutos de teste, cobrindo fechamento de conexões, falhas, indexação, busca e exclusão.
- Demais serviços: testes de contrato HTTP. Não foram usadas contas reais de Gemini, OpenAI, VoyageAI, Pinecone, Supabase, Atlas ou demais serviços externos nesta validação. Não equivale a homologação em todas as versões e configurações desses serviços.
- Navegador: seleção, busca, logos, modelos, salvamento e layout em desktop/celular. Compilação de produção, TypeScript e lint.

Para repetir a integração, forneça um **Postgres descartável** em `KNOWLEDGE_TEST_POSTGRES`; opcionalmente um Chroma em `KNOWLEDGE_TEST_CHROMA`, e execute:

```sh
node --import ./scripts/gancho-ts.mjs scripts/verify-knowledge-services.mjs
```

O script cria e remove tabelas de teste com prefixo `knowledge_test_`. Não use banco de produção. Os testes unitários usam `npm test`.

Os 37 logos foram copiados do Flowise local, com atribuição e licença em `public/knowledge-icons/`.
