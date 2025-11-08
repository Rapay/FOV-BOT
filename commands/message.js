const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel para criar mensagens/embeds customizados')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    // Minimal local-only panel: Add, Clear, Preview, Send, Cancel
    try {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

      // basic permission check (keep existing config behavior if present)
      const cfgPath = './data/config.json';
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = {}; }
      if (cfg.announceRoleIds && Array.isArray(cfg.announceRoleIds) && cfg.announceRoleIds.length) {
        const hasRole = cfg.announceRoleIds.some(rid => interaction.member.roles.cache.has(rid));
        if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      } else {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
      }

      const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const session = { id, authorId: interaction.user.id, channelId: channel.id, panelChannelId: null, containers: [], draft: null };

      const makeRows = (key, containers = []) => {
        const rows = [];
        if (containers && containers.length) {
          const opts = containers.slice(0, 25).map((c, i) => ({ label: `#${i+1} ${c.title || '[sem título]'}`, value: String(i), description: c.description ? (c.description.length > 80 ? c.description.slice(0, 77) + '...' : c.description) : undefined }));
          rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`message_select_edit:${key}`).setPlaceholder('Editar container...').addOptions(opts).setMinValues(1).setMaxValues(1)));
        }
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_remove_last:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );
        rows.push(row1, row2);
        return rows;
      };

      const panelEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Use os botões para montar sua mensagem. (Sem salvamento)').setTimestamp();
      const panel = await interaction.reply({ embeds: [panelEmbed], components: makeRows(id), ephemeral: false, fetchReply: true });
      session.panelChannelId = panel.channel.id;
      session.panelMessageId = panel.id;

      const refreshPanel = async () => {
        const embed = new EmbedBuilder();
        if (!session.containers.length) embed.setTitle('Sem containers');
        else embed.setTitle('Containers:').setDescription(session.containers.map((c, i) => `#${i+1} — ${c.title || '[sem título]'}`).join('\n'));
        try { await panel.edit({ embeds: [embed], components: makeRows(id) }); } catch (e) { }
      };

      // Main component collector for the panel
      const collector = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15 * 60 * 1000 });

      collector.on('collect', async i => {
        try {
          const [action, key] = i.customId.split(':');
          if (key !== id) return i.reply({ content: 'Sessão inválida.', ephemeral: true });

          if (action === 'message_add') {
            // Open a modal to fill title/description (no image URL).
            // After submission present two ephemeral buttons: Confirm without image, or Wait for image (60s).
            try {
              const modal = new ModalBuilder().setCustomId(`message_modal_local:${id}`).setTitle('Novo container');
              // keep to 5 components: title, description, color, fields
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex, ex: #FF0000)').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const title = submitted.fields.getTextInputValue('c_title') || null;
              const description = submitted.fields.getTextInputValue('c_description') || null;
              const color = submitted.fields.getTextInputValue('c_color') || null;
              const fieldsRaw = (submitted.fields.getTextInputValue('c_fields') || '').trim();
              const fields = [];
              if (fieldsRaw.length > 0) {
                const lines = fieldsRaw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
                for (const ln of lines) {
                  const parts = ln.split('|');
                  if (parts.length >= 2) fields.push({ name: parts[0].trim(), value: parts.slice(1).join('|').trim() });
                }
              }

              // Present choice buttons
              const choiceRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`message_add_choice:confirm_noimage:${id}`).setLabel('✅ Confirmar sem imagem').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`message_add_choice:wait_image:${id}`).setLabel('🕒 Aguardar imagem (60s)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`message_add_choice:dm_image:${id}`).setLabel('📩 Enviar via DM').setStyle(ButtonStyle.Primary)
              );
              await submitted.reply({ content: 'Deseja adicionar agora sem imagem ou aguardar um upload no canal do painel?', components: [choiceRow], ephemeral: true });

              const panelChannel = session.panelChannelId ? await interaction.client.channels.fetch(session.panelChannelId).catch(() => null) : null;

              // Collector for the choice buttons
              const choiceFilter = b => b.user.id === interaction.user.id && b.customId && b.customId.startsWith(`message_add_choice:`);
              const choiceCollector = panel.channel.createMessageComponentCollector({ filter: choiceFilter, max: 1, time: 60 * 1000 });
              choiceCollector.on('collect', async bi => {
                try {
                  const parts = bi.customId.split(':'); // message_add_choice:action:id
                  const actionChoice = parts[1];
                  if (parts[2] !== id) return bi.reply({ content: 'Sessão inválida.', ephemeral: true });
                  if (actionChoice === 'confirm_noimage') {
                    // Add immediately without image
                    session.containers.push({ title, description, color: color || null, fields: fields.length ? fields : null, image: null });
                    await bi.update({ content: 'Container adicionado sem imagem.', components: [] , ephemeral: true }).catch(()=>{});
                    await refreshPanel();
                    return;
                  }
                  if (actionChoice === 'wait_image') {
                    if (!panelChannel || !panelChannel.isTextBased()) {
                      await bi.update({ content: 'Canal do painel inválido para upload; adicionando sem imagem.', components: [], ephemeral: true }).catch(()=>{});
                      session.containers.push({ title, description, image: null });
                      await refreshPanel();
                      return;
                    }
                    await bi.update({ content: `Aguardando imagem no canal do painel <#${session.panelChannelId}> por 60s...`, components: [], ephemeral: true }).catch(()=>{});
                    const f = m => m.author.id === interaction.user.id && m.attachments && m.attachments.size > 0;
                    const mc = panelChannel.createMessageCollector({ filter: f, max: 1, time: 60 * 1000 });
                      mc.on('collect', async m => {
                      const att = m.attachments.first();
                      session.containers.push({ title, description, color: color || null, fields: fields.length ? fields : null, image: att ? att.url : null });
                      try { await panelChannel.send({ content: `${interaction.user}`, embeds: [] }).catch(()=>{}); } catch {}
                      try { await refreshPanel(); } catch {}
                    });
                    mc.on('end', async collected => {
                      if (!collected || collected.size === 0) {
                        // no image received
                        session.containers.push({ title, description, color: color || null, fields: fields.length ? fields : null, image: null });
                        try { await panelChannel.send({ content: `${interaction.user}`, embeds: [] }).catch(()=>{}); } catch {}
                        try { await refreshPanel(); } catch {}
                      }
                    });
                    return;
                  }
                  if (actionChoice === 'dm_image') {
                    // send a DM to the user asking for attachment
                    try {
                      const user = interaction.user;
                      const dmChannel = await user.createDM();
                      const prompt = await dmChannel.send({ content: 'Envie a imagem para este DM nas próximas 60s; ela será anexada ao container que você está criando.' });
                      const fdm = m => m.author.id === user.id && m.attachments && m.attachments.size > 0;
                      const mcDM = dmChannel.createMessageCollector({ filter: fdm, max: 1, time: 60 * 1000 });
                      mcDM.on('collect', async m => {
                        const att = m.attachments.first();
                        session.containers.push({ title, description, color: color || null, fields: fields.length ? fields : null, image: att ? att.url : null });
                        try { await dmChannel.send({ content: 'Imagem recebida e aplicada ao container.' }).catch(()=>{}); } catch {}
                        try { await refreshPanel(); } catch {}
                      });
                      mcDM.on('end', async collected => {
                        if (!collected || collected.size === 0) {
                          session.containers.push({ title, description, color: color || null, fields: fields.length ? fields : null, image: null });
                          try { await dmChannel.send({ content: 'Nenhuma imagem recebida: container adicionado sem imagem.' }).catch(()=>{}); } catch {}
                          try { await refreshPanel(); } catch {}
                        }
                      });
                    } catch (err) {
                      console.error('Erro ao abrir DM para upload:', err);
                      await bi.update({ content: 'Falha ao iniciar DM para upload; adicionando sem imagem.', components: [], ephemeral: true }).catch(()=>{});
                      session.containers.push({ title, description, color: color || null, fields: fields.length ? fields : null, image: null });
                      await refreshPanel();
                    }
                    return;
                  }
                } catch (err) {
                  console.error('Erro na escolha de adicionar:', err);
                }
              });

              // If no choice pressed in time, default to add without image
              choiceCollector.on('end', async collected => {
                if (!collected || collected.size === 0) {
                  session.containers.push({ title, description, image: null });
                  try { await submitted.followUp({ content: 'Nenhuma escolha feita: adicionado sem imagem.', ephemeral: true }); } catch {}
                  try { await refreshPanel(); } catch {}
                }
              });
            } catch (err) {
              try { if (!i.replied) await i.reply({ content: 'Tempo esgotado ao preencher.', ephemeral: true }); } catch {};
            }
            return;
          }

          if (action === 'message_clear') {
            session.containers = [];
            await i.update({ content: 'Containers limpos.', ephemeral: true, components: makeRows(id) }).catch(() => {});
            return await refreshPanel();
          }

          // remove last
          if (action === 'message_remove_last') {
            session.containers = session.containers || [];
            const removed = session.containers.pop();
            await i.update({ content: removed ? 'Último container removido.' : 'Nenhum container para remover.', ephemeral: true, components: makeRows(id) }).catch(()=>{});
            await refreshPanel();
            return;
          }

          // edit selected container (select menu)
          if (action === 'message_select_edit') {
            const val = i.values && i.values[0];
            if (typeof val === 'undefined') return i.reply({ content: 'Seleção inválida.', ephemeral: true });
            const idx = Number(val);
            if (Number.isNaN(idx)) return i.reply({ content: 'Seleção inválida.', ephemeral: true });
            const existing = session.containers[idx] || {};
            try {
              const modal = new ModalBuilder().setCustomId(`message_edit_local:${id}:${idx}`).setTitle(`Editar container #${idx+1}`);
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.title || '')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(existing.description || '')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.color || '')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder((existing.fields || []).map(f=>`${f.name}|${f.value}`).join('\n') || ''))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const title = submitted.fields.getTextInputValue('c_title') || existing.title || null;
              const description = submitted.fields.getTextInputValue('c_description') || existing.description || null;
              const color = submitted.fields.getTextInputValue('c_color') || existing.color || null;
              const fieldsRaw = (submitted.fields.getTextInputValue('c_fields') || '').trim();
              const fields = [];
              if (fieldsRaw.length > 0) {
                const lines = fieldsRaw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
                for (const ln of lines) {
                  const parts = ln.split('|');
                  if (parts.length >= 2) fields.push({ name: parts[0].trim(), value: parts.slice(1).join('|').trim() });
                }
              } else {
                if (existing.fields) for (const f of existing.fields) fields.push(f);
              }
              session.containers[idx] = { title, description, color: color || null, fields: fields.length ? fields : null, image: existing.image || null };
              await submitted.reply({ content: `Container #${idx+1} atualizado.`, ephemeral: true });
              await refreshPanel();
            } catch (err) {
              console.error('Erro no edit local modal flow:', err);
              return i.reply({ content: 'Erro ou tempo esgotado ao editar.', ephemeral: true });
            }
            return;
          }

          if (action === 'message_preview') {
            if (!session.containers.length) return i.update({ content: 'Nenhum container para pré-visualizar.', ephemeral: true, components: makeRows(id) }).catch(() => {});
            const embeds = session.containers.map(c => { const e = new EmbedBuilder(); if (c.title) e.setTitle(c.title); if (c.description) e.setDescription(c.description); if (c.image) e.setImage(c.image); return e; });
            try {
              const ch = await interaction.client.channels.fetch(session.channelId);
              if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
              await ch.send({ content: `Pré-visualização (por ${interaction.user.tag}):`, embeds });
              await i.update({ content: 'Pré-visualização enviada no canal padrão.', components: makeRows(id) }).catch(() => {});
            } catch (err) {
              console.error('preview error', err);
              await i.update({ content: 'Falha ao enviar pré-visualização.', components: makeRows(id) }).catch(() => {});
            }
            return;
          }

          if (action === 'message_send') {
            if (!session.containers.length) return i.update({ content: 'Nenhum container para enviar.', ephemeral: true, components: makeRows(id) }).catch(() => {});
            try {
              const ch = await interaction.client.channels.fetch(session.channelId);
              if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
              for (const c of session.containers) {
                const e = new EmbedBuilder(); if (c.title) e.setTitle(c.title); if (c.description) e.setDescription(c.description); if (c.image) e.setImage(c.image);
                await ch.send({ embeds: [e] }).catch(() => {});
              }
              await i.update({ content: 'Mensagem(s) enviadas.', embeds: [], components: [] }).catch(() => {});
              collector.stop('sent');
            } catch (err) {
              console.error('send error', err);
              await i.update({ content: 'Erro ao enviar (permissões/canal).', ephemeral: true, components: makeRows(id) }).catch(() => {});
            }
            return;
          }

          if (action === 'message_cancel') {
            await i.update({ content: 'Cancelado.', embeds: [], components: [] }).catch(() => {});
            collector.stop('cancel');
            return;
          }

          await i.reply({ content: 'Ação desconhecida.', ephemeral: true });
        } catch (err) {
          console.error('Erro no painel /message:', err);
        }
      });

      // legacy draft flow removed — simplified add flow handles modal + optional upload

      collector.on('end', () => { try { panel.edit({ content: 'Sessão finalizada.', embeds: [], components: [] }); } catch (e) { } });

    } catch (err) {
      console.error('Erro em /message.execute:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Erro interno.', ephemeral: true });
    }
  }
};

