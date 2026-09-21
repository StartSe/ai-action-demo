# Notas de versão

## 0.5.2 — 2026-09-21

- Todo candidato com URL de perfil do LinkedIn selecionado para verificação passa pela leitura `web_data_linkedin_person_profile` quando a ação está disponível, mesmo quando a busca ou o dataset já trouxe cargo, empresa e contexto detalhado.
- Reaproveita leituras em cache por até 24 horas, evita repetir o enriquecimento e mantém os limites de consultas, tempo e cancelamento. Sem a ação disponível, preserva o contexto existente e as alternativas de pesquisa.
- Testes cobrem contexto prévio do dataset, reaproveitamento entre prospecções, ação indisponível e distinção entre perfil pessoal e página de empresa.

## 0.5.1 — 2026-09-21

- Enriquecimento não encerra apenas por já haver nome, cargo e empresa: prioriza LinkedIn Person Profile para obter contexto profissional adicional, reaproveitando perfis detalhados já coletados.
- Perfil indisponível ou raso aciona até duas buscas por nome completo entre aspas e endereço do LinkedIn nas fontes conectadas. Só incorpora conteúdo que retorna o mesmo perfil e o nome completo, mantendo a origem e evitando homônimos.
- Preserva cidade e site ao complementar os dados, evita repetir consultas e respeita cancelamento e limites existentes. Testes simulam perfil completo, busca nominal, falhas, homônimos, cache e cancelamento.

## 0.5.0 — 2026-09-21

- Tela de andamento com título compacto, contexto expansível, exclusão por ícone e confirmação, etapas por tipo de busca, tempos persistidos e estimativas aproximadas. Mostra trabalho atual, fontes, atraso e próximos passos para resultado vazio, parcial, cancelamento ou falha.
- Atualização resiliente: prazo por requisição, novas tentativas sem sobreposição, aviso de dados desatualizados, reconexão e tratamento de sessão expirada. Falhas ao excluir ou alterar pessoas preservam os dados exibidos.
- Pesquisa B2B adaptativa em rodadas de duas fontes: ProspectHalo MCP, dataset e Search Engine da Bright Data, Exa People Search, Tavily e SearchAPI. Para a descoberta quando há contexto suficiente; a IA pode reordenar fontes e sugerir até duas variações de cargo, sem alterar os critérios de qualificação.
- Verificação de perfis em dois trabalhadores, com LinkedIn Person Profile, LinkedIn People Search por nome conforme o catálogo MCP, Markdown, Exa Contents e Tavily Extract. Reaproveita informações completas, evita leituras repetidas e só associa registros ao mesmo perfil. Extração por IA exige citação verificável.
- Histórico das decisões de pesquisa, limites de consultas e de novas rodadas, preservação de resultados parciais e interrupção após cancelamento. APIs externas validadas com respostas simuladas; a validação de qualidade com fornecedores reais depende das credenciais do ambiente.

## 0.4.0 — 2026-09-21

- Mensagens com descrição e aplicações do produto, contexto da empresa, fontes, citações e lacunas explícitas. Abertura concreta, hipótese sem afirmação indevida e pergunta específica substituem o convite genérico padrão.
- Botão Personalizar mensagem para textos já salvos, por canal, com desfazer; revisão automática limitada para clichês, marcadores e limite do LinkedIn.
- ProspectHalo via MCP: chave ou link protegido, teste de contexto, catálogo dinâmico de coleta, consultas registradas e retomada de buscas pendentes pelo mesmo identificador. Apollo oculto e sem novas chamadas.
- Coleta combina todas as fontes web conectadas e o dataset da Bright Data; intercala e deduplica resultados. Pesquisa complementar de sinais e leitura alternativa na qualificação profunda.
- Promoção automática a qualificado exige confirmação dos critérios avaliados. Dados reais nunca recebem conteúdo de demonstração por falta de leitor.

Validação: 89 testes automatizados com fornecedores e IA simulados, TypeScript, lint sem erros (um aviso preexistente de imagem no setup), build de produção, verificadores de padrão e jargão, e checagem HTTP de health, setup, prospecções e leads. Credenciais reais dos fornecedores não estavam disponíveis no ambiente local; envio pelo LinkedIn não foi implementado.

## 0.3.0 — 2026-09-20

- Escolha da conta de IA em Configurações: OpenRouter (chave ou conexão em um clique) ou assinatura ChatGPT, com login por código de dispositivo pelo conector oficial, escolha do modelo da conta e desconexão. A conta escolhida atende a leitura de produto, qualificação, hipótese de dor, estratégia, mensagens, busca livre e ferramentas MCP, sem troca automática entre contas em caso de erro.
- Menu de modelos do OpenRouter com o grupo "Mais usados": GPT-5.4 Mini, GPT-5.4, Gemini 3.8 Flash, Gemini 3.1 Pro, Claude Sonnet 5, DeepSeek V4.1 Flash e outros, sempre conferidos no catálogo vivo; variantes de lote, imagem, áudio e código ficam de fora. A rede de segurança sem chave traz os mesmos modelos.
- Nova prospecção com indicador numerado dos quatro passos e uma orientação curta por passo.
- Página da prospecção com tipo de busca e data em chips, funil em cinco números que filtram a lista de pessoas, evidências das empresas resumidas e abertas ao clicar, e o link "Editar perfil ideal".
- Ficha do lead em duas colunas quando aberta como página; painel lateral inalterado.
- Lista de Leads com a coluna "Abordagem" para criar ou ver a abordagem direto da lista.
- Configurações refletem a conta de IA escolhida no cartão, no progresso e no cabeçalho; sugestões não citam mais cartões escondidos.
- Conector oficial do ChatGPT incluído no pacote de produção; versão exposta em `/api/health`.

Validação: 65 testes automatizados (protocolo do conector com respostas simuladas, escolha de conta sem fallback, curadoria do catálogo e as regressões anteriores), lint, build de produção, verificadores de padrão e jargão da suíte e navegação em desktop e celular. Login e geração com conta ChatGPT real não fizeram parte da validação. Detalhes em `../tasks/prospeccao-ia-conta-ia-ux.md`.

## 0.2.1

- Módulo de busca avançada de pessoas via dataset da Bright Data (ainda não integrado ao fluxo).

## 0.2.0

- Arquivar e restaurar prospecções, com filtros Ativas e Arquivadas.

## 0.1.6

- Abordagem com etapas reais transmitidas pelo servidor, estratégia editável, regeneração com desfazer e exportação.
- Qualificação aprofundada com fontes públicas, pontuação verificável e trabalho em segundo plano.

## 0.1.5

- Fontes opcionais de pesquisa (Exa, Tavily e SearchAPI) e diagnóstico das consultas na página da prospecção.

## 0.1.4

- Cartões de produto com a nova prospecção em destaque e exclusão com confirmação; assistente envia o perfil exibido.

## 0.1.3

- Criação de produto por link com progresso visível e cancelamento.

## 0.1.2

- Rotinas e notificações ocultas na interface.

## 0.1.1

- Navegação consistente também em Configurações.
