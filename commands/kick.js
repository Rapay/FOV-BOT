const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro do servidor')
    .addUserOption(opt => opt.setName('user').setDescription('Membro a expulsar').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Motivo da expulsão'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'Este comando só pode ser usado em servidores.', ephemeral: true });

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para expulsar membros.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || `Expulso por ${interaction.user.tag}`;

    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch (err) {
      return interaction.reply({ content: 'Não encontrei esse usuário no servidor.', ephemeral: true });
    }

    if (!member.kickable) {
      return interaction.reply({ content: 'Não consigo expulsar esse membro. Verifique a hierarquia de cargos ou permissões do bot.', ephemeral: true });
    }

    try {
      await member.kick(reason);
      return interaction.reply({ content: `✅ ${user.tag} foi expulso. Motivo: ${reason}` });
    } catch (err) {
      console.error('Erro ao expulsar:', err);
      return interaction.reply({ content: 'Falha ao expulsar o membro. Verifique se eu tenho permissões suficientes.', ephemeral: true });
    }
  }
};
