// Corpos de exemplo da Z-API, no formato da documentação pública
// (developer.z-api.io, webhooks "Ao receber" e "Status da mensagem", e
// "Status da instância"; as mídias saem de "Exemplos de callback" de
// on-message-received). São os que os testes do canal leem: o formato vem
// daqui, e não de um objeto escrito dentro de cada teste.
//
// Módulo de dado, sem vitest: importado por mais de uma suíte.

export const RECEBIDA_DE_TEXTO = {
  isStatusReply: false,
  chatLid: '81896604192873@lid',
  connectedPhone: '554499999999',
  waitingMessage: false,
  isEdit: false,
  isGroup: false,
  isNewsletter: false,
  instanceId: 'A20DA9C0183A2D35A260F53F5D2B9244',
  messageId: 'A20DA9C0183A2D35A260F53F5D2B9244',
  phone: '5548999998888',
  fromMe: false,
  momment: 1735732800000,
  status: 'RECEIVED',
  chatName: 'Joana',
  senderPhoto: null,
  senderName: 'Joana Lima',
  photo: 'https://pps.whatsapp.net/v/exemplo.jpg',
  broadcast: false,
  participantPhone: null,
  forwarded: false,
  type: 'ReceivedCallback',
  fromApi: false,
  text: { message: 'Oi, vi o anúncio de vocês e queria entender melhor' },
} as const

export const RECEBIDA_DE_AUDIO = {
  ...RECEBIDA_DE_TEXTO,
  messageId: '3EB0C767D26A1D8A3F1B',
  text: undefined,
  audio: {
    ptt: true,
    seconds: 12,
    audioUrl: 'https://f004.backblazeb2.com/file/exemplo.ogg',
    mimeType: 'audio/ogg; codecs=opus',
  },
} as const

export const RECEBIDA_DE_IMAGEM_COM_LEGENDA = {
  ...RECEBIDA_DE_TEXTO,
  messageId: '3EB0C767D26A1D8A3F1C',
  text: undefined,
  image: {
    mimeType: 'image/jpeg',
    imageUrl: 'https://f004.backblazeb2.com/file/exemplo.jpg',
    thumbnailUrl: 'https://f004.backblazeb2.com/file/exemplo-mini.jpg',
    caption: 'Esse é o nosso galpão',
    width: 600,
    height: 315,
  },
} as const

export const RECEBIDA_DE_IMAGEM_SEM_LEGENDA = {
  ...RECEBIDA_DE_TEXTO,
  messageId: '3EB0C767D26A1D8A3F1D',
  text: undefined,
  image: {
    mimeType: 'image/jpeg',
    imageUrl: 'https://f004.backblazeb2.com/file/exemplo-2.jpg',
    thumbnailUrl: 'https://f004.backblazeb2.com/file/exemplo-2-mini.jpg',
    downloadError: null,
    caption: '',
    width: 600,
    height: 315,
    viewOnce: false,
  },
} as const

export const RECEBIDA_DE_VIDEO = {
  ...RECEBIDA_DE_TEXTO,
  messageId: '3EB0C767D26A1D8A3F1E',
  text: undefined,
  video: { videoUrl: 'https://f004.backblazeb2.com/file/exemplo.mp4', caption: '', mimeType: 'video/mp4', seconds: 13, viewOnce: false },
} as const

export const RECEBIDA_DE_DOCUMENTO = {
  ...RECEBIDA_DE_TEXTO,
  messageId: '3EB0C767D26A1D8A3F1F',
  text: undefined,
  document: {
    documentUrl: 'https://f004.backblazeb2.com/file/proposta.pdf',
    mimeType: 'application/pdf',
    title: 'proposta',
    pageCount: 1,
    fileName: 'proposta.pdf',
  },
} as const

export const RECEBIDA_DE_FIGURINHA = {
  ...RECEBIDA_DE_TEXTO,
  messageId: '3EB0C767D26A1D8A3F20',
  text: undefined,
  sticker: { stickerUrl: 'https://f004.backblazeb2.com/file/figurinha.webp', mimeType: 'image/webp' },
} as const

export const ENVIADA_POR_MIM = { ...RECEBIDA_DE_TEXTO, messageId: 'DE-MIM-1', fromMe: true } as const

export const DE_GRUPO = {
  ...RECEBIDA_DE_TEXTO,
  messageId: 'GRUPO-1',
  isGroup: true,
  phone: '120363019502650977-group',
} as const

export const STATUS_LIDA = {
  instanceId: 'A20DA9C0183A2D35A260F53F5D2B9244',
  status: 'READ',
  ids: ['3EB0796DC6B777C0C7CD'],
  momment: 1735732860000,
  phoneDevice: 0,
  phone: '5548999998888',
  type: 'MessageStatusCallback',
  isGroup: false,
} as const

export const RESPOSTA_DO_ENVIO = {
  zaapId: '3999984263738042930CD6ECDE9VDWSA',
  messageId: 'D241XXXX732339502B68',
  id: 'D241XXXX732339502B68',
} as const

export const INSTANCIA_CONECTADA = { connected: true, error: '', smartphoneConnected: true } as const

export const INSTANCIA_DESCONECTADA = {
  connected: false,
  error: 'You are not connected.',
  smartphoneConnected: false,
} as const

/** A recusa da Z-API quando o token de segurança não confere. */
export const RECUSA_DO_CLIENT_TOKEN = { error: 'your client-token is not configured' } as const
