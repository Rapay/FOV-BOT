require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
let guildId = process.env.GUILD_ID;

// CLI args: --guild <id> or --global
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--guild' && argv[i+1]) {
    guildId = argv[i+1];
    i++;
  }
  if (argv[i] === '--global') {
    guildId = null;
  }
}

if (!token || !clientId) {
  console.error('Defina TOKEN e CLIENT_ID no .env antes de rodar este script.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Buscando comandos registrados...');
    let regs;
    if (typeof guildId === 'string' && guildId.length > 0) {
      console.log(`Usando GUILD_ID=${guildId} -> buscando comandos da guild`);
      regs = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    } else {
      console.log('Sem GUILD_ID -> buscando comandos globais');
      regs = await rest.get(Routes.applicationCommands(clientId));
    }

    if (!Array.isArray(regs)) regs = [];
    console.log(`Total: ${regs.length} comando(s)`);
    for (const c of regs) {
      console.log(`- ${c.name} (${c.id}) — ${c.description}`);
    }

    // Print full JSON if asked
    if (argv.includes('--json')) {
      console.log(JSON.stringify(regs, null, 2));
    }
  } catch (err) {
    console.error('Erro ao buscar comandos registrados:', err);
    process.exit(1);
  }
})();
