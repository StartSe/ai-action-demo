/**
 * O ícone de cada destino da barra lateral, no traço do design system (18px,
 * contorno de 1,8, pontas arredondadas). Com a barra recolhida, abaixo de
 * 1024px, o ícone é o que fica à vista; o nome continua no elo, para o leitor
 * de tela e para o teste.
 *
 * Decorativo: `aria-hidden`, porque o rótulo escrito já diz o destino.
 * Caminho sem ícone próprio cai no ponto.
 */
const TRACOS: Readonly<Record<string, string>> = {
  '/': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  '/fila': 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  '/funil': 'M3 4h18l-7 8.5V19l-4 2v-8.5Z',
  '/leads': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  '/chamadas':
    'M6.5 3.5 9 8l-2 2c1.7 3.4 3.6 5.3 7 7l2-2 4.5 2.5c.4.2.6.7.5 1.1-.5 1.8-1.8 2.9-3.6 2.9C10 21.5 2.5 14 2.5 6.6c0-1.8 1.1-3.1 2.9-3.6.4-.1.9.1 1.1.5Z',
  '/reunioes': 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  '/conversas':
    'M4 4h16v12H8l-4 4Zm3 4h10M7 11h6',
  '/sarah/identidade':
    'm12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7ZM19 16l.7 2.2L22 19l-2.3.8L19 22l-.7-2.2L16 19l2.3-.8Z',
  '/sarah/voz': 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 11a7 7 0 0 0 14 0M12 18v3',
  '/sarah/playbooks': 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  '/sarah/conhecimento': 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5v-14M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  '/sarah/ensaio': 'm8 5 11 7-11 7Z',
  '/campanhas': 'M3 10v4h4l7 5V5l-7 5ZM17.5 9a4 4 0 0 1 0 6',
  '/cadencias': 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  '/numeros': 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16',
  '/especialistas':
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7',
  '/config/conta': 'M4 21V6l8-3 8 3v15M9 21v-5h6v5M9 9h.01M15 9h.01M9 12.5h.01M15 12.5h.01',
  '/config/integracoes': 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4',
  '/config/discagem': 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  '/config/bloqueios': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  '/config/privacidade': 'M4 10h16v11H4zM8 10V7a4 4 0 0 1 8 0v3',
  '/config/equipe':
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7',
  '/config/webhooks':
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  '/config/auditoria': 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
}

const PONTO = 'M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z'

export function IconeDeNavegacao({ caminho }: { caminho: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
    >
      <path d={TRACOS[caminho] ?? PONTO} />
    </svg>
  )
}
