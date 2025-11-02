const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = './data/tickets.json';
const configPath = './data/config.json';
const transcriptsDir = './data/transcripts';

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({ tickets: [] }, null, 2));
if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ staffRoleId: null, ticketCategoryId: null, transcriptChannelId: null }, null, 2));
if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gerenciar tickets')
    .addSubcommand(sub => sub.setName('open').setDescription('Abrir um novo ticket'))
    .addSubcommand(sub => sub.setName('close').setDescription('Fechar o ticket deste canal'))
    .addSubcommand(sub => sub.setName('set').setDescription('Configurar opções do sistema de tickets').addStringOption(o=>o.setName('key').setDescription('key: staffRole | category | transcriptChannel').setRequired(true)).addStringOption(o=>o.setName('value').setDescription('ID do role/categoria/canal').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('Listar tickets abertos')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    const db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (sub === 'open') {
      const existing = db.tickets.find(t => t.userId === interaction.user.id);
      if (existing) {
        const ch = guild.channels.cache.get(existing.channelId);
        if (ch) return interaction.reply({ content: `Você já tem um ticket aberto: ${ch}`, ephemeral: true });
      }

      const everyone = guild.roles.everyone;
      const name = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
      const createOptions = {
        name,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      };

      if (cfg.ticketCategoryId) createOptions.parent = cfg.ticketCategoryId;

      const channel = await guild.channels.create(createOptions);

      // Allow staff role if configured
      if (cfg.staffRoleId) await channel.permissionOverwrites.create(cfg.staffRoleId, { ViewChannel: true, SendMessages: true });

      db.tickets.push({ userId: interaction.user.id, channelId: channel.id, openAt: new Date().toISOString() });
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));

      await channel.send({ content: `Olá ${interaction.user}, aguarde um atendente. Use /ticket close para encerrar.` });
      await interaction.reply({ content: `Ticket criado: ${channel}`, ephemeral: true });
    } else if (sub === 'close') {
      const current = db.tickets.find(t => t.channelId === interaction.channel.id);
      if (!current) return interaction.reply({ content: 'Este canal não é um ticket.', ephemeral: true });

      // coletar mensagens para transcript
      const messages = [];
      try {
        let fetched = await interaction.channel.messages.fetch({ limit: 100 });
        fetched = fetched.sort((a,b)=>a.createdTimestamp - b.createdTimestamp);
        for (const msg of fetched.values()) {
          const author = msg.author.tag;
          const time = new Date(msg.createdTimestamp).toISOString();
          const content = msg.content || '';
          messages.push(`[${time}] ${author}: ${content}`);
          if (msg.attachments && msg.attachments.size) {
            for (const att of msg.attachments.values()) messages.push(`[ATTACHMENT] ${att.url}`);
          }
        }
      } catch (err) { console.error('Erro ao coletar mensagens do ticket:', err); }

      const transcriptPath = path.join(transcriptsDir, `${interaction.channel.id}.txt`);
      fs.writeFileSync(transcriptPath, messages.join('\n'));

      // postar transcript em canal configurado, se houver
      if (cfg.transcriptChannelId) {
        const tchan = guild.channels.cache.get(cfg.transcriptChannelId);
        if (tchan && tchan.isTextBased()) {
          await tchan.send({ content: `Transcript do ticket ${interaction.channel.name}`, files: [transcriptPath] }).catch(()=>{});
        }
      }

      db.tickets = db.tickets.filter(t => t.channelId !== interaction.channel.id);
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));

      await interaction.channel.delete();
    } else if (sub === 'set') {
      // somente admins podem setar
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Apenas administradores podem configurar.', ephemeral: true });
      const key = interaction.options.getString('key');
      const value = interaction.options.getString('value');
      if (!['staffRole','category','transcriptChannel'].includes(key)) return interaction.reply({ content: 'Chave inválida. Use staffRole | category | transcriptChannel', ephemeral: true });
      if (key === 'staffRole') cfg.staffRoleId = value;
      if (key === 'category') cfg.ticketCategoryId = value;
      if (key === 'transcriptChannel') cfg.transcriptChannelId = value;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      return interaction.reply({ content: `Configuração ${key} atualizada.`, ephemeral: true });
    } else if (sub === 'list') {
      if (db.tickets.length === 0) return interaction.reply({ content: 'Nenhum ticket aberto.', ephemeral: true });
      const lines = db.tickets.map(t => `User: ${t.userId} — Channel: ${t.channelId} — Opened: ${t.openAt}`);
      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }
  }
};
