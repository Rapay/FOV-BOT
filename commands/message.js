// A minimal stub for /message to avoid syntax issues while we iterate.
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('message').setDescription('Painel de mensagem (stub — em desenvolvimento)'),
  async execute(interaction) {
    return interaction.reply({ content: 'Painel /message: recurso em desenvolvimento. Voltarei em breve com upload por mensagem e seleção de container.', ephemeral: true });
  }
};
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

      // permissions
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
      const payload = { id, authorId: interaction.user.id, channelId: channel.id, panelChannelId: interaction.channel ? interaction.channel.id : null, containers: [], createdAt: Date.now() };
      interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
      interaction.client.pendingMessages.set(id, payload);
      interaction.client.messageLocks = interaction.client.messageLocks || new Set();

      const makeRows = (key, containers = []) => {
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_edit_last:${key}`).setLabel('✏️ Editar último').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_upload:${key}`).setLabel('📎 Upload imagem').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_remove_last:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_refresh:${key}`).setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );
        const rows = [row1, row2];
        if (containers && containers.length > 0) {
          const options = containers.slice(0,25).map((c, i) => ({ label: `#${i+1} ${c.title || '[sem título]'}`, value: String(i), description: c.description ? (c.description.length > 80 ? c.description.slice(0,77)+'...' : c.description) : undefined }));
          const sel = new StringSelectMenuBuilder().setCustomId(`message_select_edit:${key}`).setPlaceholder('Editar container...').addOptions(options).setMinValues(1).setMaxValues(1);
          rows.push(new ActionRowBuilder().addComponents(sel));
        }
        return rows;
      };

      const panelEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Clique em Adicionar para criar um container.').setTimestamp();
      const panel = await interaction.reply({ embeds: [panelEmbed], components: makeRows(id, payload.containers), ephemeral: true, fetchReply: true });

      const updatePanel = async (msg, pm) => {
        const embeds = [];
        if (!pm.containers || pm.containers.length === 0) embeds.push(new EmbedBuilder().setTitle('Painel').setDescription('Sem containers.'));
        else embeds.push(new EmbedBuilder().setTitle('Containers').setDescription(pm.containers.map((c,i)=>`#${i+1} — ${c.title||'[sem título]'}`).join('\n')));
        try { await msg.edit({ embeds, components: makeRows(pm.id, pm.containers) }); } catch (e) {}
      };

      const collector = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15 * 60 * 1000 });

      collector.on('collect', async i => {
        const [action, key] = i.customId.split(':');
        if (key !== id) return i.reply({ content: 'Painel inválido.', ephemeral: true });
        const pm = interaction.client.pendingMessages.get(id);
        if (!pm) return i.update({ content: 'Sessão expirada.', embeds: [], components: [] });

        if (interaction.client.messageLocks.has(id)) return i.reply({ content: 'Outra ação em progresso neste painel.', ephemeral: true });

        if (action === 'message_add') {
          interaction.client.messageLocks.add(id);
          const modal = new ModalBuilder().setCustomId(`message_modal:${id}`).setTitle('Adicionar container');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false))
          );
          setTimeout(()=>{ if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2*60*1000);
          return i.showModal(modal);
        }

        if (action === 'message_select_edit') {
          // global handler will open the edit modal; acknowledge
          return i.reply({ content: 'Abrindo modal para editar...', ephemeral: true });
        }

        if (action === 'message_edit_last') {
          if (!pm.containers || pm.containers.length === 0) return i.update({ content: 'Nenhum container para editar.', ephemeral: true, components: makeRows(id) });
          interaction.client.messageLocks.add(id);
          const last = pm.containers[pm.containers.length-1] || {};
          const modal = new ModalBuilder().setCustomId(`message_edit:${id}`).setTitle('Editar último container');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.title||'')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(last.description||'')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.color||'')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(last.image||'')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder((last.fields||[]).map(f=>`${f.name}|${f.value}`).join('\n')||''))
          );
          setTimeout(()=>{ if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2*60*1000);
          return i.showModal(modal);
        }

        if (action === 'message_remove_last') {
          pm.containers = pm.containers || [];
          const removed = pm.containers.pop();
          interaction.client.pendingMessages.set(id, pm);
          await i.update({ content: removed ? 'Último container removido.' : 'Nenhum container para remover.', ephemeral: true, components: makeRows(id, pm.containers) });
          await updatePanel(panel, pm);
          return;
        }

        if (action === 'message_upload') {
          pm.containers = pm.containers || [];
          const panelChannelId = pm.panelChannelId;
          const panelChannel = panelChannelId ? await interaction.client.channels.fetch(panelChannelId).catch(()=>null) : null;
          if (!panelChannel || !panelChannel.isTextBased()) return i.reply({ content: 'Canal do painel inválido para upload.', ephemeral: true });

          if (pm.containers.length > 1) {
            const options = pm.containers.map((c, idx)=>({ label: `#${idx+1} ${c.title||'[sem título]'}`, value: String(idx) }));
            const sel = new StringSelectMenuBuilder().setCustomId(`message_upload_select:${id}`).setPlaceholder('Selecione o container').addOptions(options).setMinValues(1).setMaxValues(1);
            return i.reply({ content: 'Escolha o container para receber o anexo:', components: [new ActionRowBuilder().addComponents(sel)], ephemeral: true });
          }

          const targetIndex = pm.containers.length === 0 ? 0 : pm.containers.length-1;
          await i.reply({ content: `Envie a imagem como anexo no canal do painel <#${panelChannelId}> dentro de 60s. Será aplicada ao container #${targetIndex+1}.`, ephemeral: true });

          const filter = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
          const msgCollector = panelChannel.createMessageCollector({ filter, max: 1, time: 60*1000 });
          msgCollector.on('collect', async m => {
            const att = m.attachments.first();
            if (!att) return await i.followUp({ content: 'Nenhum anexo encontrado.', ephemeral: true });
            const url = att.url;
            if (!pm.containers || pm.containers.length === 0) pm.containers = [{ title:null, description:null, image: url }];
            else pm.containers[targetIndex].image = url;
            interaction.client.pendingMessages.set(id, pm);
            await i.followUp({ content: `Imagem aplicada ao container #${targetIndex+1}.`, ephemeral: true });
            await updatePanel(panel, pm);
          });
          msgCollector.on('end', async collected => { if (!collected || collected.size===0) await i.followUp({ content: 'Tempo esgotado. Nenhum anexo recebido.', ephemeral: true }); });
          return;
        }

        if (action === 'message_upload_select') {
          const sel = i.values && i.values[0];
          if (typeof sel === 'undefined') return i.reply({ content: 'Seleção inválida.', ephemeral: true });
          const idx = Number(sel);
          if (Number.isNaN(idx)) return i.reply({ content: 'Seleção inválida.', ephemeral: true });
          const panelChannelId = pm.panelChannelId;
          const panelChannel = panelChannelId ? await interaction.client.channels.fetch(panelChannelId).catch(()=>null) : null;
          if (!panelChannel || !panelChannel.isTextBased()) return i.reply({ content: 'Canal do painel inválido para upload.', ephemeral: true });
          await i.reply({ content: `Container #${idx+1} selecionado. Envie o anexo no canal do painel dentro de 60s.`, ephemeral: true });
          const filter = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
          const msgCollector = panelChannel.createMessageCollector({ filter, max: 1, time: 60*1000 });
          msgCollector.on('collect', async m => {
            const att = m.attachments.first();
            if (!att) return await i.followUp({ content: 'Nenhum anexo encontrado.', ephemeral: true });
            const url = att.url;
            pm.containers = pm.containers || [];
            while (pm.containers.length <= idx) pm.containers.push({ title:null, description:null, image: null });
            pm.containers[idx].image = url;
            interaction.client.pendingMessages.set(id, pm);
            await i.followUp({ content: `Imagem aplicada ao container #${idx+1}.`, ephemeral: true });
            await updatePanel(panel, pm);
          });
          msgCollector.on('end', async collected => { if (!collected || collected.size===0) await i.followUp({ content: 'Tempo esgotado. Nenhum anexo recebido.', ephemeral: true }); });
          return;
        }

        if (action === 'message_preview') {
          if (!pm.containers || pm.containers.length === 0) return i.update({ content: 'Nenhum container para pré-visualizar.', ephemeral: true, components: makeRows(id, pm.containers) });
          const previewEmbeds = pm.containers.map(c => {
            const e = new EmbedBuilder();
            if (c.title) e.setTitle(c.title);
            if (c.description) e.setDescription(c.description);
            if (c.color) try { e.setColor(`#${c.color}`); } catch {}
            if (c.image) try { e.setImage(c.image); } catch {}
            if (c.fields) for (const f of c.fields||[]) e.addFields({ name: f.name, value: f.value });
            return e;
          });
          try {
            const ch = await interaction.client.channels.fetch(pm.channelId);
            if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
            await ch.send({ content: `Pré-visualização (por ${interaction.user.tag}):`, embeds: previewEmbeds });
            await i.update({ content: 'Pré-visualização enviada no canal padrão.', components: makeRows(id, pm.containers), embeds: [] });
            await updatePanel(panel, pm);
          } catch (err) {
            console.error('Erro ao enviar pré-visualização:', err);
            await i.update({ content: 'Falha ao enviar pré-visualização (não foi possível acessar o canal).', components: makeRows(id, pm.containers), embeds: [] });
          }
          return;
        }

        if (action === 'message_refresh') { await updatePanel(panel, pm); try { await i.update({ content: 'Painel atualizado.', components: makeRows(id, pm.containers), embeds: [] }); } catch(e){} return; }

        if (action === 'message_send') {
          if (!pm.containers || pm.containers.length === 0) return i.update({ content: 'Nenhum container para enviar.', ephemeral: true, components: makeRows(id, pm.containers) });
          try {
            const target = await interaction.client.channels.fetch(pm.channelId);
            if (!target || !target.isTextBased()) throw new Error('Canal inválido');
            for (const c of pm.containers) {
              const e = new EmbedBuilder();
              if (c.title) e.setTitle(c.title);
              if (c.description) e.setDescription(c.description);
              if (c.color) try { e.setColor(`#${c.color}`); } catch {}
              if (c.image) try { e.setImage(c.image); } catch {}
              if (c.fields) for (const f of c.fields||[]) e.addFields({ name: f.name, value: f.value });
              await target.send({ embeds: [e] }).catch(err=>console.error('Erro ao enviar embed:', err));
            }
          } catch (err) {
            console.error('Erro ao enviar a mensagem:', err);
            await i.update({ content: 'Erro ao enviar a mensagem (verifique permissões/canal).', ephemeral: true, components: makeRows(id, pm.containers) });
            return;
          }
          interaction.client.pendingMessages.delete(id);
          await i.update({ content: 'Mensagem enviada com sucesso. Painel finalizado.', embeds: [], components: [] });
          collector.stop('sent');
          return;
        }

        if (action === 'message_cancel') { interaction.client.pendingMessages.delete(id); await i.update({ content: 'Edição cancelada.', ephemeral: true, embeds: [], components: [] }); collector.stop('cancelled'); return; }

        await i.reply({ content: 'Ação desconhecida.', ephemeral: true });
      });

      collector.on('end', (_, reason) => { interaction.client.pendingMessages.delete(id); try{ panel.edit({ content: `Sessão finalizada (${reason}).`, embeds: [], components: [] }); }catch(e){} if (interaction.client.messageLocks && interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); });

    } catch (err) {
      console.error('Erro em /message.execute:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Ocorreu um erro interno ao abrir o painel de mensagens.', ephemeral: true });
    }
  }
};
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

      // permissões
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
      const payload = { id, authorId: interaction.user.id, channelId: channel.id, panelChannelId: interaction.channel ? interaction.channel.id : null, containers: [], createdAt: Date.now() };
      interaction.client.pendingMessages = interaction.client.pendingMessages || new Map();
      interaction.client.pendingMessages.set(id, payload);

      // helper to create 1-2 action rows (max 5 components per row)
      const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
      interaction.client.messageLocks = interaction.client.messageLocks || new Set();

      const makeRows = (id, containers = []) => {
        const first = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_edit_last:${id}`).setLabel('✏️ Editar último').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_upload:${id}`).setLabel('📎 Upload imagem').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
        );

        const second = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_refresh:${id}`).setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );

        const rows = [first, second];
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

      const emptyEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Clique em "Adicionar" para criar um bloco (embed).').setTimestamp();
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

        // simple concurrency lock
        if (interaction.client.messageLocks.has(id)) {
          if (DEBUG) console.log(`panel ${id} is locked, rejecting action ${action}`);
          return i.reply({ content: 'Outra ação está em progresso neste painel. Aguarde e tente novamente.', ephemeral: true });
        }

        const pm = interaction.client.pendingMessages.get(id);
        if (!pm) return i.update({ content: 'Sessão expirada.', embeds: [], components: [] });

        if (action === 'message_add') {
          interaction.client.messageLocks.add(id);
          const modal = new ModalBuilder().setCustomId(`message_modal:${id}`).setTitle('Adicionar container (embed)');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false))
          );
          setTimeout(() => { if (interaction.client.messageLocks.has(id)) interaction.client.messageLocks.delete(id); }, 2 * 60 * 1000);
          return i.showModal(modal);
        }

        if (action === 'message_select_edit') {
          // delegate to global handler in events (that opens a modal)
          // but to keep the panel collector flow consistent, we reply ephemerally to acknowledge
          return i.reply({ content: 'Abrindo modal para editar o container selecionado...', ephemeral: true });
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
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder((last.fields || []).map(f=>`${f.name}|${f.value}`).join('\n') || ''))
          );
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

        if (action === 'message_upload') {
          pm.containers = pm.containers || [];
          let panelChannel = null;
          try { panelChannel = pm.panelChannelId ? await interaction.client.channels.fetch(pm.panelChannelId) : null; } catch {}
          if (!panelChannel || !panelChannel.isTextBased()) {
            return i.reply({ content: 'Canal do painel inválido para upload. Verifique onde você executou o comando.', ephemeral: true });
          }

          if (pm.containers.length > 1) {
            const options = pm.containers.map((c, idx) => ({ label: `#${idx+1} ${c.title || '[sem título]'}`, value: String(idx), description: c.description ? (c.description.length > 80 ? c.description.slice(0,77)+'...' : c.description) : undefined })).slice(0,25);
            const select = new StringSelectMenuBuilder().setCustomId(`message_upload_select:${id}`).setPlaceholder('Escolha o container para aplicar o anexo').addOptions(options).setMinValues(1).setMaxValues(1);
            const row = new ActionRowBuilder().addComponents(select);
            await i.reply({ content: 'Selecione o container que deve receber o anexo:', components: [row], ephemeral: true });
            return;
          }

          const targetIndex = (pm.containers.length === 0) ? 0 : (pm.containers.length - 1);
          await i.reply({ content: `Envie a imagem/arquivo como anexo no canal <#${pm.panelChannelId}> dentro de 60 segundos. O anexo será aplicado ao container #${targetIndex+1}.`, ephemeral: true });

          const filter = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
          const msgCollector = panelChannel.createMessageCollector({ filter, max: 1, time: 60 * 1000 });

          msgCollector.on('collect', async m => {
            try {
              const att = m.attachments.first();
              if (!att) return await i.followUp({ content: 'Nenhum anexo encontrado na mensagem.', ephemeral: true });
              const url = att.url;
              if (!pm.containers || pm.containers.length === 0) pm.containers = [{ title: null, description: null, image: url }];
              else pm.containers[targetIndex].image = url;
              interaction.client.pendingMessages.set(id, pm);
              await i.followUp({ content: `Imagem anexada com sucesso ao container #${targetIndex+1}.`, ephemeral: true });
              await updatePanel(panel, pm);
            } catch (err) {
              console.error('Erro no upload de anexo:', err);
              await i.followUp({ content: 'Erro ao processar o anexo.', ephemeral: true });
            }
          });

          msgCollector.on('end', async collected => {
            if (!collected || collected.size === 0) {
              try { await i.followUp({ content: 'Tempo esgotado. Nenhum anexo recebido.', ephemeral: true }); } catch (e) {}
            }
          });

          return;
        }

        if (action === 'message_upload_select') {
          const sel = i.values && i.values[0];
          if (typeof sel === 'undefined') return i.reply({ content: 'Nenhum container selecionado.', ephemeral: true });
          const idx = Number(sel);
          if (Number.isNaN(idx)) return i.reply({ content: 'Seleção inválida.', ephemeral: true });
          pm.containers = pm.containers || [];
          let panelChannel = null;
          try { panelChannel = pm.panelChannelId ? await interaction.client.channels.fetch(pm.panelChannelId) : null; } catch {}
          if (!panelChannel || !panelChannel.isTextBased()) {
            return i.reply({ content: 'Canal do painel inválido para upload. Verifique onde você executou o comando.', ephemeral: true });
          }

          await i.reply({ content: `Container #${idx+1} selecionado. Agora envie a imagem/arquivo como anexo no canal <#${pm.panelChannelId}> dentro de 60 segundos.`, ephemeral: true });

          const filter = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
          const msgCollector = panelChannel.createMessageCollector({ filter, max: 1, time: 60 * 1000 });

          msgCollector.on('collect', async m => {
            try {
              const att = m.attachments.first();
              if (!att) return await i.followUp({ content: 'Nenhum anexo encontrado na mensagem.', ephemeral: true });
              const url = att.url;
              if (!pm.containers || pm.containers.length === 0) pm.containers = [];
              while (pm.containers.length <= idx) pm.containers.push({ title: null, description: null, image: null });
              pm.containers[idx].image = url;
              interaction.client.pendingMessages.set(id, pm);
              await i.followUp({ content: `Imagem anexada com sucesso ao container #${idx+1}.`, ephemeral: true });
              await updatePanel(panel, pm);
            } catch (err) {
              console.error('Erro no upload de anexo:', err);
              await i.followUp({ content: 'Erro ao processar o anexo.', ephemeral: true });
            }
          });

          msgCollector.on('end', async collected => {
            if (!collected || collected.size === 0) {
              try { await i.followUp({ content: 'Tempo esgotado. Nenhum anexo recebido.', ephemeral: true }); } catch (e) {}
            }
          });

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
            } catch (err) {
              console.error('Erro em /message.execute:', err);
              if (!interaction.replied) await interaction.reply({ content: 'Ocorreu um erro interno ao abrir o painel de mensagens.', ephemeral: true });
            }
          }
        };
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
