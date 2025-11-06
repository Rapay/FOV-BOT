const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Trava ou destrava um canal (impede/enables envio para @everyone).')
    .addBooleanOption(o=>o.setName('lock').setDescription('true para travar, false para destravar').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você precisa de Manage Channels ou Administrator para usar este comando.', ephemeral: true });
    }
    const shouldLock = interaction.options.getBoolean('lock');
    const channel = interaction.channel;
    try {
      const overwrite = channel.permissionOverwrites.cache.get(interaction.guild.id) || {};
      await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: !shouldLock });
      return interaction.reply({ content: shouldLock ? 'Canal travado (envio impedido).' : 'Canal destravado (envio permitido).', ephemeral: true });
    } catch (err) {
      console.error('Erro em /lock:', err);
      return interaction.reply({ content: 'Falha ao ajustar permissões do canal.', ephemeral: true });
    }
  }
};
