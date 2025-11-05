const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel para criar mensagens/embeds customizados')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

      // permissões
      const fs = require('fs');
      const cfgPath = './data/config.json';
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = {}; }

      if (cfg.announceRoleIds && cfg.announceRoleIds.length > 0) {
        const hasRole = cfg.announceRoleIds.some(rid => interaction.member.roles.cache.has(rid));
        if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      } else {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: 'Você não tem permissão para usar este comando. (Manage Messages ou Administrator necessário)', ephemeral: true });
        }
      }

      const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const payload = { id, authorId: interaction.user.id, channelId: channel.id, containers: [], createdAt: Date.now() };
      interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
      interaction.client.pendingMessages.set(id, payload);

      // helper to create 1-2 action rows (max 5 components per row)
      const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

      // messageLocks keeps track of panel ids that have an active modal/edit in progress
      interaction.client.messageLocks = interaction.client.messageLocks || new Set();

      const makeRows = (id, containers = []) => {
        // First row: add, edit last, remove, clear, preview (<=5)
        const first = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_edit_last:${id}`).setLabel('✏️ Editar último').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary)
        );
        // Second row: send + cancel
        const second = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );
        const rows = [first, second];
        // If there are containers, add a select menu to choose which container to edit
        if (containers && containers.length > 0) {
          const options = containers.slice(0, 25).map((c, idx) => ({
            label: `#${idx+1} ${c.title ? (c.title.length > 60 ? c.title.slice(0,57) + '...' : c.title) : '[sem título]'}`,
            value: String(idx),
            description: c.description ? (c.description.length > 100 ? c.description.slice(0,97) + '...' : c.description) : undefined
          }));
          const select = new StringSelectMenuBuilder().setCustomId(`message_select_edit:${id}`).setPlaceholder('Editar container específico...').addOptions(options).setMinValues(1).setMaxValues(1);
          rows.push(new ActionRowBuilder().addComponents(select));
        }
        return rows;
      };

      const emptyEmbed = new EmbedBuilder()
        .setTitle('Painel de criação de mensagem')
        .setDescription('Clique em "Adicionar" para criar um bloco (embed).')
        .setTimestamp();

  const rows = makeRows(id, payload.containers);
      const panel = await interaction.reply({ embeds: [emptyEmbed], components: rows, ephemeral: true, fetchReply: true });

      const updatePanel = async (msg, payload) => {
        const embeds = [];
        if (!payload.containers || payload.containers.length === 0) {
          embeds.push(new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Sem containers ainda. Clique em "Adicionar".').setTimestamp());
        } else {
          const summary = new EmbedBuilder()
            .setTitle('Containers atuais')
            .setDescription(payload.containers.map((c, i) => `#${i+1} — ${c.title || '[sem título]'}\n${c.description ? (c.description.length > 200 ? c.description.slice(0,200)+'…' : c.description) : '*sem descrição*'}`).join('\n\n'))
            .setTimestamp();
          embeds.push(summary);
        }
        try { await msg.edit({ embeds, components: makeRows(payload.id, payload.containers) }); } catch (e) { /* ignore */ }
      };

      const collector = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15 * 60 * 1000 });

      collector.on('collect', async i => {
        const [action, payloadId] = i.customId.split(':');
        if (payloadId !== id) return i.reply({ content: 'Painel inválido/expirado.', ephemeral: true });

        // simple concurrency lock: if a modal for this panel is already open, reject
        if (interaction.client.messageLocks.has(id)) {
          if (DEBUG) console.log(`panel ${id} is locked, rejecting action ${action}`);
          return i.reply({ content: 'Outra ação está em progresso neste painel. Aguarde e tente novamente.', ephemeral: true });
        }

        const pm = interaction.client.pendingMessages.get(id);
        if (!pm) return i.update({ content: 'Sessão expirada.', embeds: [], components: [] });

        if (action === 'message_add') {
          // set lock to prevent concurrent edits
          interaction.client.messageLocks.add(id);
          const modal = new ModalBuilder().setCustomId(`message_modal:${id}`).setTitle('Adicionar container (embed)');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_footer').setLabel('Footer').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false))
          );
          // safety: release lock if no modal submit within 2 minutes
          setTimeout(() => { if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2 * 60 * 1000);
          return i.showModal(modal);
        }

        if (action === 'message_edit_last') {
          if (!pm.containers || pm.containers.length === 0) return i.update({ content: 'Nenhum container para editar.', components: makeRows(id), embeds: [] });
          interaction.client.messageLocks.add(id);
          const last = pm.containers[pm.containers.length - 1] || {};
          const modal = new ModalBuilder().setCustomId(`message_edit:${id}`).setTitle('Editar último container (embed)');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.title || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(last.description || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.color || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.image || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_footer').setLabel('Footer').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.footer || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder((last.fields || []).map(f=>`${f.name}|${f.value}`).join('\n') || ''))
          );
          // safety: release lock if no modal submit within 2 minutes
          setTimeout(() => { if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2 * 60 * 1000);
          return i.showModal(modal);
        }

        if (action === 'message_remove_last') {
          pm.containers = pm.containers || [];
          const removed = pm.containers.pop();
          interaction.client.pendingMessages.set(id, pm);
          await i.update({ content: removed ? 'Último container removido.' : 'Nenhum container para remover.', ephemeral: true, components: makeRows(id) });
          await updatePanel(panel, pm);
          return;
        }

        if (action === 'message_clear') {
          pm.containers = [];
          interaction.client.pendingMessages.set(id, pm);
          await i.update({ content: 'Todos os containers foram removidos.', ephemeral: true, components: makeRows(id) });
          await updatePanel(panel, pm);
          return;
        }

        if (action === 'message_preview') {
          if (!pm.containers || pm.containers.length === 0) return i.update({ content: 'Nenhum container para pré-visualizar.', components: makeRows(id), embeds: [] });
          const previewEmbeds = pm.containers.map(c => {
            const e = new EmbedBuilder();
            if (c.title) e.setTitle(c.title);
            if (c.description) e.setDescription(c.description);
            if (c.color) try { e.setColor(`#${c.color}`); } catch {}
            if (c.image) try { e.setImage(c.image); } catch {}
            if (c.footer) e.setFooter({ text: c.footer });
            if (c.fields) for (const f of c.fields || []) e.addFields({ name: f.name, value: f.value });
            return e;
          });
          try {
            const ch = await interaction.client.channels.fetch(pm.channelId);
            if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
            await ch.send({ content: `Pré-visualização (por ${interaction.user.tag}):`, embeds: previewEmbeds });
            await i.update({ content: 'Pré-visualização enviada no canal padrão.', components: makeRows(id), embeds: [] });
            await updatePanel(panel, pm);
          } catch (err) {
            await i.update({ content: 'Falha ao enviar pré-visualização (não foi possível acessar o canal).', components: makeRows(id), embeds: [] });
          }
          return;
        }

        if (action === 'message_send') {
          if (!pm.containers || pm.containers.length === 0) return i.update({ content: 'Nenhum container para enviar.', components: makeRows(id), embeds: [] });
          try {
            const target = await interaction.client.channels.fetch(pm.channelId);
            if (!target || !target.isTextBased()) throw new Error('Canal inválido');
            for (const c of pm.containers) {
              const e = new EmbedBuilder();
              if (c.title) e.setTitle(c.title);
              if (c.description) e.setDescription(c.description);
              if (c.color) try { e.setColor(`#${c.color}`); } catch {}
              if (c.image) try { e.setImage(c.image); } catch {}
              if (c.footer) e.setFooter({ text: c.footer });
              if (c.fields) for (const f of c.fields || []) e.addFields({ name: f.name, value: f.value });
              await target.send({ embeds: [e] }).catch(err=>console.error('Erro ao enviar embed:', err));
            }

            // Optional integration: save as FAQ if requested
            if (pm.saveAsFAQ) {
              try {
                const fs = require('fs');
                const dbPath = './data/faq.json';
                if (!fs.existsSync('./data')) fs.mkdirSync('./data');
                if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ faqs: [] }, null, 2));
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const first = (pm.containers && pm.containers[0]) || null;
                if (first) {
                  db.faqs.push({ q: first.title || '(sem título)', a: first.description || '', createdAt: new Date().toISOString() });
                  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                }
              } catch (err) { console.error('Erro ao salvar FAQ:', err); }
            }
          } catch (err) { console.error('Erro ao enviar a mensagem (verifique permissões/canal):', err); await i.update({ content: 'Erro ao enviar a mensagem (verifique permissões/canal).', components: makeRows(id) }); }
          interaction.client.pendingMessages.delete(id);
          await i.update({ content: 'Mensagem enviada com sucesso. Painel finalizado.', embeds: [], components: [] });
          collector.stop('sent');
          return;
        }

        if (action === 'message_cancel') {
          interaction.client.pendingMessages.delete(id);
          await i.update({ content: 'Edição cancelada. Painel finalizado.', embeds: [], components: [] });
          collector.stop('cancelled');
          return;
        }

        await i.reply({ content: 'Ação desconhecida.', ephemeral: true });
      });

      collector.on('end', (_, reason) => {
        const pm = interaction.client.pendingMessages.get(id);
        if (pm) {
          interaction.client.pendingMessages.delete(id);
        }
        try { panel.edit({ content: `Sessão finalizada (${reason}).`, embeds: [], components: [] }); } catch (e) { /* ignore */ }
        try { if (interaction.client.messageLocks && interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); } catch {}
      });

    } catch (err) {
      console.error('Erro em /message.execute:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Ocorreu um erro interno ao abrir o painel de mensagens.', ephemeral: true });
    }
  }
};
