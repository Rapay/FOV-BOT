try { require('dotenv').config(); } catch (e) { /* dotenv not installed — rely on process.env being set */ }
const { REST, Routes } = require('discord.js');
const fs = require('fs');

async function deployCommands(options = {}) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = options.guildId || process.env.GUILD_ID; // optional override

  if (!token || !clientId) {
    throw new Error('Defina TOKEN e CLIENT_ID no .env antes de rodar deploy-commands.');
  }

  const commands = [];
  const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    // skip legacy/disabled command files
    if (file === 'announce.js' || file.endsWith('.disabled.js')) continue;
    const cmd = require(`./commands/${file}`);
    // safety: ensure command exposes data
    if (!cmd || !cmd.data || typeof cmd.data.toJSON !== 'function') continue;
    commands.push(cmd.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(token);
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
    throw err;
  }
}

// When run directly, execute deploy (CLI mode)
if (require.main === module) {
  deployCommands().catch(err => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = deployCommands;
