const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testdm')
    .setDescription('Teste rápido: o bot tenta te enviar uma DM (útil para debug).'),
  async execute(interaction) {
    const user = interaction.user;
    try {
      console.log(`[testdm] requested by ${user.id}`);
      // try to create DM channel
      const dm = await user.createDM();
      const sent = await dm.send({ content: `Esta é uma mensagem de teste enviada pelo bot para confirmar que suas DMs estão funcionando.` });
      await interaction.reply({ content: `✅ DM enviada com sucesso (mensagem id ${sent.id}). Verifique suas mensagens diretas.`, ephemeral: true });
    } catch (err) {
      console.error('[testdm] failed to send DM', err);
      let extra = '';
      try { if (err && err.code) extra = ` (Discord error ${err.code})`; } catch {}
      await interaction.reply({ content: `❌ Falha ao enviar DM. Verifique suas configurações de privacidade/bloqueios.${extra}`, ephemeral: true });
    }
  }
};
