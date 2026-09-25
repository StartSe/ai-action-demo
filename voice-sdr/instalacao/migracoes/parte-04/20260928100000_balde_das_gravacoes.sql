-- O balde das gravações.
--
-- `call-finalize` baixa o áudio da conversa do provedor de voz e o guarda em
-- `recordings/<conta>/<chamada>.mp3`; `call-audio` o lê de volta para a ficha
-- da chamada. As duas bordas falavam do balde, e nenhuma migração o criava: no
-- projeto real o Storage estava vazio, e toda finalização caía em "gravação
-- falhou" com a transcrição salva e o áudio perdido.
--
-- **Privado, e sem política para o cliente.** Quem escreve é `call-finalize` e
-- quem lê é `call-audio`, as duas com a chave de serviço. O navegador nunca
-- toca o balde: a ficha pede o áudio a `call-audio`, que confere a conta antes
-- de devolver. Uma política em storage.objects abriria um segundo caminho até
-- o arquivo, sem essa conferência.
--
-- **O limite de 50 MB** cobre com folga a duração máxima de chamada permitida
-- (em mp3, dez minutos ficam perto de 10 MB). O tipo não é restringido: o
-- provedor devolve mp3 hoje, e restringir o tipo faria uma troca de formato do
-- lado de lá virar perda de gravação em silêncio.
--
-- `on conflict` porque o balde pode já ter sido criado à mão pelo painel; nesse
-- caso ele é trazido para privado, que é o que importa.

insert into storage.buckets (id, name, public, file_size_limit)
values ('recordings', 'recordings', false, 52428800)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;
