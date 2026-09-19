// Dados técnicos solicitados explicitamente na seção de integração.
export function IntegrationCode({ id }: { id: string }) {
  return (
    <code className="code-snippet">{`/webhook/flows/${id}\n\n{"input":"Sua solicitação"}`}</code>
  );
}
