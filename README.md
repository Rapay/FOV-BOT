# Fov BOT Loja/Comunidade

Bot do Discord para loja de roupas/comunidade.

## Funcionalidades
- Anúncios embed
- Envio de links, spoilers, promoções
- Sistema de tickets para dúvidas
- Pronto para hospedagem no Discloud

## Como rodar localmente
1. Instale as dependências:
   ```powershell
   npm install
   ```
2. Copie o arquivo de exemplo `.env.example` para `.env` e adicione seu token do Discord:

   ```powershell
   copy .env.example .env
   # então edite .env e preencha TOKEN=
   ```
   Ou defina a variável de ambiente `TOKEN` no seu sistema.
3. Inicie o bot:
   ```powershell
   npm start
   ```

## Principais comandos

- `/ping` — Testa se o bot está online.
- `/announce send` — Envia um anúncio embed. Opções principais:
   - `channel` (canal), `title`, `description`
   - `spoiler`, `promo`, `image`, `thumbnail`, `color`, `footer`, `author_name`, `author_icon`, `url`
   - `role` (mencionar um cargo), `mentioneveryone`, `button_label`, `button_url`, `pin`, `delay`, `preview`
   - Use `preview=true` para ver uma prévia ephemera antes de confirmar o envio.
- `/announce template` — Grupo para gerenciar templates (subcomandos: `save`, `list`, `use`, `delete`). Templates são por guild e salvos em `data/announce_templates.json`.
- `/announce config` — Grupo para configurar permissões do announce (subcomandos: `addrole`, `removerole`, `listroles`).
- `/ticket` — Abrir/fechar tickets (cria canal privado, salva transcritos em `data/transcripts`).
- `/faq` — Gerenciar perguntas frequentes e publicar em um canal configurado.

## Registrar comandos (slash)

Use o script de deploy para registrar comandos. Para desenvolvimento rápido, defina `GUILD_ID` no seu `.env` e rode o deploy para registrar os comandos instantaneamente na guild de testes.

```powershell
npm run deploy-commands
# ou, para registro global (pode demorar até 1 hora para propagar):
node deploy-commands.js
```

## Hospedagem no Discloud
- Ver `DISCORD_DEPLOY.md` para um guia rápido com passos e variáveis de ambiente.


## Hospedagem no Discloud
- Suba todos os arquivos para o painel Discloud.
- Configure a variável de ambiente `TOKEN` com seu token do Discord.
- O comando de inicialização é `npm start`.

Observação: mantenha seu arquivo `.env` fora do controle de versão. Use o arquivo `.env.example` para documentar quais variáveis são necessárias.

## Gerar ZIP pronto para upload (Windows PowerShell)

Você pode usar o script `make_deploy_zip.ps1` incluído no projeto para montar um ZIP contendo apenas os arquivos necessários para o deploy no painel Discloud.

1. Abra PowerShell na raiz do projeto.
2. Execute:

```powershell
.\make_deploy_zip.ps1
```

3. O arquivo `bot-deploy.zip` será gerado na raiz do projeto. Suba esse ZIP no painel Discloud (Projects -> Upload ZIP) e configure as variáveis de ambiente (`TOKEN`, `CLIENT_ID`, `GUILD_ID` se necessário).

Observações:
- O script exclui `node_modules` e `.env` (não serão incluídos no ZIP).
- Se quiser incluir outros arquivos, edite a lista `itemsToCopy` no início do script `make_deploy_zip.ps1`.

Depois do upload, confirme no painel que `MAIN` está definido como `index.js` (ou altere `discloud.config` se preferir apontar para outro arquivo). Clique em Deploy/Start e verifique os logs.
