module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    try {
      // handle partials
      if (reaction.partial) {
        try { await reaction.fetch(); } catch (err) { console.error('Failed to fetch reaction partial:', err); return; }
      }
      if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch (err) { console.error('Failed to fetch message partial:', err); return; }
      }

      const client = reaction.message.client;
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
      if (member.roles.cache.has(roleId)) return;
      await member.roles.add(roleId).catch(err => console.error('Falha ao adicionar cargo por reação:', err));
    } catch (err) {
      console.error('Erro em messageReactionAdd handler:', err);
    }
  }
};
