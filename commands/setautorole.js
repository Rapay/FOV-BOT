const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setautorole')
    .setDescription('Define o cargo que será atribuído automaticamente a novos membros')
    .addRoleOption(opt => opt.setName('role').setDescription('Cargo a atribuir (recomendado)').setRequired(false))
    .addStringOption(opt => opt.setName('name_or_id').setDescription('Nome do cargo ou ID (alternativa)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    // Only allow administrators / manage guild perms (handled by command default permissions)
    try {
      const roleOpt = interaction.options.getRole('role');
      const strOpt = interaction.options.getString('name_or_id');

      if (!roleOpt && !strOpt) return interaction.reply({ content: 'Use `/setautorole role:<cargo>` ou informe o nome/ID no campo alternativo.', ephemeral: true });

      // We'll store either the role ID (preferred) or the provided string
      const cfgPath = path.join(__dirname, '..', 'data', 'config.json');
      let cfg = {};
      try {
        if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8') || '{}');
      } catch (e) {
        console.error('[setautorole] failed to read config.json', e);
        return interaction.reply({ content: 'Erro ao ler o arquivo de configuração.', ephemeral: true });
      }

      if (roleOpt) {
        cfg.autoRoleId = roleOpt.id;
        try { fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) { console.error('[setautorole] write failed', e); return interaction.reply({ content: 'Erro ao salvar configuração.', ephemeral: true }); }
        return interaction.reply({ content: `Cargo automático definido: **${roleOpt.name}** (${roleOpt.id}).`, ephemeral: true });
      }

      // If a string was provided, save it as-is (ID or name)
      const input = String(strOpt).trim();
      cfg.autoRoleId = input;
      try { fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) { console.error('[setautorole] write failed', e); return interaction.reply({ content: 'Erro ao salvar configuração.', ephemeral: true }); }
      return interaction.reply({ content: `Cargo automático definido como: \`${input}\` (tentarei encontrar por ID ou nome).`, ephemeral: true });
    } catch (err) {
      console.error('Error in setautorole:', err);
      try { return interaction.reply({ content: 'Ocorreu um erro ao executar o comando.', ephemeral: true }); } catch (e) {}
    }
  }
};
