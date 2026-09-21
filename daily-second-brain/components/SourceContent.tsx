import type { Note } from "@/lib/types";
import { sourcePreview } from "@/lib/source-preview";
import { Markdown } from "./Markdown";
function time(value: string) {
  const date = /^\d{10}(\.\d+)?$/.test(value)
    ? new Date(Number(value) * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value || "—"
    : date.toLocaleString("pt-BR");
}
export function SourceContent({
  note,
  notes,
  open,
}: {
  note: Note;
  notes: Note[];
  open: (n: Note) => void;
}) {
  const preview = sourcePreview(note);
  if (!preview.collected)
    return <Markdown content={note.content} notes={notes} open={open} />;
  return (
    <div className="source-content">
      {preview.messages.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Mensagens coletadas"
        >
          <table className="source-table message-table">
            <caption>
              {preview.messages.length} mensagens · {preview.origin}
            </caption>
            <thead>
              <tr>
                <th scope="col">Autor</th>
                <th scope="col">Mensagem</th>
                <th scope="col">Data</th>
              </tr>
            </thead>
            <tbody>
              {preview.messages.map((m, i) => (
                <tr key={i}>
                  <td>{m.author || "—"}</td>
                  <td className="message-text">
                    {m.text}
                    {/^https?:\/\//i.test(m.url) && (
                      <a
                        className="text-button"
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir na origem ↗
                      </a>
                    )}
                  </td>
                  <td>{time(m.when)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="source-text">{preview.text}</div>
      )}
      <details className="source-original">
        <summary>Ver fonte original e detalhes da coleta</summary>
        <pre>{note.content}</pre>
      </details>
    </div>
  );
}
