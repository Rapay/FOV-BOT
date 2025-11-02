const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const dataPath = './data/faq.json';
const configPath = './data/config.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({ faqs: [] }, null, 2));
if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ staffRoleId: null, ticketCategoryId: null, transcriptChannelId: null, faqChannelId: null }, null, 2));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Gerenciar FAQs')
    .addSubcommand(sub => sub.setName('add').setDescription('Adicionar FAQ').addStringOption(o => o.setName('q').setDescription('Pergunta').setRequired(true)).addStringOption(o => o.setName('a').setDescription('Resposta').setRequired(true)).addChannelOption(o=>o.setName('channel').setDescription('Canal para publicar esta FAQ (opcional)').setRequired(false)))
  .addSubcommand(sub => sub.setName('list').setDescription('Listar FAQs').addBooleanOption(o=>o.setName('public').setDescription('Enviar a lista publicamente no canal (true)')).addChannelOption(o=>o.setName('channel').setDescription('Canal para publicar a lista (opcional)')))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remover FAQ por índice').addIntegerOption(o => o.setName('index').setDescription('Índice da FAQ').setRequired(true)))
    .addSubcommand(sub => sub.setName('publish').setDescription('Publicar todas as FAQs em um canal').addChannelOption(o=>o.setName('channel').setDescription('Canal onde publicar (opcional)').setRequired(false)))
    .addSubcommand(sub => sub.setName('set').setDescription('Configurar canal padrão de FAQ').addChannelOption(o=>o.setName('channel').setDescription('Canal padrão para publicar FAQs').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (sub === 'add') {
      const q = interaction.options.getString('q');
      const a = interaction.options.getString('a');
      const channel = interaction.options.getChannel('channel');

      const entry = { q, a, createdAt: new Date().toISOString() };
      db.faqs.push(entry);
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));

      // Se o usuário especificou um canal, publicar a FAQ lá também
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder().setTitle(q).setDescription(a).setFooter({ text: 'FAQ' }).setTimestamp();
        await channel.send({ embeds: [embed] }).catch(()=>{});
        return interaction.reply({ content: `FAQ adicionada e publicada em ${channel}`, ephemeral: true });
      }

      return interaction.reply({ content: 'FAQ adicionada.', ephemeral: true });
    } else if (sub === 'list') {
      if (db.faqs.length === 0) return interaction.reply({ content: 'Nenhuma FAQ cadastrada.', ephemeral: true });

      const sendPublic = interaction.options.getBoolean('public') || false;
      const targetChannel = interaction.options.getChannel('channel');

      // Construir embeds com até 25 fields cada (limite do Discord)
      const embeds = [];
      let embed = new EmbedBuilder().setTitle('FAQs').setTimestamp();
      let fieldCount = 0;

      for (let i = 0; i < db.faqs.length; i++) {
        const f = db.faqs[i];
        const answer = f.a.length > 1000 ? f.a.slice(0, 1000) + '...' : f.a;
        const name = `#${i} — ${f.q.length > 250 ? f.q.slice(0, 250) + '...' : f.q}`;
        embed.addFields({ name, value: answer });
        fieldCount++;

        if (fieldCount >= 25) {
          embeds.push(embed);
          embed = new EmbedBuilder().setTitle('FAQs (continuação)').setTimestamp();
          fieldCount = 0;
        }
      }
      if (fieldCount > 0) embeds.push(embed);

      if (sendPublic) {
        // escolher canal: opção > canal padrão cfg > canal do comando
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const publishChannel = targetChannel && targetChannel.isTextBased() ? targetChannel : (cfg.faqChannelId ? interaction.guild.channels.cache.get(cfg.faqChannelId) : null) || interaction.channel;
        for (const e of embeds) {
          await publishChannel.send({ embeds: [e] }).catch(()=>{});
        }
        return interaction.reply({ content: `FAQs publicadas em ${publishChannel}`, ephemeral: true });
      }

      for (const e of embeds) {
        try {
          await interaction.reply({ embeds: [e], ephemeral: true });
        } catch (err) {
          await interaction.followUp({ embeds: [e], ephemeral: true });
        }
      }
    } else if (sub === 'remove') {
      const idx = interaction.options.getInteger('index');
      if (idx < 0 || idx >= db.faqs.length) return interaction.reply({ content: 'Índice inválido.', ephemeral: true });
      db.faqs.splice(idx, 1);
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
      await interaction.reply({ content: 'FAQ removida.', ephemeral: true });
    } else if (sub === 'publish') {
      // Publicar todas as FAQs em um canal (ou no canal padrão configurado)
      const channel = interaction.options.getChannel('channel') || (cfg.faqChannelId ? interaction.guild.channels.cache.get(cfg.faqChannelId) : null);
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido ou não configurado. Use /faq publish channel:#canal ou configure o canal padrão com /faq set.', ephemeral: true });

      if (db.faqs.length === 0) return interaction.reply({ content: 'Nenhuma FAQ cadastrada para publicar.', ephemeral: true });

      // Construir e enviar embeds públicos
      const embeds = [];
      let embed = new EmbedBuilder().setTitle('FAQs').setTimestamp();
      let fieldCount = 0;
      for (let i = 0; i < db.faqs.length; i++) {
        const f = db.faqs[i];
        const answer = f.a.length > 1000 ? f.a.slice(0, 1000) + '...' : f.a;
        const name = `#${i} — ${f.q.length > 250 ? f.q.slice(0, 250) + '...' : f.q}`;
        embed.addFields({ name, value: answer });
        fieldCount++;
        if (fieldCount >= 25) { embeds.push(embed); embed = new EmbedBuilder().setTitle('FAQs (continuação)').setTimestamp(); fieldCount = 0; }
      }
      if (fieldCount > 0) embeds.push(embed);

      for (const e of embeds) await channel.send({ embeds: [e] }).catch(()=>{});
      await interaction.reply({ content: `FAQs publicadas em ${channel}`, ephemeral: true });
    } else if (sub === 'set') {
      // apenas admin
      if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: 'Apenas administradores podem configurar.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });
      cfg.faqChannelId = channel.id;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      await interaction.reply({ content: `Canal padrão de FAQ definido para ${channel}`, ephemeral: true });
    }
  }
};
