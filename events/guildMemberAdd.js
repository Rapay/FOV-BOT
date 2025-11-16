module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const fs = require('fs');
      const path = require('path');
      const cfgPath = path.join(__dirname, '..', 'data', 'config.json');
      if (!fs.existsSync(cfgPath)) return;
      const raw = fs.readFileSync(cfgPath, 'utf8') || '{}';
      let cfg = {};
      try { cfg = JSON.parse(raw); } catch (e) { console.error('[guildMemberAdd] failed to parse config.json', e); return; }

      const autoRole = cfg.autoRoleId;
      if (!autoRole) return; // nothing configured

      const guild = member.guild;
      let role = null;

      // If autoRole looks like an ID (all digits, length >= 5), try by ID first
      if (typeof autoRole === 'string' && /^[0-9]{5,}$/.test(autoRole)) {
        role = guild.roles.cache.get(autoRole) || null;
        if (!role) {
          try { role = await guild.roles.fetch(autoRole).catch(()=>null); } catch (e) { role = null; }
        }
      }

      // Fallback: try to find by name (case-sensitive first, then case-insensitive)
      if (!role) {
        role = guild.roles.cache.find(r => r.name === autoRole) || null;
      }
      if (!role) {
        role = guild.roles.cache.find(r => r.name && String(r.name).toLowerCase() === String(autoRole).toLowerCase()) || null;
      }

      if (!role) {
        console.log('[guildMemberAdd] configured autoRole not found in guild:', autoRole);
        return;
      }

      try {
        await member.roles.add(role);
        console.log(`[guildMemberAdd] assigned role ${role.id} (${role.name}) to ${member.user.tag}`);
      } catch (err) {
        console.error('[guildMemberAdd] failed to add role to member:', err);
      }
    } catch (err) {
      console.error('Unexpected error in guildMemberAdd handler:', err);
    }
  }
};
