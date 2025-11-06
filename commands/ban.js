const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro do servidor')
    .addUserOption(opt => opt.setName('user').setDescription('Membro a banir').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Motivo do ban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'Este comando só pode ser usado em servidores.', ephemeral: true });

    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para banir membros.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || `Banido por ${interaction.user.tag}`;

    try {
      // Use guild.bans.create or members.ban depending on library version; guild.members.ban accepts user id
      await interaction.guild.members.ban(user.id, { reason });
      return interaction.reply({ content: `✅ ${user.tag} foi banido. Motivo: ${reason}` });
    } catch (err) {
      console.error('Erro ao banir:', err);
      return interaction.reply({ content: 'Falha ao banir o membro. Verifique se eu tenho permissões suficientes e se o usuário existe.', ephemeral: true });
    }
  }
};
