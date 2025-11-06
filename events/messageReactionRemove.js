module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user) {
    try {
      if (reaction.partial) {
        try { await reaction.fetch(); } catch (err) { console.error('Failed to fetch reaction partial:', err); return; }
      }
      if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (err) { console.error('Failed to fetch message partial:', err); return; }
      }

      const fs = require('fs');
      const dbPath = './data/reaction_roles.json';
      if (!fs.existsSync(dbPath)) return;
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const map = db.mappings[reaction.message.id];
      if (!map) return;

      const key = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
      const roleId = map[key] || map[reaction.emoji.toString()];
      if (!roleId) return;

      const guild = reaction.message.guild;
      if (!guild) return;
      const member = await guild.members.fetch(user.id).catch(()=>null);
      if (!member) return;
      if (!member.roles.cache.has(roleId)) return;
      await member.roles.remove(roleId).catch(err => console.error('Falha ao remover cargo por reação:', err));

      // audit log: if configured, send a short embed to the configured audit channel
      try {
        const cfgPath = './data/config.json';
        if (require('fs').existsSync(cfgPath)) {
          const cfg = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
          if (cfg && cfg.reactionAuditChannelId) {
            const auditCh = reaction.message.guild.channels.cache.get(cfg.reactionAuditChannelId);
            if (auditCh && auditCh.isTextBased()) {
              const { EmbedBuilder } = require('discord.js');
              const link = `https://discord.com/channels/${reaction.message.guild.id}/${reaction.message.channel.id}/${reaction.message.id}`;
              const embed = new EmbedBuilder()
                .setTitle('Reaction Role — Cargo removido')
                .setColor(0xED4245)
                .addFields(
                  { name: 'Usuário', value: `${user.tag} (<@${user.id}>)`, inline: true },
                  { name: 'Cargo', value: `<@&${roleId}>`, inline: true },
                  { name: 'Emoji', value: `${reaction.emoji.toString()}`, inline: true }
                )
                .addFields(
                  { name: 'Canal', value: `<#${reaction.message.channel.id}>`, inline: true },
                  { name: 'Mensagem', value: `[Abrir mensagem](${link})`, inline: true }
                )
                .setTimestamp();
              await auditCh.send({ embeds: [embed] }).catch(()=>{});
            }
          }
        }
      } catch (err) { console.error('Erro ao enviar audit log de reaction-role (remove):', err); }
    } catch (err) {
      console.error('Erro em messageReactionRemove handler:', err);
    }
  }
};
