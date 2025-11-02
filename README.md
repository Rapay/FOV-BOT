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
