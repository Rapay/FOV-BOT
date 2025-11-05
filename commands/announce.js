const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('(Legacy) Abrir painel para criar mensagem — use /message')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

    const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
    interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
    interaction.client.pendingMessages.set(id, { id, authorId: interaction.user.id, channelId: channel.id, containers: [], createdAt: Date.now() });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar container').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover último').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar todos').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
    );

    const emptyEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem (announce)').setDescription('Clique em "Adicionar container" para criar um bloco (embed). Você pode adicionar múltiplos containers.').setTimestamp();
    await interaction.reply({ embeds: [emptyEmbed], components: [row], ephemeral: true });
  }
};
