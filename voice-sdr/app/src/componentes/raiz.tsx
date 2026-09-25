import { Outlet } from '@tanstack/react-router'

/**
 * Componente da rota raiz. Fica vazio de propósito: as telas de autenticação
 * não têm barra lateral, e a casca da aplicação é a rota-camada `aplicacao`.
 */
export function Raiz() {
  return <Outlet />
}
