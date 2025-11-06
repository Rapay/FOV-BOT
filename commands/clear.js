const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Apaga mensagens em massa (bulk delete).')
    .addIntegerOption(o=>o.setName('amount').setDescription('Quantidade de mensagens a apagar (2-100)').setRequired(true))
    .addUserOption(o=>o.setName('user').setDescription('Filtrar por usuário (opcional)').setRequired(false)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para apagar mensagens.', ephemeral: true });
    }
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    if (!amount || amount < 2 || amount > 100) return interaction.reply({ content: 'Quantidade deve ser entre 2 e 100.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    try {
      const fetched = await interaction.channel.messages.fetch({ limit: amount });
      let toDelete = fetched;
      if (user) toDelete = fetched.filter(m => m.author.id === user.id);
      await interaction.channel.bulkDelete(toDelete, true);
      return interaction.editReply({ content: `Apagadas ${toDelete.size} mensagens.` });
    } catch (err) {
      console.error('Erro em /clear:', err);
      return interaction.editReply({ content: 'Falha ao apagar mensagens (mensagens >14 dias não podem ser apagadas em bulk).'});
    }
  }
};
