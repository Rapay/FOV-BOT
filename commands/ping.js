const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Responde com pong para testar o bot'),
  async execute(interaction) {
    await interaction.reply('Pong!');
  }
};
