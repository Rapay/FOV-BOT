module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const client = interaction.client;

    // Button interactions
    if (interaction.isButton()) {
      const id = interaction.customId;

      // legacy announce confirm/cancel
      if (id && id.startsWith('announce_confirm:')) {
        const key = id.split(':')[1];
        const pending = client.pendingAnnounces && client.pendingAnnounces.get(key);
        if (!pending) return interaction.reply({ content: 'Ação expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem solicitou pode confirmar.', ephemeral: true });

        const ch = interaction.guild.channels.cache.get(pending.channelId);
        if (!ch || !ch.isTextBased()) return interaction.reply({ content: 'Canal alvo inválido.', ephemeral: true });

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const components = [];
        if (pending.buttonLabel && pending.buttonUrl) components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(pending.buttonLabel).setStyle(ButtonStyle.Link).setURL(pending.buttonUrl)));

        if (pending.delayMinutes && pending.delayMinutes > 0) {
          const ms = pending.delayMinutes * 60 * 1000;
          const when = new Date(Date.now() + ms);
          setTimeout(async () => {
            try {
              const sent = await ch.send({ content: pending.content || undefined, embeds: [pending.embed], components });
              if (pending.pin) await sent.pin().catch(()=>{});
            } catch (err) { console.error('Erro ao enviar anúncio agendado:', err); }
          }, ms);
          client.pendingAnnounces.delete(key);
          return interaction.update({ content: `Anúncio agendado para ${when.toLocaleString()}.`, embeds: [], components: [] });
        }

        try {
          const sent = await ch.send({ content: pending.content || undefined, embeds: [pending.embed], components });
          if (pending.pin) await sent.pin().catch(()=>{});
        } catch (err) { console.error(err); }

        client.pendingAnnounces.delete(key);
        return interaction.update({ content: 'Anúncio enviado com sucesso.', embeds: [], components: [] });
      }
      if (id && id.startsWith('announce_cancel:')) {
        const key = id.split(':')[1];
        const pending = client.pendingAnnounces && client.pendingAnnounces.get(key);
        if (!pending) return interaction.reply({ content: 'Ação expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem solicitou pode cancelar.', ephemeral: true });
        client.pendingAnnounces.delete(key);
        return interaction.update({ content: 'Envio de anúncio cancelado.', embeds: [], components: [] });
      }

      // New message panel buttons
      if (id && id.startsWith('message_')) {
        const [action, key] = id.split(':');
        const pending = client.pendingMessages && client.pendingMessages.get(key);
        if (!pending) return interaction.reply({ content: 'Sessão expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem iniciou pode interagir com este painel.', ephemeral: true });

        if (action === 'message_cancel') {
          client.pendingMessages.delete(key);
          return interaction.update({ content: 'Criação de mensagem cancelada.', embeds: [], components: [] });
        }

        if (action === 'message_add') {
          // Abrir modal para criar um container (inclui fields: uma linha por field no formato name|value)
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          const modal = new ModalBuilder().setCustomId(`message_modal:${key}`).setTitle('Adicionar container (embed)');
          const titleInput = new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false);
          const descInput = new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false);
          const colorInput = new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex ou nome)').setStyle(TextInputStyle.Short).setRequired(false);
          const imageInput = new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false);
          const footerInput = new TextInputBuilder().setCustomId('c_footer').setLabel('Footer').setStyle(TextInputStyle.Short).setRequired(false);
          const fieldsInput = new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Ex:\nPreço|R$100\nTamanho|P,M,G');

          modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(colorInput),
            new ActionRowBuilder().addComponents(imageInput),
            new ActionRowBuilder().addComponents(footerInput),
            new ActionRowBuilder().addComponents(fieldsInput)
          );
          return interaction.showModal(modal);
        }

        if (action === 'message_preview') {
          // Build preview from containers
          const { EmbedBuilder } = require('discord.js');
          const embeds = (pending.containers || []).map(c => {
            const e = new EmbedBuilder();
            if (c.title) e.setTitle(c.title);
            if (c.description) e.setDescription(c.description);
            if (c.color) try { e.setColor(c.color); } catch {}
            if (c.image) try { e.setImage(c.image); } catch {}
            if (c.footer) e.setFooter({ text: c.footer });
            if (c.fields) for (const f of c.fields || []) e.addFields({ name: f.name, value: f.value });
            return e;
          });
          if (embeds.length === 0) embeds.push(new EmbedBuilder().setTitle('— Nenhum container criado —').setDescription('Adicione containers para compor a mensagem.'));
          return interaction.reply({ content: 'Pré-visualização:', embeds: embeds.map(e=>e.toJSON()), ephemeral: true });
        }

        if (action === 'message_remove_last') {
          pending.containers = pending.containers || [];
          const removed = pending.containers.pop();
          client.pendingMessages.set(key, pending);
          return interaction.reply({ content: removed ? 'Último container removido.' : 'Nenhum container para remover.', ephemeral: true });
        }

        if (action === 'message_clear') {
          pending.containers = [];
          client.pendingMessages.set(key, pending);
          return interaction.reply({ content: 'Todos os containers foram removidos da sessão.', ephemeral: true });
        }

        if (action === 'message_send') {
          // send assembled message to channel
          const ch = interaction.guild.channels.cache.get(pending.channelId);
          if (!ch || !ch.isTextBased()) return interaction.reply({ content: 'Canal alvo inválido ou não encontrado.', ephemeral: true });
          try {
            const { EmbedBuilder } = require('discord.js');
            for (const c of (pending.containers || [])) {
              const e = new EmbedBuilder();
              if (c.title) e.setTitle(c.title);
              if (c.description) e.setDescription(c.description);
              if (c.color) try { e.setColor(c.color); } catch {}
              if (c.image) try { e.setImage(c.image); } catch {}
              if (c.footer) e.setFooter({ text: c.footer });
              if (c.fields) for (const f of c.fields || []) e.addFields({ name: f.name, value: f.value });
              await ch.send({ embeds: [e] }).catch(err=>console.error('Erro ao enviar embed:', err));
            }

            // Optional integration: save as FAQ if requested
            if (pending.saveAsFAQ) {
              try {
                const fs = require('fs');
                const dbPath = './data/faq.json';
                if (!fs.existsSync('./data')) fs.mkdirSync('./data');
                if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ faqs: [] }, null, 2));
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const first = (pending.containers && pending.containers[0]) || null;
                if (first) {
                  db.faqs.push({ q: first.title || '(sem título)', a: first.description || '', createdAt: new Date().toISOString() });
                  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                }
              } catch (err) { console.error('Erro ao salvar FAQ:', err); }
            }
          } catch (err) { console.error('Erro ao enviar mensagem composta:', err); }
          client.pendingMessages.delete(key);
          return interaction.update({ content: `Mensagem enviada em ${ch}.`, embeds: [], components: [] });
        }
      }
      return;
    }

    // Modal submit (for message containers)
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id && id.startsWith('message_modal:')) {
        const key = id.split(':')[1];
        const pending = client.pendingMessages && client.pendingMessages.get(key);
        if (!pending) return interaction.reply({ content: 'Sessão expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem iniciou pode submeter este modal.', ephemeral: true });

        const title = interaction.fields.getTextInputValue('c_title') || null;
        const description = interaction.fields.getTextInputValue('c_description') || null;
        const color = interaction.fields.getTextInputValue('c_color') || null;
        const image = interaction.fields.getTextInputValue('c_image') || null;
        const footer = interaction.fields.getTextInputValue('c_footer') || null;
        const fieldsRaw = (interaction.fields.getTextInputValue('c_fields') || '').trim();
        const fields = [];
        if (fieldsRaw.length > 0) {
          const lines = fieldsRaw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
          for (const ln of lines) {
            const parts = ln.split('|');
            if (parts.length >= 2) fields.push({ name: parts[0].trim(), value: parts.slice(1).join('|').trim() });
          }
        }

        const container = { title, description, color, image, footer, fields };
        pending.containers = pending.containers || [];
        pending.containers.push(container);
        client.pendingMessages.set(key, pending);

        return interaction.reply({ content: 'Container adicionado ao painel. Use Pré-visualizar ou Enviar.', ephemeral: true });
      }
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
