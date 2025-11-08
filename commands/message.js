const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel para criar mensagens/embeds customizados')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

      // permission: either ManageMessages or Administrator, or configured announceRoleIds
      const cfgPath = './data/config.json';
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = {}; }

      if (cfg.announceRoleIds && Array.isArray(cfg.announceRoleIds) && cfg.announceRoleIds.length) {
        const hasRole = cfg.announceRoleIds.some(rid => interaction.member.roles.cache.has(rid));
        if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      } else {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      }

      const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const session = { id, authorId: interaction.user.id, channelId: channel.id, panelChannelId: interaction.channel ? interaction.channel.id : null, containers: [], createdAt: Date.now() };

      interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
      interaction.client.pendingMessages.set(id, session);
      interaction.client.messageLocks = interaction.client.messageLocks || new Set();

      const makeRows = (key, containers = []) => {
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_upload:${key}`).setLabel('📎 Upload imagem').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_remove_last:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );

        const rows = [row1, row2];
        if (containers && containers.length) {
          const opts = containers.slice(0, 25).map((c, i) => ({ label: `#${i+1} ${c.title || '[sem título]'}`, value: String(i), description: c.description ? (c.description.length > 80 ? c.description.slice(0, 77) + '...' : c.description) : undefined }));
          rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`message_select_edit:${key}`).setPlaceholder('Editar container...').addOptions(opts).setMinValues(1).setMaxValues(1)));
        }
        return rows;
      };

  // Send panel as a regular (non-ephemeral) message so we can edit it from modal handlers
  const panelEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Use os botões para montar sua mensagem.').setTimestamp();
  const panel = await interaction.reply({ embeds: [panelEmbed], components: makeRows(id, session.containers), ephemeral: false, fetchReply: true });
  // store panel message reference so modal submit handler can refresh it
  session.panelChannelId = panel.channel.id;
  session.panelMessageId = panel.id;
  interaction.client.pendingMessages.set(id, session);

      const refreshPanel = async () => {
        try {
          const embed = new EmbedBuilder();
          if (!session.containers.length) embed.setTitle('Sem containers');
          else embed.setTitle('Containers:').setDescription(session.containers.map((c, i) => `#${i+1} — ${c.title || '[sem título]'}`).join('\n'));
          await panel.edit({ embeds: [embed], components: makeRows(id, session.containers) });
        } catch (e) { /* ignore */ }
      };

      const collector = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15 * 60 * 1000 });

      collector.on('collect', async i => {
        const [action, key] = i.customId.split(':');
        if (key !== id) return i.reply({ content: 'Sessão inválida.', ephemeral: true });
        if (interaction.client.messageLocks.has(id)) return i.reply({ content: 'Outra ação em progresso neste painel.', ephemeral: true });

        // ADD -> show modal (global events should handle modal submit)
        if (action === 'message_add') {
          interaction.client.messageLocks.add(id);
          const modal = new ModalBuilder().setCustomId(`message_modal:${id}`).setTitle('Adicionar container');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem (opcional)').setStyle(TextInputStyle.Short).setRequired(false))
          );
          setTimeout(() => { if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2 * 60 * 1000);
          return i.showModal(modal);
        }

        // select edit -> open modal for that index
        if (action === 'message_select_edit') {
          const val = i.values && i.values[0];
          if (typeof val === 'undefined') return i.reply({ content: 'Seleção inválida.', ephemeral: true });
          const idx = Number(val);
          if (Number.isNaN(idx)) return i.reply({ content: 'Seleção inválida.', ephemeral: true });
          const existing = session.containers[idx] || {};
          interaction.client.messageLocks.add(id);
          const modal = new ModalBuilder().setCustomId(`message_edit_idx:${id}:${idx}`).setTitle(`Editar container #${idx+1}`);
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.title || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(existing.description || '')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.image || ''))
          );
          setTimeout(() => { if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2 * 60 * 1000);
          return i.showModal(modal);
        }

        // remove last
        if (action === 'message_remove_last') {
          session.containers = session.containers || [];
          const removed = session.containers.pop();
          interaction.client.pendingMessages.set(id, session);
          await i.update({ content: removed ? 'Último container removido.' : 'Nenhum container para remover.', ephemeral: true, components: makeRows(id, session.containers) });
          await refreshPanel();
          return;
        }

        // clear
        if (action === 'message_clear') {
          session.containers = [];
          interaction.client.pendingMessages.set(id, session);
          await i.update({ content: 'Containers limpos.', ephemeral: true, components: makeRows(id, session.containers) });
          await refreshPanel();
          return;
        }

        // upload: if multiple containers ask select, else wait for attachment in panel channel
        if (action === 'message_upload') {
          const panelChannel = session.panelChannelId ? await interaction.client.channels.fetch(session.panelChannelId).catch(() => null) : null;
          if (!panelChannel || !panelChannel.isTextBased()) return i.reply({ content: 'Canal do painel inválido para upload.', ephemeral: true });

          if (session.containers.length > 1) {
            const opts = session.containers.map((c, idx) => ({ label: `#${idx+1} ${c.title || '[sem título]'}`, value: String(idx) }));
            const sel = new StringSelectMenuBuilder().setCustomId(`message_upload_select:${id}`).setPlaceholder('Escolha o container').addOptions(opts).setMinValues(1).setMaxValues(1);
            return i.reply({ components: [new ActionRowBuilder().addComponents(sel)], content: 'Selecione o container que receberá o anexo:', ephemeral: true });
          }

          const idx = session.containers.length ? session.containers.length - 1 : 0;
          await i.reply({ content: `Envie o anexo no canal do painel <#${session.panelChannelId}> em 60s; será aplicado ao container #${idx+1}.`, ephemeral: true });
          const f = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
          const mc = panelChannel.createMessageCollector({ filter: f, max: 1, time: 60 * 1000 });
          mc.on('collect', async m => {
            const att = m.attachments.first();
            if (!att) return await i.followUp({ content: 'Nenhum anexo encontrado.', ephemeral: true });
            if (!session.containers.length) session.containers.push({ title: null, description: null, image: att.url }); else session.containers[idx].image = att.url;
            interaction.client.pendingMessages.set(id, session);
            await i.followUp({ content: `Anexo aplicado ao container #${idx+1}.`, ephemeral: true });
            await refreshPanel();
          });
          mc.on('end', async collected => { if (!collected || collected.size === 0) try { await i.followUp({ content: 'Tempo esgotado. Nenhum anexo recebido.', ephemeral: true }); } catch (e) { } });
          return;
        }

        if (action === 'message_upload_select') {
          const val = i.values && i.values[0];
          if (typeof val === 'undefined') return i.reply({ content: 'Seleção inválida.', ephemeral: true });
          const idx = Number(val);
          const panelChannel = session.panelChannelId ? await interaction.client.channels.fetch(session.panelChannelId).catch(() => null) : null;
          if (!panelChannel || !panelChannel.isTextBased()) return i.reply({ content: 'Canal do painel inválido para upload.', ephemeral: true });
          await i.reply({ content: `Envie o anexo no canal do painel em 60s; será aplicado ao container #${idx+1}.`, ephemeral: true });
          const f = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
          const mc = panelChannel.createMessageCollector({ filter: f, max: 1, time: 60 * 1000 });
          mc.on('collect', async m => {
            const att = m.attachments.first();
            if (!att) return await i.followUp({ content: 'Nenhum anexo encontrado.', ephemeral: true });
            while (session.containers.length <= idx) session.containers.push({ title: null, description: null, image: null });
            session.containers[idx].image = att.url;
            interaction.client.pendingMessages.set(id, session);
            await i.followUp({ content: `Anexo aplicado ao container #${idx+1}.`, ephemeral: true });
            await refreshPanel();
          });
          mc.on('end', async collected => { if (!collected || collected.size === 0) try { await i.followUp({ content: 'Tempo esgotado. Nenhum anexo recebido.', ephemeral: true }); } catch (e) { } });
          return;
        }

        if (action === 'message_preview') {
          if (!session.containers.length) return i.update({ content: 'Nenhum container para pré-visualizar.', ephemeral: true, components: makeRows(id, session.containers) });
          const embeds = session.containers.map(c => { const e = new EmbedBuilder(); if (c.title) e.setTitle(c.title); if (c.description) e.setDescription(c.description); if (c.image) e.setImage(c.image); return e; });
          try {
            const ch = await interaction.client.channels.fetch(session.channelId);
            if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
            await ch.send({ content: `Pré-visualização (por ${interaction.user.tag}):`, embeds });
            await i.update({ content: 'Pré-visualização enviada no canal padrão.', components: makeRows(id, session.containers), embeds: [] });
            await refreshPanel();
          } catch (err) {
            console.error('preview error', err);
            await i.update({ content: 'Falha ao enviar pré-visualização.', components: makeRows(id, session.containers) });
          }
          return;
        }

        if (action === 'message_send') {
          if (!session.containers.length) return i.update({ content: 'Nenhum container para enviar.', ephemeral: true, components: makeRows(id, session.containers) });
          try {
            const ch = await interaction.client.channels.fetch(session.channelId);
            if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
            for (const c of session.containers) { const e = new EmbedBuilder(); if (c.title) e.setTitle(c.title); if (c.description) e.setDescription(c.description); if (c.image) e.setImage(c.image); await ch.send({ embeds: [e] }).catch(() => { }); }
          } catch (err) {
            console.error('send error', err);
            await i.update({ content: 'Erro ao enviar (permissões/canal).', ephemeral: true, components: makeRows(id, session.containers) });
            return;
          }
          interaction.client.pendingMessages.delete(id);
          await i.update({ content: 'Mensagem(s) enviadas.', embeds: [], components: [] });
          collector.stop('sent');
          return;
        }

        if (action === 'message_cancel') {
          interaction.client.pendingMessages.delete(id);
          await i.update({ content: 'Cancelado.', embeds: [], components: [] });
          collector.stop('cancel');
          return;
        }

        await i.reply({ content: 'Ação desconhecida.', ephemeral: true });
      });

      collector.on('end', () => { try { panel.edit({ content: 'Sessão finalizada.', embeds: [], components: [] }); } catch (e) { } interaction.client.pendingMessages.delete(id); if (interaction.client.messageLocks && interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); });

    } catch (err) {
      console.error('Erro em /message.execute:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Erro interno.', ephemeral: true });
    }
  }
};
