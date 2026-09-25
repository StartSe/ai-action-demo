// O que a tela lê quando whatsapp-send recusa, e com que status HTTP.
//
// Registro de interface: direto e declarativo (docs/padrao-de-interface.md
// seção 4). A tela mostra a frase como veio; o código viaja em `motivo` para
// ela escolher o que oferecer ao lado.

export type MotivoDoEnvio =
  | 'metodo_invalido'
  | 'pedido_invalido'
  | 'texto_vazio'
  | 'texto_longo'
  | 'sem_sessao'
  | 'sem_acesso'
  | 'conversa_nao_encontrada'
  | 'lead_nao_encontrado'
  | 'canal_desligado'
  | 'fora_do_modo_de_teste'
  | 'conversa_encerrada'
  | 'conversa_ativa'
  | 'numero_bloqueado'
  | 'assistente_nao_publicada'
  | 'whatsapp_nao_configurado'
  | 'modelo_nao_conectado'
  | 'falha_da_assistente'
  | 'falha_no_envio'
  | 'falha_interna'

export const MENSAGENS_DO_ENVIO: Record<MotivoDoEnvio, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  pedido_invalido: 'O pedido chegou sem a conta, sem a conversa ou com uma ação que não existe.',
  texto_vazio: 'Escreva a mensagem antes de enviar.',
  texto_longo: 'A mensagem passa de 4.096 caracteres. Divida em mensagens menores.',
  sem_sessao: 'Entre na sua conta para conversar pelo WhatsApp.',
  sem_acesso: 'Seu papel nesta conta não permite conversar pelo WhatsApp. Peça acesso de operador a quem administra a conta.',
  conversa_nao_encontrada: 'Esta conversa não existe nesta conta.',
  lead_nao_encontrado: 'Este lead não existe nesta conta ou não tem telefone.',
  canal_desligado: 'A assistente está desligada no WhatsApp desta conta. Ligue o canal na configuração para ela responder.',
  fora_do_modo_de_teste: 'No modo de teste, a assistente só conversa com os números de teste da conta.',
  conversa_encerrada: 'Esta conversa foi encerrada. Abra uma conversa nova pelo lead.',
  conversa_ativa: 'Já existe uma conversa aberta com este lead. Continue por ela.',
  numero_bloqueado: 'Este número está na lista de bloqueio e não recebe mensagens.',
  assistente_nao_publicada: 'A assistente ainda não foi publicada. Publique a assistente em Playbooks: o WhatsApp usa a mesma que está no ar na voz.',
  whatsapp_nao_configurado: 'O WhatsApp desta conta não está configurado. Cadastre as chaves da Z-API em Integrações.',
  modelo_nao_conectado: 'Nenhum modelo está conectado a esta conta. Conecte o OpenRouter em Integrações para a assistente escrever.',
  falha_da_assistente: 'A assistente não conseguiu escrever a mensagem agora. Tente de novo ou escreva você mesmo.',
  falha_no_envio: 'A Z-API não aceitou a mensagem. Confira o estado da instância em Integrações e tente de novo.',
  falha_interna: 'Não foi possível concluir agora. Tente de novo em alguns minutos.',
}

export const STATUS_DO_ENVIO: Record<MotivoDoEnvio, number> = {
  metodo_invalido: 405,
  pedido_invalido: 400,
  texto_vazio: 400,
  texto_longo: 400,
  sem_sessao: 401,
  // Não ser membro e não ter o papel são o mesmo 403: dizer "não existe" para
  // uma conta que existe não protege nada de quem já tem o identificador.
  sem_acesso: 403,
  conversa_nao_encontrada: 404,
  lead_nao_encontrado: 404,
  canal_desligado: 409,
  fora_do_modo_de_teste: 409,
  conversa_encerrada: 409,
  conversa_ativa: 409,
  numero_bloqueado: 409,
  assistente_nao_publicada: 409,
  whatsapp_nao_configurado: 428,
  modelo_nao_conectado: 428,
  falha_da_assistente: 502,
  falha_no_envio: 502,
  falha_interna: 500,
}
