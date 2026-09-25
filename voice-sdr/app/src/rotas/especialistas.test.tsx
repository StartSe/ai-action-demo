// O que esta tela precisa provar: quem atende a reunião que a Sarah marca
// (US-175, RF-501).
//
// Quatro asserções justificam o arquivo:
//
// 1. **A tela abre dizendo quantos podem receber reunião hoje.** É o número
//    que responde "a Sarah tem para quem encaminhar?", e ele é zero tanto na
//    conta sem cadastro quanto na que desligou todo mundo.
// 2. **Não há excluir, e sim desligar.** O especialista aparece em reuniões
//    passadas, e apagá-lo deixaria o histórico sem quem atendeu.
// 3. **Os problemas do cadastro aparecem todos de uma vez, antes de mandar.**
// 4. **Quem não administra lê tudo, travado, e sabe a quem pedir.** E a
//    gravação que a RLS filtrou vira frase, nunca "salvo".

import { FUSOS_DO_BRASIL } from '@compartilhado/ddd.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { especialistas as copy } from '@/copy/especialistas'
import { campoDeFuso as copyDoFuso } from '@/copy/fuso'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import type { Equipe, Papel } from '@/equipe/tipos'
import { ProvedorDeEspecialistas } from '@/especialistas/provedor'
import { TelaDeEspecialistas } from '@/rotas/especialistas'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeEspecialistasDublado,
  especialistaDeExemplo,
  type RespostasDeEspecialistas,
  type ServicoDeEspecialistasDublado,
} from '@/testes/servico-de-especialistas-dublado'

/** A equipe tem sempre um dono além de quem olha, para haver a quem pedir. */
function comPapel(papelDoUsuario: Papel): Equipe {
  return {
    ...equipeDeExemplo(),
    papelDoUsuario,
    membros: [
      {
        usuarioId: 'u-1',
        nome: 'Renata Alves',
        email: 'renata@aurora.com.br',
        papel: papelDoUsuario,
        ultimoAcesso: null,
      },
      {
        usuarioId: 'u-9',
        nome: 'Selma Dias',
        email: 'selma@aurora.com.br',
        papel: 'owner',
        ultimoAcesso: null,
      },
    ],
  }
}

function montar(
  respostas: RespostasDeEspecialistas = {},
  papel: Papel = 'admin',
): ServicoDeEspecialistasDublado {
  const servico = criarServicoDeEspecialistasDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: comPapel(papel) } })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDeEquipe servico={equipe}>
        <ProvedorDeEspecialistas servico={servico}>
          <TelaDeEspecialistas />
        </ProvedorDeEspecialistas>
      </ProvedorDeEquipe>
    </QueryClientProvider>,
  )
  return servico
}

function preencherObrigatorios() {
  fireEvent.change(screen.getByLabelText(copy.formulario.nome), {
    target: { value: 'Marina Duarte' },
  })
  fireEvent.change(screen.getByLabelText(copy.formulario.email), {
    target: { value: 'marina@empresa.com.br' },
  })
  fireEvent.click(screen.getByRole('button', { name: copy.modalidades.video }))
}

afterEach(cleanup)

test('a conta sem ninguém diz o que está em jogo e o caminho', async () => {
  montar()

  await screen.findByText(copy.vazio.titulo)
  // Sem ninguém, o objetivo da ligação não tem destino.
  expect(screen.getByText(copy.vazio.explicacao)).toBeDefined()
  expect(screen.getByText(copy.ativos(0))).toBeDefined()

  // O caminho está no próprio estado vazio.
  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  expect(screen.getByText(copy.formulario.tituloNovo)).toBeDefined()
})

test('carregando mostra o esqueleto', async () => {
  montar({ pendente: true })

  const espera = await screen.findByRole('status')
  expect(espera.textContent).toContain(copy.carregando)
  expect(espera.querySelector('.esqueleto')).not.toBeNull()
})

test('a carga que falha diz o que fazer, e tentar de novo relê', async () => {
  const servico = montar({ falha: 'falha-de-comunicacao' })

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toContain(copy.falha)

  const carregar = servico.carregar.bind(servico)
  let leituras = 0
  servico.carregar = () => {
    leituras += 1
    return carregar()
  }
  fireEvent.click(screen.getByRole('button', { name: copy.tentarDeNovo }))
  await waitFor(() => expect(leituras).toBe(1))
})

test('a conta que desligou todo mundo também mostra zero ativos', async () => {
  // Dois estados diferentes com a mesma consequência: a Sarah não tem para
  // quem encaminhar.
  montar({ especialistas: [especialistaDeExemplo({ ativo: false })] })

  await screen.findByText(copy.ativos(0))
  expect(screen.getByText(copy.inativo)).toBeDefined()
  // Mas a lista continua: o cadastro existe, só está desligado.
  expect(screen.getByText('Marina Duarte')).toBeDefined()
})

test('a tabela mostra o que a Sarah usa para marcar, com número em .val', async () => {
  montar({ especialistas: [especialistaDeExemplo()] })

  const tabela = await screen.findByRole('table', { name: copy.rotuloDaTabela })
  const titulos = within(tabela)
    .getAllByRole('columnheader')
    .map((celula) => celula.textContent)
  expect(titulos).toEqual(Object.values(copy.colunas))

  const [, linha] = within(tabela).getAllByRole('row')
  const celulas = within(linha!).getAllByRole('cell')
  const porTitulo = (titulo: string) => celulas[titulos.indexOf(titulo)]!

  expect(porTitulo(copy.colunas.area).textContent).toBe('Frotas pesadas')
  expect(porTitulo(copy.colunas.modalidades).textContent).toBe(copy.modalidades.video)
  expect(porTitulo(copy.colunas.duracao).textContent).toBe(copy.duracao(30))
  expect(porTitulo(copy.colunas.teto).textContent).toBe(copy.teto(6))
  expect(porTitulo(copy.colunas.antecedencia).textContent).toBe(copy.antecedencia(120, 30))
  // O fuso pelo nome, não pela zona IANA (D-09). Nome não é valor: sem .val.
  expect(porTitulo(copy.colunas.fuso).textContent).toBe('Horário de Brasília')
  expect(porTitulo(copy.colunas.fuso).className).not.toContain('val')
  for (const titulo of [copy.colunas.duracao, copy.colunas.teto, copy.colunas.antecedencia]) {
    expect(porTitulo(titulo).className).toContain('val')
  }
  expect(porTitulo(copy.colunas.calendario).textContent).toBe(copy.calendario.desconectado)
  // Quem nunca recebeu reunião se anuncia: é o que explica o rodízio.
  expect(screen.getByText(copy.nuncaAtendeu)).toBeDefined()
})

test('a coluna do calendário distingue conectado, esperando e com falha', async () => {
  montar({
    especialistas: [
      especialistaDeExemplo({
        id: 'a',
        nome: 'Conectada',
        calendario: { estado: 'conectado', provedor: 'google', sincronizadoEm: null },
      }),
      especialistaDeExemplo({
        id: 'b',
        nome: 'Com falha',
        calendario: {
          estado: 'com-falha',
          provedor: 'google',
          falha: 'O Google recusou o acesso. Conecte de novo.',
          sincronizadoEm: null,
        },
      }),
    ],
  })

  await screen.findByText('Conectada')
  expect(screen.getByText(copy.calendario.conectado)).toBeDefined()
  expect(screen.getByText(copy.calendario.aguardandoSincronia)).toBeDefined()
  expect(screen.getByText(copy.calendario.comFalha)).toBeDefined()
  // A frase do servidor aparece: é ela que diz o que fazer.
  expect(screen.getByText('O Google recusou o acesso. Conecte de novo.')).toBeDefined()
})

test('cadastrar manda o que a tela preencheu, com o fuso da conta', async () => {
  const servico = montar({ fusoDaConta: 'America/Manaus' })
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  // O fuso nasce com o da conta, e a tela diz que é nele que a
  // disponibilidade vale (T-21).
  expect((screen.getByLabelText(copy.formulario.fuso) as HTMLInputElement).value).toBe(
    'America/Manaus',
  )
  expect(screen.getByText(copy.formulario.apoioDoFuso)).toBeDefined()

  preencherObrigatorios()
  fireEvent.click(screen.getByRole('button', { name: copy.formulario.salvar }))

  await waitFor(() => expect(servico.gravados).toHaveLength(1))
  expect(servico.gravados[0]).toMatchObject({
    id: null,
    nome: 'Marina Duarte',
    email: 'marina@empresa.com.br',
    fuso: 'America/Manaus',
    modalidades: ['video'],
    duracaoPadraoMin: 30,
    ativo: true,
  })
  expect(await screen.findByText(copy.formulario.salvo)).toBeDefined()
  expect(await screen.findByRole('table', { name: copy.rotuloDaTabela })).toBeDefined()
})

test('o fuso é escolhido pelo nome entre os do Brasil, e "Outro fuso" abre o campo (D-09)', async () => {
  const servico = montar({ fusoDaConta: 'America/Sao_Paulo' })
  await screen.findByText(copy.vazio.titulo)
  fireEvent.click(screen.getByRole('button', { name: copy.novo }))

  const fuso = screen.getByRole('combobox', { name: copy.formulario.fuso }) as HTMLSelectElement
  expect([...fuso.options].map((opcao) => opcao.textContent)).toEqual([
    ...FUSOS_DO_BRASIL.map((cada) => copyDoFuso.nomes[cada]),
    copyDoFuso.outro,
  ])
  // Nenhuma opção é o identificador técnico.
  expect([...fuso.options].some((opcao) => opcao.textContent?.includes('America/'))).toBe(false)
  expect(screen.queryByLabelText(copyDoFuso.outroRotulo)).toBeNull()

  fireEvent.change(fuso, { target: { value: 'America/Rio_Branco' } })
  expect(fuso.value).toBe('America/Rio_Branco')

  // Fora da lista: o campo de texto aparece vazio e grava o que se escreveu.
  fireEvent.change(fuso, { target: { value: 'outro' } })
  const outro = screen.getByLabelText(copyDoFuso.outroRotulo) as HTMLInputElement
  expect(outro.value).toBe('')
  fireEvent.change(outro, { target: { value: 'America/Noronha' } })
  expect(fuso.value).toBe('outro')

  preencherObrigatorios()
  fireEvent.click(screen.getByRole('button', { name: copy.formulario.salvar }))
  await waitFor(() => expect(servico.gravados).toHaveLength(1))
  expect(servico.gravados[0]).toMatchObject({ fuso: 'America/Noronha' })
})

test('a área sugere as já cadastradas, para o mesmo time ter a mesma grafia (D-16)', async () => {
  montar({
    especialistas: [
      especialistaDeExemplo(),
      especialistaDeExemplo({ id: 'especialista-2', nome: 'Rui Prado', area: 'frotas pesadas ' }),
      especialistaDeExemplo({ id: 'especialista-3', nome: 'Lia Moura', area: 'Seguros', ativo: false }),
    ],
  })
  await screen.findByRole('table', { name: copy.rotuloDaTabela })
  fireEvent.click(screen.getByRole('button', { name: copy.novo }))

  const area = screen.getByLabelText(copy.formulario.area) as HTMLInputElement
  const lista = document.getElementById(area.getAttribute('list') ?? '')
  expect(lista?.tagName).toBe('DATALIST')
  // Uma grafia por área, e a do especialista desligado fica fora.
  expect([...(lista?.querySelectorAll('option') ?? [])].map((opcao) => opcao.value)).toEqual([
    'Frotas pesadas',
  ])
  expect(screen.getByText(copy.formulario.areasCadastradas(['Frotas pesadas']))).toBeDefined()
})

test('sem área cadastrada, o campo não sugere nada (D-16)', async () => {
  montar()
  await screen.findByText(copy.vazio.titulo)
  fireEvent.click(screen.getByRole('button', { name: copy.novo }))

  expect((screen.getByLabelText(copy.formulario.area) as HTMLInputElement).getAttribute('list')).toBeNull()
})

test('sem modalidade o botão não habilita, e a tela diz por quê', async () => {
  montar()
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  fireEvent.change(screen.getByLabelText(copy.formulario.nome), { target: { value: 'Marina' } })
  fireEvent.change(screen.getByLabelText(copy.formulario.email), {
    target: { value: 'marina@empresa.com.br' },
  })

  expect(screen.getByRole('button', { name: copy.formulario.salvar })).toHaveProperty(
    'disabled',
    true,
  )
  expect(screen.getByText(copy.problemas.modalidades)).toBeDefined()
})

test('duração e teto fora do limite travam o envio antes de mandar', async () => {
  const servico = montar()
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  preencherObrigatorios()
  fireEvent.change(screen.getByLabelText(copy.formulario.duracao), { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText(copy.formulario.teto), { target: { value: '99' } })

  expect(screen.getByText(copy.problemas.duracao)).toBeDefined()
  expect(screen.getByText(copy.problemas.teto)).toBeDefined()
  const salvar = screen.getByRole('button', { name: copy.formulario.salvar })
  expect(salvar).toHaveProperty('disabled', true)
  fireEvent.click(salvar)
  expect(servico.gravados).toHaveLength(0)
})

test('os problemas aparecem todos de uma vez', async () => {
  montar()
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  fireEvent.change(screen.getByLabelText(copy.formulario.teto), { target: { value: '99' } })

  // Nome, e-mail, modalidade e teto: tudo junto, e não um por tentativa.
  expect(screen.getByText(copy.problemas.nome)).toBeDefined()
  expect(screen.getByText(copy.problemas.email)).toBeDefined()
  expect(screen.getByText(copy.problemas.modalidades)).toBeDefined()
  expect(screen.getByText(copy.problemas.teto)).toBeDefined()
})

test('apagar um campo numérico vira problema, e não zero', async () => {
  montar()
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  fireEvent.change(screen.getByLabelText(copy.formulario.duracao), { target: { value: '' } })

  // Sem esta guarda, apagar viraria zero, que é número e passaria em alguns
  // limites sem ninguém notar.
  expect(screen.getByText(copy.problemas.duracao)).toBeDefined()
})

test('editar carrega o cadastro e mantém o id', async () => {
  const servico = montar({ especialistas: [especialistaDeExemplo()] })
  await screen.findByText('Marina Duarte')

  fireEvent.click(screen.getByRole('button', { name: copy.acoes.editar }))

  expect((screen.getByLabelText(copy.formulario.nome) as HTMLInputElement).value).toBe(
    'Marina Duarte',
  )
  fireEvent.change(screen.getByLabelText(copy.formulario.teto), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: copy.formulario.salvar }))

  await waitFor(() => expect(servico.gravados).toHaveLength(1))
  // O id vai junto: corrigir não cria um segundo cadastro.
  expect(servico.gravados[0]?.id).toBe('especialista-1')
  expect(servico.gravados[0]?.tetoDiario).toBe(8)
})

test('desligar tira do rodízio e mantém o cadastro', async () => {
  const servico = montar({ especialistas: [especialistaDeExemplo()] })
  await screen.findByText('Marina Duarte')

  // Não há excluir: o especialista aparece em reuniões passadas.
  expect(screen.queryByRole('button', { name: /excluir/i })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: copy.acoes.desligar }))

  await waitFor(() => expect(servico.alternados).toEqual([{ id: 'especialista-1', ativo: false }]))
  expect(await screen.findByText(copy.desligado)).toBeDefined()
  expect(screen.getByText('Marina Duarte')).toBeDefined()
})

test('religar traz de volta para o rodízio', async () => {
  const servico = montar({ especialistas: [especialistaDeExemplo({ ativo: false })] })
  await screen.findByText('Marina Duarte')

  fireEvent.click(screen.getByRole('button', { name: copy.acoes.religar }))

  await waitFor(() => expect(servico.alternados).toEqual([{ id: 'especialista-1', ativo: true }]))
  expect(await screen.findByText(copy.religado)).toBeDefined()
})

test('o operador lê a tela inteira, travada, e sabe a quem pedir', async () => {
  const servico = montar({ especialistas: [especialistaDeExemplo()] }, 'operator')
  await screen.findByText('Marina Duarte')

  // A negativa é na tela, não na rota, e termina em quem concede o acesso.
  expect(screen.getByText(copy.leitura.aviso)).toBeDefined()
  expect(screen.getByText('Selma Dias')).toBeDefined()

  expect(screen.queryByRole('button', { name: copy.novo })).toBeNull()
  expect(screen.queryByRole('button', { name: copy.acoes.desligar })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: copy.leitura.ver }))
  expect(screen.getByLabelText(copy.formulario.nome)).toHaveProperty('disabled', true)
  expect(screen.getByLabelText(copy.formulario.teto)).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: copy.modalidades.video })).toHaveProperty(
    'disabled',
    true,
  )
  expect(screen.queryByRole('button', { name: copy.formulario.salvar })).toBeNull()
  expect(servico.gravados).toHaveLength(0)

  fireEvent.click(screen.getByRole('button', { name: copy.leitura.fechar }))
  expect(screen.queryByLabelText(copy.formulario.nome)).toBeNull()
})

test('o operador numa conta vazia não recebe o convite de cadastrar', async () => {
  montar({}, 'operator')

  await screen.findByText(copy.vazio.titulo)
  expect(screen.queryByRole('button', { name: copy.novo })).toBeNull()
})

test('quem não administra lê a frase de quem pede', async () => {
  montar({ falha: 'sem-permissao' })

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toContain(copy.semPermissao)
})

test('a gravação recusada por papel mostra a frase dela', async () => {
  montar({ gravacao: { ok: false, motivo: 'sem-permissao' } })
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.novo }))
  preencherObrigatorios()
  fireEvent.click(screen.getByRole('button', { name: copy.formulario.salvar }))

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.falhasDaGravacao['sem-permissao'])
})

test('a escrita que a RLS filtrou vira frase de recusa, e nunca salvo', async () => {
  // O update fora da política volta sem erro e sem linha. O serviço traduz
  // isso em `recusada`; a tela não pode dizer "salvo".
  montar({
    especialistas: [especialistaDeExemplo()],
    gravacao: { ok: false, motivo: 'recusada' },
  })
  await screen.findByText('Marina Duarte')

  fireEvent.click(screen.getByRole('button', { name: copy.acoes.desligar }))

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.falhasDaGravacao.recusada)
  expect(screen.queryByText(copy.desligado)).toBeNull()
})

test('ativos aparecem antes dos desligados', async () => {
  montar({
    especialistas: [
      especialistaDeExemplo({ id: 'a', nome: 'Desligado', ativo: false }),
      especialistaDeExemplo({ id: 'b', nome: 'Ativo', ativo: true }),
    ],
  })

  await screen.findByText('Ativo')
  const [, primeira] = screen.getAllByRole('row')
  // São os que a Sarah pode usar hoje, e é o que quem abre a tela quer ver.
  expect(within(primeira!).getByText('Ativo')).toBeDefined()
})
