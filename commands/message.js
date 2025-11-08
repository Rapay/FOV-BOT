const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel de mensagem (stub)')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal de destino (opcional)').setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });
    await interaction.reply({ content: 'Painel de criação (stub). O painel completo será reativado em breve.', ephemeral: true });
  }
};
