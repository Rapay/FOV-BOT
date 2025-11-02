require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional: for guild-scoped during development

if (!token || !clientId) {
  console.error('Defina TOKEN e CLIENT_ID no .env antes de rodar deploy-commands.');
  process.exit(1);
}

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(`./commands/${file}`);
  commands.push(cmd.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Registrando ${commands.length} comandos...`);
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('Comandos registrados (guild).');
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Comandos registrados (global).');
    }
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }
})();
