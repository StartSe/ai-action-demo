// Corpos de exemplo do OpenRouter, recortados de respostas reais de
// `GET /api/v1/models` (2026-09) e do formato de chat documentado em
// openrouter.ai/docs (multimodal: imagens e áudio). São o que os testes de
// catálogo e de leitura de mídia leem: o formato vem daqui, e não de um objeto
// escrito dentro de cada teste.
//
// Módulo de dado, sem vitest.

/** Três modelos do catálogo: só texto, texto e imagem, e texto, imagem e áudio. */
export const CATALOGO_COM_MODALIDADES = {
  data: [
    {
      id: 'z-ai/glm-5.3-prime',
      name: 'Z.ai: GLM 5.3 Prime',
      context_length: 1000000,
      architecture: {
        modality: 'text->text',
        input_modalities: ['text'],
        output_modalities: ['text'],
        tokenizer: 'Other',
        instruct_type: null,
      },
      pricing: { prompt: '0.0000028', completion: '0.0000088' },
    },
    {
      id: 'deepseek/deepseek-v4.1-flash',
      name: 'DeepSeek: DeepSeek V4.1 Flash',
      context_length: 1048576,
      architecture: {
        modality: 'text+image->text',
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        tokenizer: 'DeepSeek',
        instruct_type: null,
      },
      pricing: { prompt: '0.00000015', completion: '0.0000006' },
    },
    {
      id: 'google/gemini-3.1-flash-lite',
      name: 'Google: Gemini 3.1 Flash Lite',
      context_length: 1048576,
      architecture: {
        modality: 'text+image+file+audio+video->text',
        input_modalities: ['text', 'image', 'video', 'file', 'audio'],
        output_modalities: ['text'],
        tokenizer: 'Gemini',
        instruct_type: null,
      },
      pricing: { prompt: '0.00000025', completion: '0.0000015', image: '0.00000025', audio: '0.0000005' },
    },
    // Modelo antigo, sem `architecture`: o catálogo não diz o que ele aceita.
    { id: 'antigo/sem-arquitetura', name: 'Antigo', context_length: 8192, pricing: { prompt: '0.000001', completion: '0.000002' } },
  ],
} as const

/** Uma volta de chat com a transcrição, no formato da OpenAI que o provedor normaliza. */
export const VOLTA_DA_TRANSCRICAO = {
  id: 'gen-1758800000-abc',
  model: 'google/gemini-3.1-flash-lite',
  choices: [
    {
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'Oi, eu queria saber o preço do frete para Curitiba.' },
    },
  ],
  usage: { prompt_tokens: 412, completion_tokens: 18, total_tokens: 430 },
} as const

/** A volta quando o modelo não entendeu o áudio e seguiu a instrução. */
export const VOLTA_INAUDIVEL = {
  ...VOLTA_DA_TRANSCRICAO,
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '[inaudivel]' } }],
} as const

export const VOLTA_DA_DESCRICAO = {
  ...VOLTA_DA_TRANSCRICAO,
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'Um galpão com prateleiras de paletes. Na parede, uma placa com o texto "Doca 3".',
      },
    },
  ],
  usage: { prompt_tokens: 1290, completion_tokens: 25, total_tokens: 1315 },
} as const

/** A recusa do provedor quando o modelo não aceita a entrada. */
export const RECUSA_DE_ENTRADA = {
  error: { code: 400, message: 'No endpoints found that support input audio' },
} as const
