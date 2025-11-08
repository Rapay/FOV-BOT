const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
  .addSubcommand(sub => sub.setName('send').setDescription('Enviar uma FAQ usando o painel de /message').addIntegerOption(o=>o.setName('index').setDescription('Índice da FAQ').setRequired(true)).addChannelOption(o=>o.setName('channel').setDescription('Canal a enviar (opcional)').setRequired(false)).addBooleanOption(o=>o.setName('save').setDescription('Salvar este envio como FAQ (true)')))
    .addSubcommand(sub => sub.setName('set').setDescription('Configurar canal padrão de FAQ').addChannelOption(o=>o.setName('channel').setDescription('Canal padrão para publicar FAQs').setRequired(true)))
    .addSubcommand(sub => sub.setName('search').setDescription('Buscar FAQs por palavra-chave').addStringOption(o=>o.setName('q').setDescription('Termo de busca').setRequired(true))),

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
        const name = `${f.q.length > 250 ? f.q.slice(0, 250) + '...' : f.q}`;
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
        const cfg2 = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const publishChannel = targetChannel && targetChannel.isTextBased() ? targetChannel : (cfg2.faqChannelId ? interaction.guild.channels.cache.get(cfg2.faqChannelId) : null) || interaction.channel;
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

      // Publish a single interactive message containing a Select Menu for page 0
      // and Prev/Next buttons to navigate pages (updates the same message).
      const chunkSize = 25; // max options per select menu
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
      const totalPages = Math.ceil(db.faqs.length / chunkSize);

      const makePageComponents = (page) => {
        const offset = page * chunkSize;
        const slice = db.faqs.slice(offset, offset + chunkSize);
        const embed = new EmbedBuilder().setTitle('FAQs').setTimestamp();
        embed.setDescription('Clique no item do menu abaixo para ver a resposta.');

        const options = slice.map((item, j) => {
          const idx = offset + j;
          const label = `${item.q.length > 100 ? item.q.slice(0,97) + '...' : item.q}`;
          const description = item.q.length > 100 ? item.q.slice(0,100) + '...' : undefined;
          return { label, value: String(idx), description };
        });

        const select = new StringSelectMenuBuilder()
          .setCustomId(`faq_select:${page}`)
          .setPlaceholder('Selecione a pergunta...')
          .addOptions(options)
          .setMinValues(1)
          .setMaxValues(1);

        const rows = [new ActionRowBuilder().addComponents(select)];

        if (totalPages > 1) {
          const rowNav = new ActionRowBuilder();
          const prev = new ButtonBuilder().setCustomId(`faq_page:${page-1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0);
          const pageBadge = new ButtonBuilder().setCustomId(`faq_page_badge:${page}`).setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
          const next = new ButtonBuilder().setCustomId(`faq_page:${page+1}`).setLabel('Próximo ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages-1);
          rowNav.addComponents(prev, pageBadge, next);
          rows.push(rowNav);
        }

        return { embed, components: rows };
      };

      const { embed, components } = makePageComponents(0);
      await channel.send({ embeds: [embed], components }).catch(()=>{});
      await interaction.reply({ content: `FAQs publicadas interativamente em ${channel}`, ephemeral: true });

    } else if (sub === 'set') {
      // apenas admin
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Apenas administradores podem configurar.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });
      cfg.faqChannelId = channel.id;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      await interaction.reply({ content: `Canal padrão de FAQ definido para ${channel}`, ephemeral: true });

    } else if (sub === 'send') {
      const idx = interaction.options.getInteger('index');
      if (idx < 0 || idx >= db.faqs.length) return interaction.reply({ content: 'Índice inválido.', ephemeral: true });
      const entry = db.faqs[idx];
      const target = interaction.options.getChannel('channel') || interaction.channel;
      if (!target || !target.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

      // Create pending message session and prefill with one container (the FAQ)
      interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
      const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
  const container = { title: entry.q, description: entry.a, color: null, image: null, footer: 'FAQ' };
      const save = interaction.options.getBoolean('save') || false;
      const payload = { id, authorId: interaction.user.id, channelId: target.id, containers: [container], createdAt: Date.now(), saveAsFAQ: !!save };
      interaction.client.pendingMessages.set(id, payload);

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      // split into two rows to respect max 5 components per ActionRow
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
      );
  const previewEmbed = new EmbedBuilder().setTitle(container.title).setDescription(container.description).setFooter({ text: 'FAQ (preview)' }).setTimestamp();
  return interaction.reply({ content: `Sessão de envio criada para FAQ — ${container.title} — canal: ${target}`, embeds: [previewEmbed], components: [row1, row2], ephemeral: true });
    } else if (sub === 'search') {
      const term = interaction.options.getString('q');
      const q = term ? term.toLowerCase().trim() : '';
      if (!q) return interaction.reply({ content: 'Termo de busca inválido.', ephemeral: true });
      const matches = db.faqs.map((f, i) => ({ i, q: f.q, a: f.a })).filter(e => (e.q && e.q.toLowerCase().includes(q)) || (e.a && e.a.toLowerCase().includes(q)));
      if (!matches || matches.length === 0) return interaction.reply({ content: 'Nenhuma FAQ encontrada para esse termo.', ephemeral: true });

      // create a short-lived search session stored on the client so buttons can page
      interaction.client.pendingSearches = interaction.client.pendingSearches || new Map();
      const key = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const session = { id: key, authorId: interaction.user.id, term, results: matches };
      interaction.client.pendingSearches.set(key, session);
      // auto-expire session after 15 minutes
      setTimeout(() => { try { interaction.client.pendingSearches.delete(key); } catch {} }, 15 * 60 * 1000);

      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const pageSize = 5;
      const totalPages = Math.ceil(session.results.length / pageSize);
      const makePage = (page) => {
        const offset = page * pageSize;
        const slice = session.results.slice(offset, offset + pageSize);
        const embed = new EmbedBuilder().setTitle(`Resultados para: ${term}`).setTimestamp();
        for (const item of slice) {
          const name = `${item.q.length > 150 ? item.q.slice(0,150) + '...' : item.q}`;
          const value = item.a.length > 300 ? item.a.slice(0,300) + '...' : item.a;
          embed.addFields({ name, value });
        }
        return embed;
      };

      const page = 0;
      const embed = makePage(page);
      // build action rows: question buttons (<=5) and nav
      const offset = 0;
      const slice = session.results.slice(offset, offset + pageSize);
      const rowQuestions = new ActionRowBuilder();
      for (let j = 0; j < slice.length; j++) {
        const idx = slice[j].i;
        const label = `${slice[j].q.length > 80 ? slice[j].q.slice(0,77) + '...' : slice[j].q}`;
        rowQuestions.addComponents(new ButtonBuilder().setCustomId(`faq_search_show:${key}:${idx}`).setLabel(label).setStyle(ButtonStyle.Primary));
      }
      const rowNav = new ActionRowBuilder();
      const prev = new ButtonBuilder().setCustomId(`faq_search_page:${key}:${page-1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0);
      const pageBadge = new ButtonBuilder().setCustomId(`faq_search_page_badge:${key}:${page}`).setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
      const next = new ButtonBuilder().setCustomId(`faq_search_page:${key}:${page+1}`).setLabel('Próximo ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages-1);
      rowNav.addComponents(prev, pageBadge, next);

      return interaction.reply({ embeds: [embed], components: [rowQuestions, rowNav], ephemeral: true });
    }
  }
};
