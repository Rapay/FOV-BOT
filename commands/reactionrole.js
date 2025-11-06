const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');

const dataPath = './data/reaction_roles.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({ mappings: {} }, null, 2));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Gerenciar reaction roles (associação emoji <-> cargo)')
    .addSubcommand(s => s.setName('post').setDescription('Publicar uma mensagem para uso com reaction-roles').addChannelOption(o=>o.setName('channel').setDescription('Canal para postar').setRequired(false)).addStringOption(o=>o.setName('content').setDescription('Conteúdo da mensagem').setRequired(true)))
    .addSubcommand(s => s.setName('add').setDescription('Adicionar associação emoji->cargo a uma mensagem existente').addStringOption(o=>o.setName('message_id').setDescription('ID da mensagem').setRequired(true)).addStringOption(o=>o.setName('emoji').setDescription('Emoji (unicode ou custom em formato <:name:id>)').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Cargo a atribuir').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remover associação emoji->cargo de uma mensagem').addStringOption(o=>o.setName('message_id').setDescription('ID da mensagem').setRequired(true)).addStringOption(o=>o.setName('emoji').setDescription('Emoji').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Listar associações para uma mensagem').addStringOption(o=>o.setName('message_id').setDescription('ID da mensagem').setRequired(true))),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você precisa de permissão para gerenciar cargos.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    if (sub === 'post') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const content = interaction.options.getString('content');
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });
      try {
        const msg = await channel.send({ content });
        db.mappings[msg.id] = db.mappings[msg.id] || {};
        fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
        return interaction.reply({ content: `Mensagem publicada com sucesso. ID: ${msg.id}\nUse /reactionrole add para associar emojis a cargos nessa mensagem.`, ephemeral: true });
      } catch (err) {
        console.error('Erro ao postar mensagem reactionrole:', err);
        return interaction.reply({ content: 'Falha ao postar mensagem.', ephemeral: true });
      }
    }

    if (sub === 'add') {
      const messageId = interaction.options.getString('message_id');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');
      if (!messageId || !emoji || !role) return interaction.reply({ content: 'Argumentos inválidos.', ephemeral: true });

      db.mappings[messageId] = db.mappings[messageId] || {};
      db.mappings[messageId][emoji] = role.id;
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));

      // try to add reaction to message (best-effort)
      try {
        // try find message in guild channels
        let found = null;
        for (const ch of interaction.guild.channels.cache.values()) {
          if (!ch.isTextBased()) continue;
          try {
            const m = await ch.messages.fetch(messageId).catch(()=>null);
            if (m) { found = m; break; }
          } catch {}
        }
        if (found) await found.react(emoji).catch(()=>{});
      } catch (err) {}

      return interaction.reply({ content: `Associação adicionada: ${emoji} -> ${role.name} (mensagem ${messageId})`, ephemeral: true });
    }

    if (sub === 'remove') {
      const messageId = interaction.options.getString('message_id');
      const emoji = interaction.options.getString('emoji');
      if (!db.mappings[messageId] || !db.mappings[messageId][emoji]) return interaction.reply({ content: 'Associação não encontrada.', ephemeral: true });
      delete db.mappings[messageId][emoji];
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
      return interaction.reply({ content: `Associação removida para ${emoji} na mensagem ${messageId}.`, ephemeral: true });
    }

    if (sub === 'list') {
      const messageId = interaction.options.getString('message_id');
      const map = db.mappings[messageId] || {};
      const entries = Object.keys(map);
      if (entries.length === 0) return interaction.reply({ content: 'Nenhuma associação encontrada para essa mensagem.', ephemeral: true });
      const lines = entries.map(e => `${e} → <@&${map[e]}>`);
      return interaction.reply({ content: `Associações para ${messageId}:\n${lines.join('\n')}`, ephemeral: true });
    }
  }
};
