import { agora, banco } from "./banco";
import { obter, entrevistaViva } from "./entrevistas";
import { obter as obterVaga } from "./vagas";
import { obter as obterFormulario } from "./formularios";
import { obter as obterResultado } from "./historico";
import { comTurnoExclusivo } from "./trava-entrevista";

export class ErroReabertura extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
/** Substitui a tentativa em uma transação e preserva o código entregue ao candidato. */
export async function reabrirEntrevista(id: string, tentativa: number) {
  if (!obter(id)) throw new ErroReabertura("Essa entrevista não existe mais.", 404);
  return comTurnoExclusivo(id, async () => {
    const e = obter(id);
    if (!e) throw new ErroReabertura("Essa entrevista não existe mais.", 404);
    if (e.tentativa !== tentativa) throw new ErroReabertura("A entrevista já foi reaberta. Atualize a página.");
    if (!e.codigo) throw new ErroReabertura("Crie o convite antes de reabrir a entrevista.");
    const vaga = obterVaga(e.vagaId);
    if (!vaga || vaga.status !== "aberta") throw new ErroReabertura("Reabra a vaga antes de reabrir esta entrevista.");
    const viva = entrevistaViva(e.vagaId, e.candidatoId);
    if (viva && viva.id !== id) throw new ErroReabertura("Este candidato já tem outra entrevista ativa nesta vaga.");
    // Inicializa as tabelas compartilhadas antes de iniciar a transação nesta conexão.
    const formulario = obterFormulario(e.codigo);
    obterResultado(e.resultadoId ?? "");
    const db = banco();
    const momento = agora();
    const prazo = new Date(Date.now() + 15 * 86400000).toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM mensagens_entrevista WHERE entrevistaId = ?").run(id);
      db.prepare("DELETE FROM respostas WHERE token = ?").run(e.codigo);
      db.prepare("DELETE FROM resultados WHERE id = ? OR (tipo = 'parecer' AND json_extract(entrada, '$.entrevistaId') = ?)").run(e.resultadoId ?? "", id);
      db.prepare(`INSERT INTO formularios (token, tipo, campos, parametros, expiraEm, limite, criadoEm)
        VALUES (?, 'entrevista', '[]', ?, NULL, 1, ?)
        ON CONFLICT(token) DO UPDATE SET expiraEm = NULL, limite = 1`).run(e.codigo,
          JSON.stringify(formulario?.parametros ?? { entrevistaId: id, titulo: `Entrevista para ${vaga.cargo}` }), momento);
      db.prepare(`UPDATE entrevistas SET tentativa = tentativa + 1, status = 'convidada',
        convidadaEm = ?, expiraEm = ?, abertaEm = NULL, iniciadaEm = NULL, concluidaEm = NULL,
        nivelVoz = NULL, resultadoId = NULL, parecerStatus = 'nao_pedido', decisao = NULL, decisaoEm = NULL, memoria = NULL
        WHERE id = ?`).run(momento, prazo, id);
      db.exec("COMMIT");
    } catch (err) { db.exec("ROLLBACK"); throw err; }
    return obter(id)!;
  });
}
