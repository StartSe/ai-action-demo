# Validação do nível aprofundado — 1.4.0

Caso de referência: [vídeo fornecido pelo usuário](https://www.youtube.com/watch?v=1QNsdr-Qx_I), comparado às duas capturas do mapa. A leitura das legendas públicas em 22/09/2026 confirma os seguintes detalhes como critérios de revisão. Estes critérios não são fatos sobre um produto fora do contexto do vídeo.

| Trecho aproximado | Informação que deve aparecer no mapa, quando presente na análise recebida |
| --- | --- |
| 0:15–0:36 | Círculo vira janela de foguete; refinamento por voz; modelo no Blender. |
| 0:44–0:55 e 2:10–2:17 | Apresentação de roupas de chuva; estética sofisticada e colorida; fundo ajustado às jaquetas. |
| 0:57–1:04 e 1:38–1:51 | Anúncio de mesa no eBay, com fotografia e descrição de pequeno dano. |
| 1:07–1:15 | Jogo de desviar de asteroides; setas para movimento e espaço para impulso. |
| 1:16–1:20 | Pedido de carne com arroz no restaurante usado anteriormente. |
| 1:20–1:29 e 1:51–2:05 | Minuta de licença para revisão jurídica; responsabilidade limitada a favor do licenciante. |
| 1:30–1:38 e 2:20–2:25 | Busca de quadra em Lower Haight e confirmação do horário das 17h. |
| 2:25–2:32 | Arquivo STL do foguete para impressão 3D. |

Também revisar: nome específico no centro; agrupamento temático coerente; informação nos labels e não só nas notas; ausência de duplicação; referências corretas; distinção entre pedido, ação e resultado confirmado. Tamanho sozinho não mede qualidade. Não preencher ramos de segurança ou capacidades gerais com inferências ausentes da fonte.

## Evidências e limites da validação

- `npm test`: contratos de streaming e geração; planejamento seguido de aprofundamento; fonte integral em todas as chamadas; referências, limites, IDs, persistência e interrupções.
- `npm run lint` e `npm run build`: análise estática e build de produção.
- Navegador com provedores simulados: envio e espera, movimento reduzido, progresso por ramo, navegação, retomada, conclusão, cancelamento e erro; larguras de 1440, 390 e 320 px.
- Os testes não avaliam semanticamente uma resposta real de Gemini/ChatGPT/OpenRouter. Não havia conexão real de provedor configurada nesta instalação de desenvolvimento. A extração de legendas foi usada apenas para conferir o caso; a importação do app continua com Gemini e inclui a análise visual.

Para comparar modelos, gerar novamente o link no nível aprofundado e revisar os critérios acima contra a fonte recebida, registrando modelo, duração e mapa exportado. Se um fato não aparece na análise Gemini, revisar a extração antes de atribuir a ausência à organização do mapa.
