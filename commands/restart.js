const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Reinicia o bot: atualiza comandos e encerra o processo (apenas Owner/Administradores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    // allow either owner (if set) or administrators
    if (ownerId && interaction.user.id !== ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
    }

    await interaction.reply({ content: 'Reiniciando o bot: atualizando comandos (se possível) e encerrando o processo em breve...', ephemeral: true });

    // attempt to deploy commands before exiting (best-effort)
    try {
      const deploy = require('../deploy-commands');
      if (typeof deploy === 'function') {
        await deploy({ guildId: process.env.GUILD_ID });
        console.log('deploy-commands: deploy realizado via /restart');
      }
    } catch (err) {
      console.error('Erro ao executar deploy-commands via /restart:', err);
    }

    // give Discord a moment to deliver the reply, then exit so the host (Discloud) restarts the process
    setTimeout(() => {
      console.log(`Saindo por ordem de ${interaction.user.tag} (${interaction.user.id}).`);
      process.exit(0);
    }, 1200);
  }
};
