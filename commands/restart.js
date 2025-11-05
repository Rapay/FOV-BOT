const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const deployCommands = require('../deploy-commands');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Atualiza comandos e reinicia o bot (Admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.reply({ content: 'Iniciando deploy e reinício...', ephemeral: true });
    try {
      // tenta deploy imediato (usa GUILD_ID do env se presente)
      await deployCommands();
      console.log('Deploy executado via /restart.');
    } catch (err) {
      console.error('Falha no deploy via /restart:', err);
    }
    // fecha processo para o host reiniciar
    setTimeout(() => process.exit(0), 1200);
  }
};
