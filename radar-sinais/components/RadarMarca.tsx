export function RadarMarca({ tamanho = 24 }: { tamanho?: number }) {
  return <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true"><path d="M24 44a20 20 0 1 1 17-30M24 35a11 11 0 1 1 10-16"/><circle cx="24" cy="24" r="3.5"/><circle cx="42" cy="24" r="2" fill="currentColor" stroke="none"/></svg>;
}
export function VozIcone() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 10v4m4-8v12m4-15v18m4-14v10m4-7v4" /></svg>;
}
