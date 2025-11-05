const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel para criar mensagens/embeds customizados')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

    // permissões: manter similar ao antigo announce (ManageMessages/Admin or configured roles)
    const fs = require('fs');
    const cfgPath = './data/config.json';
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = {}; }
    const { PermissionFlagsBits } = require('discord.js');
    if (cfg.announceRoleIds && cfg.announceRoleIds.length > 0) {
      const hasRole = cfg.announceRoleIds.some(rid => interaction.member.roles.cache.has(rid));
      if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
    } else {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'Você não tem permissão para usar este comando. (Manage Messages ou Administrator necessário)', ephemeral: true });
      }
    }

    const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const payload = { id, authorId: interaction.user.id, channelId: channel.id, containers: [], createdAt: Date.now() };
    interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
    interaction.client.pendingMessages.set(id, payload);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar container').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover último').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar todos').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
    );

    const emptyEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Clique em "Adicionar container" para criar um bloco (embed). Você pode adicionar múltiplos containers.').setTimestamp();
    await interaction.reply({ embeds: [emptyEmbed], components: [row], ephemeral: true });
  }
};
