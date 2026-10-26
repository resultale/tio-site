# Institucional chamaotio.com — migração preparada

## Destino e estado

- Origem pública atual: `chamaotio.com`, A `209.50.245.95`. Nenhum serviço antigo foi alterado.
- VPS nova: `209.50.241.86`, acesso `tionova-codex`.
- Projeto: `D:/tio-ai/apps/tio_institucional_v2`, branch `codex/migracao-institucional-v2`, repositório `resultale/tio-site`.
- Container novo: `tio-institucional-v2`, imagem `tio-institucional-v2:391cfc786756`, loopback `127.0.0.1:3180`.
- Release: `/opt/tio-v2/institucional/releases/391cfc786756`.
- Página inicial, motorista, negócio, privacidade e recursos estáticos respondem. `/healthz` responde 200. `/readyz` responde 503 enquanto os contratos SQL não forem aprovados/aplicados. Não fazer a virada de DNS nesse estado.

## O que foi preparado

O visual é o institucional atualmente publicado. Foram copiados os HTML públicos, inclusive os links sociais que estavam efetivamente no ar. O JavaScript usa `/api/site` na mesma origem, sem chamar o painel antigo.

O backend sem dependências externas recebe os formulários, confere cidade/categoria, consentimento, telefone, tipo/tamanho dos arquivos e geocodifica o endereço do negócio com a integração já existente na VPS nova. A chave de servidor e a chave Maps ficam somente em `runtime.env` no servidor, permissão 600, sem conteúdo em logs ou Git. Nenhuma chave foi criada ou rotacionada.

Recepção e análise inicial não aprovam automaticamente conta, veículo, loja ou serviço. O cadastro entra como pendente no banco novo. Uma chave estável de requisição evita duplicar protocolo quando o navegador repete o mesmo envio. Se houver resultado de gravação desconhecido, os anexos são preservados para não deixar um cadastro confirmado sem documento.

## Armazenamento existente, reutilizado

Foi verificado o Supabase Storage já configurado pelo projeto:

- Volume existente: `/opt/tio-v2/supabase/volumes/storage`.
- Bucket existente: **documentos**, privado.
- Tipos permitidos: JPEG, PNG e PDF.
- Limite do bucket: **8 MiB**. O site foi ajustado para documentos até 8 MB e fotos até 5 MB, sem ampliar a configuração compartilhada.
- Prefixo para novos cadastros: `cadastros-site/<protocolo>/<tipo-de-arquivo>.<ext>`.

Não foi criado um segundo volume de documentos. Não escrever diretamente dentro da pasta física do Storage: uploads/downloads/remoção usam a API do Storage, mantendo seus metadados consistentes. O serviço novo já confirmou por HTTP interno que o bucket existe e continua privado, sem listar arquivos de clientes.

Logos e demais arquivos estáticos do próprio site permanecem no pacote de publicação. Documentos enviados por visitantes nunca são servidos como arquivos públicos.

## Banco — aprovação pendente

SQL: `db/institucional_cadastros_v2.sql`. Adiciona somente `core.site_categorias`, `core.site_cadastros` e quatro funções:

- `api.site_catalogo`
- `api.site_cadastro_receber`
- `api.painel_site_cadastros`
- `api.painel_site_documento`

As tabelas têm RLS, sem acesso de anon/authenticated. As funções são exclusivas de service_role; as duas de equipe exigem sessão do operador, área cadastros e cidade autorizada. A chave de serviço nunca é entregue ao navegador.

Proposta registrada pelo conector Tio v2, **não executada**:

```text
ID: 2ab7dae034dd6c719d843e309dcc8c8a
SHA256: 2189e7c7d43c7c44f6bc83ff15956b925ef6ef6b623b739522bfcdaae4865058
```

O conector exige revisão e aprovação independente por SSH com `aprovar-alteracao ID SHA256`. Não contornar o mecanismo executando o SQL por outro caminho. Depois da aprovação, usar a operação de aplicação do conector e verificar o resultado antes de repetir qualquer execução.

## Caixa de entrada privada da equipe

Preparada em `/equipe`: login por OTP WhatsApp, validação no banco e consulta dos protocolos. Download de cada documento verifica novamente a sessão e a permissão correspondente. Cookies HttpOnly/Secure/SameSite=Strict; tokens só em memória do servidor. Reiniciar o serviço encerra os cookies da equipe, sem apagar as sessões do banco. Logout explícito revoga a sessão no banco.

O acesso dessa caixa ainda depende da aplicação dos contratos e de teste com um operador autorizado. Nenhum OTP real foi enviado nesta preparação. O painel administrativo v2 existente pode futuramente consumir as duas RPCs da equipe; não foi reiniciado ou modificado para esta migração.

## Testes realizados

- Sintaxe de Node/JavaScript.
- Seis testes locais isolados: rotas públicas/privadas, origem indevida, registro sintético, reenvio idempotente, anexos inválidos, falha após gravação e reutilização do bucket privado.
- Imagem construída na VPS nova; serviço responde em loopback.
- Metadados reais do Storage conferidos via API interna usando a configuração do servidor, sem expor segredos ou consultar documentos de clientes.
- Caddy candidato validado em container efêmero sem rede. Proxy ativo continua com o mesmo conteúdo.

Ainda pendentes: aplicar/testar SQL; confirmar catálogo real e permissões negativas; teste sintético de recepção e download, com limpeza restrita aos objetos de teste; validar Maps em ambiente de teste autorizado; teste visual no navegador; HTTPS e redirecionamento www depois da virada.

## Proxy e DNS — ainda não alterados

Existe candidato em `/opt/tio-v2/institucional/Caddyfile.candidato`, incluindo o arquivo atual integral e somente os novos hosts `chamaotio.com` e `www.chamaotio.com`. Arquivo original e hash estão no mesmo diretório. O candidato foi validado, não aplicado.

Somente depois de `/readyz` retornar 200 e da homologação:

1. Confirmar os registros atuais de @ e www, incluindo ausência/presença de AAAA, e registrar os valores para reversão. TTL observado do A: aproximadamente uma hora; reduzir antecipadamente se a virada exigir propagação mais rápida.
2. Obter autorização para alterar o proxy compartilhado e o DNS. Não modificar rotas de WhatsApp/Supabase existentes.
3. Conferir que o hash do Caddyfile ativo ainda corresponde ao original; se outro agente mudou o proxy, regenerar o candidato antes de aplicar.
4. Na janela autorizada, apontar o domínio raiz para `209.50.241.86` e www para o mesmo destino/CNAME raiz, conforme os registros existentes.
5. Aplicar o candidato preservando o arquivo bind-mount e recarregar o Caddy sem reiniciar os demais serviços. Conferir certificados, www→raiz, páginas e formulários.
6. Se houver falha, restaurar DNS aos valores registrados e o Caddyfile original, conforme a janela autorizada. O site antigo continua disponível para reversão.

## Atualizações depois da migração

Usar GitHub como origem, imagem Docker versionada e `Dockerfile.v2`. O Dockerfile antigo permanece como referência da publicação anterior; não ligar um pipeline novo a ele por engano. Publicar releases em `/opt/tio-v2/institucional/releases/<hash>`, guardar a imagem anterior e atualizar somente o serviço institucional. Não limpar imagens/arquivos antigos antes de homologar.

Antes da produção, incluir o prefixo de documentos na conferência do backup existente do Storage e verificar se o dump do banco inclui as novas tabelas. Nenhum agendamento ou rotina de backup compartilhada foi alterado.

O Maps tem limite local de 300 consultas externas/dia por processo e cache de cinco minutos; não é um controle distribuído e reinicia com o processo. Revisar o orçamento de uso antes de aumentar o volume. Não foram feitas consultas Maps reais durante os testes desta entrega.
