#!/usr/bin/env node
require('dotenv').config();
const deployCommands = require('../deploy-commands');

(async () => {
  // Usage:
  //   node tools/deploy-guild.js <GUILD_ID>
  // or set DEV_GUILD_ID in your .env and run: node tools/deploy-guild.js
  const argv = process.argv.slice(2);
  let guildId = argv[0] || process.env.DEV_GUILD_ID || process.env.GUILD_ID;

  if (!guildId) {
    console.error('Uso: node tools/deploy-guild.js <GUILD_ID>  ou defina DEV_GUILD_ID no .env');
    process.exit(1);
  }

  try {
    console.log(`Registrando comandos no guild ${guildId}...`);
    await deployCommands({ guildId });
    console.log('Comandos registrados com sucesso no guild.');
    process.exit(0);
  } catch (err) {
    console.error('Falha ao registrar comandos no guild:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
