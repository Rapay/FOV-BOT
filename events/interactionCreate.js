module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const client = interaction.client;

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id && id.startsWith('announce_confirm:')) {
        const key = id.split(':')[1];
        const pending = client.pendingAnnounces.get(key);
        if (!pending) return interaction.reply({ content: 'Ação expirada ou inválida.', ephemeral: true });
        // apenas o autor pode confirmar
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem solicitou pode confirmar.', ephemeral: true });

        const ch = interaction.guild.channels.cache.get(pending.channelId);
        if (!ch || !ch.isTextBased()) return interaction.reply({ content: 'Canal alvo inválido.', ephemeral: true });

        // montar componentes (botão de link) se houver
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const components = [];
        if (pending.buttonLabel && pending.buttonUrl) {
          components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(pending.buttonLabel).setStyle(ButtonStyle.Link).setURL(pending.buttonUrl)));
        }

        // se houver delay, agendar
        if (pending.delayMinutes && pending.delayMinutes > 0) {
          const ms = pending.delayMinutes * 60 * 1000;
          const when = new Date(Date.now() + ms);
          // agendar envio (nota: não persiste após restart)
          setTimeout(async () => {
            try {
              const sent = await ch.send({ content: pending.content || undefined, embeds: [pending.embed], components });
              if (pending.pin) await sent.pin().catch(()=>{});
            } catch (err) { console.error('Erro ao enviar anúncio agendado:', err); }
          }, ms);
          client.pendingAnnounces.delete(key);
          return interaction.update({ content: `Anúncio agendado para ${when.toLocaleString()}.`, embeds: [], components: [] });
        }

        // enviar imediatamente
        try {
          const sent = await ch.send({ content: pending.content || undefined, embeds: [pending.embed], components });
          if (pending.pin) await sent.pin().catch(()=>{});
        } catch (err) { console.error(err); }

        client.pendingAnnounces.delete(key);
        return interaction.update({ content: 'Anúncio enviado com sucesso.', embeds: [], components: [] });
      } else if (id && id.startsWith('announce_cancel:')) {
        const key = id.split(':')[1];
        const pending = client.pendingAnnounces.get(key);
        if (!pending) return interaction.reply({ content: 'Ação expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem solicitou pode cancelar.', ephemeral: true });
        client.pendingAnnounces.delete(key);
        return interaction.update({ content: 'Envio de anúncio cancelado.', embeds: [], components: [] });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return interaction.reply({ content: 'Comando não encontrado.', ephemeral: true });

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error('Erro ao executar comando:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Ocorreu um erro ao executar o comando.', ephemeral: true });
    }
  }
};
