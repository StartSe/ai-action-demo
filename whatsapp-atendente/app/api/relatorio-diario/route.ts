import { criar, listar, motivoCanalIndisponivel } from "@/lib/rotinas";
import { registrarEnderecoPublico } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";
import type { Canal } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

/**
 * O relatório diário do atendimento visto do cartão de /relatorios: um agendamento só, criado em um
 * clique, em vez do formulário inteiro de rotinas de /setup (que continua existindo e é quem edita,
 * pausa ou apaga este mesmo agendamento — é a mesma rotina, na mesma tabela).
 *
 * Esta rota é própria do app; `app/api/rotinas` é infraestrutura compartilhada e não muda por causa
 * de um cartão de uma tela.
 */
const TIPO = "relatorio-atendimento";

/** Todo dia às 8h: cedo o bastante para a pessoa ler antes de abrir o comércio. */
const HORA = "08:00";

function canalConfigurado(): Canal {
  return getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
}

function estado() {
  const canal = canalConfigurado();
  const destinoPadrao = getConfig("NOTIFICACOES_DESTINO") || "";
  const rotina = listar().find((r) => r.tipo === TIPO);
  return {
    canal,
    /** Por onde as notificações conseguem sair hoje; sem isso, o cartão leva à tela de configuração. */
    prontas: !motivoCanalIndisponivel(canal),
    agendado: rotina ? { hora: rotina.hora, ativa: rotina.ativa, destino: rotina.destino || destinoPadrao } : null,
  };
}

export async function GET() {
  return Response.json(estado());
}

export async function POST(req: Request) {
  // O aviso leva o link do relatório salvo: o app precisa saber por qual endereço ele é aberto.
  registrarEnderecoPublico(req);

  const atual = estado();
  // Já agendado: responder o estado (e não um erro) deixa a tela se acertar sozinha quando duas abas
  // clicam no botão, ou quando a rotina foi criada por /setup antes.
  if (atual.agendado) return Response.json(atual);

  const motivo = motivoCanalIndisponivel(atual.canal);
  if (motivo) return Response.json({ error: motivo, motivo: "notificacoes" }, { status: 400 });

  const destino = getConfig("NOTIFICACOES_DESTINO") || undefined;
  if (atual.canal === "email" && !destino) {
    return Response.json({ error: "Informe o e-mail que vai receber o relatório em Notificações.", motivo: "notificacoes" }, { status: 400 });
  }

  criar({ tipo: TIPO, frequencia: "diaria", hora: HORA, canal: atual.canal, destino });
  return Response.json(estado());
}
