const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Apaga mensagens em massa (bulk delete).')
    .addIntegerOption(o=>o.setName('amount').setDescription('Quantidade de mensagens a apagar (2-1000)').setRequired(true))
    .addUserOption(o=>o.setName('user').setDescription('Filtrar por usuário (opcional)').setRequired(false)),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para apagar mensagens.', ephemeral: true });
    }
  const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
  if (!amount || amount < 2 || amount > 1000) return interaction.reply({ content: 'Quantidade deve ser entre 2 e 1000.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    try {
      // Discord bulkDelete limit is 100 per request; fetch in chunks until we have enough
      const limitPerFetch = 100;
      let collected = new Map(); // id -> message
      let lastId = null;
      while (collected.size < amount) {
        const fetchLimit = Math.min(limitPerFetch, amount - collected.size);
        const options = { limit: fetchLimit };
        if (lastId) options.before = lastId;
        const batch = await interaction.channel.messages.fetch(options);
        if (!batch || batch.size === 0) break;
        for (const m of batch.values()) {
          if (user && m.author.id !== user.id) continue;
          if (!collected.has(m.id)) collected.set(m.id, m);
          if (collected.size >= amount) break;
        }
        lastId = batch.last().id;
        // if fetched less than requested, no more messages
        if (batch.size < fetchLimit) break;
      }

      const messages = Array.from(collected.values());
      if (messages.length === 0) return interaction.editReply({ content: 'Nenhuma mensagem encontrada para apagar com os critérios fornecidos.' });

      const fourteenDays = 14 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const bulkDeletable = messages.filter(m => (now - m.createdTimestamp) < fourteenDays);
      const oldMessages = messages.filter(m => (now - m.createdTimestamp) >= fourteenDays);

      let bulkDeleted = 0;
      // delete bulk deletable in batches of up to 100
      for (let i = 0; i < bulkDeletable.length; i += 100) {
        const slice = bulkDeletable.slice(i, i + 100);
        try {
          const res = await interaction.channel.bulkDelete(slice.map(m => m.id), true);
          bulkDeleted += res.size || 0;
        } catch (e) {
          console.error('bulkDelete batch failed', e);
        }
      }

      let individuallyDeleted = 0;
      if (oldMessages.length > 0) {
        // delete older messages individually in small concurrent batches to avoid rate limits
        const concurrency = 8;
        const chunks = [];
        for (let i = 0; i < oldMessages.length; i += concurrency) chunks.push(oldMessages.slice(i, i + concurrency));
        for (const chunk of chunks) {
          await Promise.allSettled(chunk.map(m => m.delete().then(() => { individuallyDeleted++; }).catch(er => { console.error('delete single failed', er); })));
          // small pause between chunks
          await new Promise(r => setTimeout(r, 300));
        }
      }

      return interaction.editReply({ content: `Apagadas: ${bulkDeleted + individuallyDeleted} mensagens (${bulkDeleted} via bulk, ${individuallyDeleted} individuais).` });
    } catch (err) {
      console.error('Erro em /clear:', err);
      return interaction.editReply({ content: 'Falha ao apagar mensagens (mensagens >14 dias não podem ser apagadas em bulk).'});
    }
  }
};
