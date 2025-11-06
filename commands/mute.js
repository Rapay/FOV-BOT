const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Adiciona o cargo Muted a um membro (impede enviar mensagens)')
    .addUserOption(opt => opt.setName('user').setDescription('Membro a mutar').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duração em minutos (opcional)'))
    .addStringOption(opt => opt.setName('reason').setDescription('Motivo do mute'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'Este comando só pode ser usado em servidores.', ephemeral: true });

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para mutar membros.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration'); // minutes
    const reason = interaction.options.getString('reason') || `Mutado por ${interaction.user.tag}`;

    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch (err) {
      return interaction.reply({ content: 'Não encontrei esse usuário no servidor.', ephemeral: true });
    }

    // Find or create Muted role
    let muteRole = interaction.guild.roles.cache.find(r => r.name === 'Muted');
    try {
      if (!muteRole) {
        muteRole = await interaction.guild.roles.create({ name: 'Muted', permissions: [] , reason: 'Criando cargo Muted para comando /mute' });
      }
    } catch (err) {
      console.error('Falha ao criar cargo Muted:', err);
      return interaction.reply({ content: 'Falha ao criar o cargo Muted. Verifique permissões do bot (Manage Roles).', ephemeral: true });
    }

    // Ensure channel overwrites deny sending for the muteRole (best-effort)
    try {
      for (const ch of interaction.guild.channels.cache.values()) {
        // Only attempt for text-based channels
        if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement || ch.type === ChannelType.GuildForum) {
          try {
            await ch.permissionOverwrites.edit(muteRole, { SendMessages: false, AddReactions: false }, { reason: 'Aplicando permissões do cargo Muted' });
          } catch (e) {
            // ignore per-channel failures
          }
        }
      }
    } catch (err) {
      // non-fatal
    }

    try {
      await member.roles.add(muteRole, reason);
    } catch (err) {
      console.error('Erro ao adicionar cargo Muted:', err);
      return interaction.reply({ content: 'Falha ao aplicar o mute. Verifique a hierarquia de cargos e permissões do bot.', ephemeral: true });
    }

    let replyMsg = `🔇 ${user.tag} foi mutado. Motivo: ${reason}`;
    if (duration && duration > 0) {
      replyMsg += ` — duração: ${duration} minuto(s). (Obs: temporizador em memória; será perdido caso o bot reinicie)`;
      // schedule unmute (in-memory)
      setTimeout(async () => {
        try {
          const refreshed = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (refreshed) await refreshed.roles.remove(muteRole, 'Tempo de mute expirado');
        } catch (e) {
          console.error('Falha ao remover mute agendado:', e);
        }
      }, duration * 60 * 1000);
    }

    return interaction.reply({ content: `✅ ${replyMsg}` });
  }
};
