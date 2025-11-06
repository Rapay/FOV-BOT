const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Faz o bot enviar texto cru (preserva marcação do Discord como spoilers, negrito, etc.)')
    .addStringOption(o => o.setName('content').setDescription('Texto a ser enviado pelo bot').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Canal para enviar a mensagem (opcional)').setRequired(false))
    .addBooleanOption(o => o.setName('ephemeral').setDescription('Responder ao autor de forma efêmera indicando envio?').setRequired(false)),

  async execute(interaction) {
    // Restrict usage to staff: ManageMessages or Administrator
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
    }

    const content = interaction.options.getString('content');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const ephemeral = interaction.options.getBoolean('ephemeral') || false;

    if (!target || !target.isTextBased()) return interaction.reply({ content: 'Canal alvo inválido.', ephemeral: true });

    if (!content || content.trim().length === 0) return interaction.reply({ content: 'Conteúdo vazio não permitido.', ephemeral: true });
    if (content.length > 2000) return interaction.reply({ content: 'Mensagem muito longa (máx. 2000 caracteres).', ephemeral: true });

    try {
      // Send raw content as the bot. allowedMentions set to parse users/roles/everyone
      // so mentions included in the content (like @role) will be resolved if present.
      await target.send({ content, allowedMentions: { parse: ['users', 'roles', 'everyone'] } });
      const replyText = `Mensagem enviada em ${target}`;
      return interaction.reply({ content: replyText, ephemeral: true });
    } catch (err) {
      console.error('Erro em /say:', err);
      return interaction.reply({ content: 'Falha ao enviar a mensagem (verifique permissões do bot).', ephemeral: true });
    }
  }
};
