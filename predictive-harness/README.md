# Cowork FPEA — v0.2.0

Seu estrategista para criar predições baseadas em dados, explorar cenários e orientar decisões financeiras.

Os identificadores técnicos `predictive-harness` (pasta, imagem e serviço) continuam iguais para preservar as instalações e os volumes existentes.

Agente de **FP&A** (planejamento e análise financeira) por conversa, com a unidade econômica da empresa sendo a **turma**. Você pergunta "se abrirmos uma nova turma, o que acontece com a margem do trimestre?"; um **motor determinístico** faz a conta com premissas visíveis e editáveis, o modelo de linguagem só traduz a pergunta e escreve a leitura, e o **Jev** (System One model da TypeSafe, servido pelo OpenRouter) decide e verifica cada etapa do caminho. Aplicação independente da suíte **IA para Executivos**, com as conexões no padrão do Build Agentflows. A proposta e o pivô estão em [PLANO.md](PLANO.md).

[Publicar no Render](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-predictive-harness)

## O que faz nesta versão

1. Crie a conta desta instalação ao abrir o app. Uma **escola de negócios de exemplo** já vem pronta: matrículas de 24 meses, custos por turma e marketing por mês, com três produtos e quatro perguntas cujas respostas são calculadas localmente pelo motor e marcadas como exemplo.
2. Envie suas planilhas em CSV ou JSON (até 20 MB, 200 mil linhas). Além do perfil de cada coluna (tipo semântico, alvo de previsão, dado pessoal), cada coluna recebe um **papel de FP&A** — receita, desconto, custo fixo, custo variável, marketing, produto, turma, alunos, data, canal ou nenhum — pela heurística local e, com o OpenRouter conectado, pelo Jev na mesma chamada. Você confirma o mapeamento em um passo, e o papel da planilha (matrículas, custos, marketing) sai dele.
3. A base vira **produtos e turmas** com as premissas calculadas do histórico: alunos por turma, ticket cheio, desconto médio, custo fixo por turma, custo variável por aluno e marketing por aluno. Cada premissa mostra a origem (**da base**, **informada** por você ou **sugerida** pelo modelo) e é editável; informadas valem sobre as da base em todos os cenários do produto. Valores sugeridos nunca entram numa conta sem confirmação.
4. Pergunte em português. Cada mensagem percorre o laço do harness:
   - **Triagem (Jev)**: tipo da pergunta (descritiva, diagnóstico, cenário, previsão, meta reversa, risco, conceito, fora), quais premissas estão envolvidas (uma pergunta por premissa, em paralelo), horizonte, se a base basta, impacto da decisão e dado pessoal.
   - **Roteamento (código)**: cenário, ponto de equilíbrio e meta reversa vão para o motor; descritiva e diagnóstico seguem pelos agregados da base.
   - **Especificação (modelo traduz, código valida)**: a pergunta vira uma especificação fechada (produto, turmas, horizonte, premissas ditas na pergunta, meta). Cada campo é validado por faixa; o que não valida é descartado com aviso, nunca assumido em silêncio. Se falta premissa, a resposta é um formulário curto com as sugestões pontuadas pelo Jev, não um número inventado.
   - **Motor (`lib/fpa.ts`, sem IA)**: margem de contribuição por turma, ponto de equilíbrio em alunos, impacto na margem do período de referência, sensibilidade (variação adversa de 10% em cada premissa, ranqueada) e meta reversa (marketing por aluno, ticket, alunos, custo fixo ou desconto).
   - **Narrativa (ChatGPT ou modelo do OpenRouter)**: a leitura executiva escrita **somente** com os números que o motor produziu.
   - **Verificação (Jev)**: os números batem com o motor? há premissa implícita não declarada? pede validação humana? que visual cabe? Se não batem, o modelo reescreve uma vez.
   - **Próximas perguntas**: cinco candidatas, o Jev ranqueia, ficam três.
5. A coluna **Como cheguei aqui** mostra as premissas usadas com a origem, a **fórmula em português com os números substituídos** e todas as decisões do Jev com probabilidade e confiança. Ajustar uma premissa ali **recalcula na hora, só no motor**: sem custo e sem chamada ao modelo.
6. A versão instalada aparece ao lado do título, para saber o que está no ar sem abrir o console.
7. Os cartões são SVG desenhados a partir dos números do motor, nunca imagem gerada: cascata do cenário, sensibilidade, ponto de equilíbrio e meta reversa, cada um com a tabela equivalente ao lado.

Fica para as próximas versões (ver PLANO.md): cenários salvos e comparação lado a lado, plano contra realizado, exportar, MCP, formulário público, execução de código para o que o motor não cobre, busca na web para referências de mercado e XLSX.

## Conexões

A tela **Configurações** tem o mesmo desenho do Build Agentflows:

- **ChatGPT**: assinatura conectada por código de dispositivo pelo [Codex App Server](https://learn.chatgpt.com/docs/app-server) oficial (`@openai/codex` fixado em 0.155.1), com os limites de uso da conta. Sessão privada em `DATA_DIR/chatgpt`; nunca herda credenciais da máquina.
- **OpenRouter** (obrigatório): conexão em um clique (OAuth PKCE) ou chave colada, gravada cifrada. É onde vive o Jev (`typesafe/jev-1.13`, `POST /api/v1/systemone`, em beta) e também oferece modelos de conversa. O botão **Testar decisão** faz uma chamada real e pequena e mostra endereço que respondeu, latência, custo e a resposta bruta.
- **Modelo da conversa**: ChatGPT ou OpenRouter, escolhido explicitamente; nunca há fallback silencioso entre provedores. Opcionalmente um segundo modelo para análises complexas.

Sem o OpenRouter, o harness não roda: a base de exemplo responde só às quatro perguntas sugeridas e as suas planilhas mostram produtos, turmas e premissas, sem conversa.

## Rodar localmente

Node 22.13+ para o servidor; Node 24 para os testes TypeScript.

```sh
npm ci
npm run dev -- --port 3022
```

Abra http://localhost:3022, crie a conta e, em Configurações, conecte o ChatGPT e o OpenRouter. `/?exemplo=1` abre a base de exemplo e envia a pergunta de cenário.

```sh
npm test        # motor de FP&A (casos fechados), base e livro de premissas, papéis das colunas, laço e recálculo local, contratos do Jev (sem crédito), leitura de planilhas, protocolo do ChatGPT (fixture)
npm run lint
npm run build
```

## Rodar com Docker

```sh
docker compose up --build
```

Abra `http://localhost:3022`. O volume `dados` preserva banco, chave mestra, planilhas e a sessão ChatGPT. Faça backup de **todo** o diretório, inclusive `chave-mestra`.

## Publicar imagem e deploy no Render

O push na `main` publica `ghcr.io/startse/predictive-harness:latest` pelo workflow da suíte e gera a prévia do catálogo. O `render.yaml`, gerado a partir de `catalogo.json`, usa plano Starter e disco persistente de 1 GB em `/app/data`. A imagem precisa estar pública para a instalação sem autenticação no registro. Não use `CONTA_DESLIGADA` em produção.

## Variáveis de ambiente (todas opcionais)

Nada é obrigatório: as conexões são feitas na tela. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Diretório de dados (padrão `./data`; no Docker `/app/data`). |
| `OPENROUTER_API_KEY` | Chave do OpenRouter ([obter](https://openrouter.ai/keys)). Liga o Jev e os modelos do OpenRouter. |
| `AI_PROVIDER` | `chatgpt` (padrão) ou `openrouter`: quem escreve as respostas. |
| `AI_MODEL` / `AI_MODEL_FORTE` | Modelo padrão e modelo para análises complexas (vazio = automático). |
| `CHAVE_MESTRA` | 32 bytes em base64 para cifrar segredos; sem ela, gerada em `DATA_DIR/chave-mestra`. |
| `NOVA_SENHA_ADMIN` | Troca a senha da conta na subida; remova depois. |
| `CONTA_DESLIGADA` | `1` só no contêiner efêmero de captura de prévia. |

## Estrutura

- `lib/jev.ts`: cliente do Jev (três primitivas, normalização tolerante à beta, caminho alternativo, leitura com confiança como segundo eixo).
- `lib/fpa.ts`: o motor determinístico (contribuição, ponto de equilíbrio, cenário, sensibilidade, meta reversa e as fórmulas em português). Nunca chama IA.
- `lib/base.ts`: produtos e turmas a partir das planilhas com papel, premissas da base, livro de premissas e período de referência.
- `lib/cenarios.ts`: da especificação fechada ao resultado e aos cartões; é também o caminho do recálculo local e da demonstração.
- `lib/papeis.ts`: papel de FP&A por coluna (heurística local e a pergunta do Jev).
- `lib/conversa.ts`: o laço do harness, turno a turno, com registro de cada decisão.
- `lib/planilhas.ts`: leitura de CSV e JSON, perfil, agregados para o LLM, classificação pelo Jev e persistência.
- `lib/ai.ts`: o modelo de linguagem (ChatGPT pelo Codex App Server ou OpenRouter), sem fallback entre provedores.
- `lib/chatgpt.ts`, `lib/store.ts`, `lib/conta.ts`, `proxy.ts`: infraestrutura da suíte, copiada do Mapia.
- `lib/demo.ts`: as três planilhas da escola de negócios de exemplo e as quatro respostas de demonstração, calculadas pelo motor a partir delas.
- `components/Workspace.tsx`, `Base.tsx`, `Conversa.tsx`, `Cartoes.tsx`, `ComoCheguei.tsx`: a tela de três colunas.
- `components/Configuracoes.tsx`, `app/api/conexoes/*`, `app/api/chatgpt/*`: conexões.

## Referências

- [Building a harness with Jev (LangChain)](https://www.langchain.com/blog/building-a-harness-with-jev)
- [TypeSafe: primitivas](https://docs.typesafe.ai/primitives) e [padrões](https://docs.typesafe.ai/patterns)
- [Jev no OpenRouter](https://openrouter.ai/typesafe/jev-1.13) e [SDK TypeSafe pelo OpenRouter](https://openrouter.ai/docs/guides/community/typesafe-sdk)
