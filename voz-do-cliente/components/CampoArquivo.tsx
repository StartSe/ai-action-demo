// Upload de arquivo CSV/TXT com seleção de coluna, processado no navegador.
export function CampoArquivo({
  nomeArquivo,
  headers,
  idxTexto,
  idxNota,
  onArquivo,
  onColTexto,
  onColNota,
}: {
  nomeArquivo: string;
  headers: string[] | null;
  idxTexto: number;
  idxNota: number;
  onArquivo: (file: File | null) => void;
  onColTexto: (idx: number) => void;
  onColNota: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 mb-4 min-w-0 [&>*]:min-w-0">
      <label htmlFor="arquivo" className="text-[13px] font-semibold">Ou envie um arquivo CSV ou TXT</label>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="file-btn" htmlFor="arquivo">Escolher arquivo CSV ou TXT</label>
        <input
          id="arquivo"
          type="file"
          className="file-hidden"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(e) => onArquivo(e.target.files?.[0] ?? null)}
        />
        {nomeArquivo && <span className="text-[12.5px] text-muted">Arquivo: {nomeArquivo}</span>}
      </div>
      <span className="text-[12.5px] text-muted">Processado aqui no navegador, nada é enviado antes de você analisar.</span>

      {headers && headers.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          <label htmlFor="colTexto" className="text-[13px] font-semibold">Coluna com o comentário</label>
          <select id="colTexto" className="input" value={idxTexto} onChange={(e) => onColTexto(Number(e.target.value))}>
            {headers.map((h, i) => (
              <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
            ))}
          </select>
          <label htmlFor="colNota" className="text-[13px] font-semibold mt-2">Coluna com a nota NPS (opcional, 0 a 10)</label>
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
