// Upload de arquivo CSV/TXT (Dropzone compartilhado, compactado pela classe .dropzone-compacta de globals.css) com
// seleção de coluna quando é CSV, processado no navegador.
import { Dropzone } from "@/components/ui";

export function CampoArquivo({
  arquivo,
  headers,
  idxTexto,
  idxNota,
  onArquivo,
  onColTexto,
  onColNota,
}: {
  arquivo: File | null;
  headers: string[] | null;
  idxTexto: number;
  idxNota: number;
  onArquivo: (file: File | null) => void;
  onColTexto: (idx: number) => void;
  onColNota: (idx: number) => void;
}) {
  return (
    <div className="dropzone-compacta">
      <Dropzone id="arquivo-comentarios" accept=".csv,.txt,text/csv,text/plain" tiposLabel="CSV ou TXT" maxSizeMB={5} arquivo={arquivo} onArquivo={onArquivo} />

      {headers && headers.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
          <label htmlFor="colTexto" className="text-[13px] font-semibold">Coluna com o comentário</label>
          <select id="colTexto" className="input" value={idxTexto} onChange={(e) => onColTexto(Number(e.target.value))}>
            {headers.map((h, i) => (
              <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
            ))}
          </select>
          <label htmlFor="colNota" className="text-[13px] font-semibold mt-2">Coluna com a nota de 0 a 10 (opcional)</label>
          <select id="colNota" className="input" value={idxNota} onChange={(e) => onColNota(Number(e.target.value))}>
            <option value={-1}>Nenhuma</option>
            {headers.map((h, i) => (
              <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
