module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const client = interaction.client;

    // Handle select menus for FAQ publish pages (customId: faq_select:<page>)
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      try {
        if (id && id.startsWith('faq_select:')) {
          const val = interaction.values && interaction.values[0];
          const idx = parseInt(val, 10);
          const fs = require('fs');
          const dbPath = './data/faq.json';
          if (!fs.existsSync(dbPath)) return interaction.reply({ content: 'Nenhuma FAQ encontrada.', ephemeral: true });
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          const entry = db.faqs[idx];
          if (!entry) return interaction.reply({ content: 'FAQ não encontrada.', ephemeral: true });
          const answer = entry.a.length > 4000 ? entry.a.slice(0, 3997) + '...' : entry.a;
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder().setTitle(entry.q).setDescription(answer).setFooter({ text: 'FAQ (privado)' }).setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } catch (err) {
        console.error('Erro ao processar faq_select:', err);
        if (!interaction.replied) await interaction.reply({ content: 'Erro ao recuperar a resposta.', ephemeral: true });
      }
    }

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

      // If this is a message panel button, the collector on the panel message
      // will handle it. Skip global handling to avoid double responses which
      // cause "This interaction failed" (two handlers calling showModal/update).
      if (id && id.startsWith('message_')) return;

      // If a select menu from the message panel was used to choose a container to edit
      if (interaction.isStringSelectMenu() && id && id.startsWith('message_select_edit:')) {
        const key = id.split(':')[1];
        const pending = client.pendingMessages && client.pendingMessages.get(key);
        if (!pending) return interaction.reply({ content: 'Sessão expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem iniciou pode usar este seletor.', ephemeral: true });
        const selected = interaction.values && interaction.values[0];
        const idx = parseInt(selected, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= (pending.containers || []).length) return interaction.reply({ content: 'Seleção inválida.', ephemeral: true });

        // acquire lock and open modal to edit selected container
        if (interaction.client.messageLocks && interaction.client.messageLocks.has(key)) return interaction.reply({ content: 'Outra ação está em progresso neste painel. Aguarde.', ephemeral: true });
        interaction.client.messageLocks.add(key);
        const existing = pending.containers[idx] || {};
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`message_edit_idx:${key}:${idx}`).setTitle(`Editar container #${idx+1}`);
        // Keep to 5 components (Discord limit). Footer input removed to avoid exceeding limit.
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.title || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(existing.description || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.color || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.image || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_fields').setLabel('Fields (uma por linha: nome|valor)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder((existing.fields || []).map(f=>`${f.name}|${f.value}`).join('\n') || ''))
        );
        // safety timeout to release lock
        setTimeout(() => { if (interaction.client.messageLocks && interaction.client.messageLocks.has(key)) interaction.client.messageLocks.delete(key); }, 2 * 60 * 1000);
        return interaction.showModal(modal);
      }

      // FAQ interactive buttons (published FAQs). Toggle answer visibility
      // inside the published embed when a button is clicked.
      // FAQ search pagination and show (interactive search sessions)
      if (id && id.startsWith('faq_search_page:')) {
        try {
          const parts = id.split(':');
          const key = parts[1];
          const target = parseInt(parts[2], 10);
          const session = client.pendingSearches && client.pendingSearches.get(key);
          if (!session) return interaction.reply({ content: 'Sessão de busca expirada ou inválida.', ephemeral: true });
          if (interaction.user.id !== session.authorId) return interaction.reply({ content: 'Apenas quem iniciou a busca pode navegar os resultados.', ephemeral: true });
          const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const pageSize = 5;
          const totalPages = Math.max(1, Math.ceil(session.results.length / pageSize));
          const page = Number.isNaN(target) ? 0 : Math.max(0, Math.min(target, totalPages - 1));

          const offset = page * pageSize;
          const slice = session.results.slice(offset, offset + pageSize);
          const embed = new EmbedBuilder().setTitle(`Resultados para: ${session.term}`).setTimestamp();
          for (const item of slice) {
            const name = `#${item.i} — ${item.q.length > 150 ? item.q.slice(0,150) + '...' : item.q}`;
            const value = item.a.length > 300 ? item.a.slice(0,300) + '...' : item.a;
            embed.addFields({ name, value });
          }

          const rowQuestions = new ActionRowBuilder();
          for (const s of slice) rowQuestions.addComponents(new ButtonBuilder().setCustomId(`faq_search_show:${key}:${s.i}`).setLabel(`#${s.i}`).setStyle(ButtonStyle.Primary));

          const rowNav = new ActionRowBuilder();
          const prev = new ButtonBuilder().setCustomId(`faq_search_page:${key}:${page-1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0);
          const pageBadge = new ButtonBuilder().setCustomId(`faq_search_page_badge:${key}:${page}`).setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
          const next = new ButtonBuilder().setCustomId(`faq_search_page:${key}:${page+1}`).setLabel('Próximo ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages-1);
          rowNav.addComponents(prev, pageBadge, next);

          await interaction.update({ embeds: [embed], components: [rowQuestions, rowNav] });
        } catch (err) {
          console.error('Erro ao processar faq_search_page:', err);
          if (!interaction.replied) await interaction.reply({ content: 'Erro ao navegar resultados da busca.', ephemeral: true });
        }
        return;
      }

      if (id && id.startsWith('faq_search_show:')) {
        try {
          const parts = id.split(':');
          const key = parts[1];
          const idx = parseInt(parts[2], 10);
          const session = client.pendingSearches && client.pendingSearches.get(key);
          if (!session) return interaction.reply({ content: 'Sessão de busca expirada ou inválida.', ephemeral: true });
          if (interaction.user.id !== session.authorId) return interaction.reply({ content: 'Apenas quem iniciou a busca pode ver os detalhes.', ephemeral: true });
          const found = session.results.find(r => r.i === idx);
          if (!found) return interaction.reply({ content: 'Resultado não encontrado.', ephemeral: true });
          const { EmbedBuilder } = require('discord.js');
          const answer = found.a.length > 4000 ? found.a.slice(0,3997) + '...' : found.a;
          const embed = new EmbedBuilder().setTitle(found.q).setDescription(answer).setFooter({ text: 'Resultado da busca (privado)' }).setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
          console.error('Erro ao processar faq_search_show:', err);
          if (!interaction.replied) await interaction.reply({ content: 'Erro ao recuperar o resultado.', ephemeral: true });
        }
        return;
      }
      if (id && id.startsWith('faq_page:')) {
        // Pagination click: update the message to show target page (update same message)
        try {
          const target = parseInt(id.split(':')[1], 10);
          if (Number.isNaN(target)) return interaction.reply({ content: 'Página inválida.', ephemeral: true });
          const fs = require('fs');
          const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
          const dbPath = './data/faq.json';
          if (!fs.existsSync(dbPath)) return interaction.reply({ content: 'Nenhuma FAQ encontrada.', ephemeral: true });
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          const chunkSize = 25;
          const totalPages = Math.max(1, Math.ceil(db.faqs.length / chunkSize));
          const page = Math.max(0, Math.min(target, totalPages - 1));

          const offset = page * chunkSize;
          const slice = db.faqs.slice(offset, offset + chunkSize);
          const embed = new EmbedBuilder().setTitle('FAQs').setTimestamp();
          embed.setDescription('Clique no item do menu abaixo para ver a resposta.');

          const options = slice.map((item, j) => {
            const idx = offset + j;
            const label = `#${idx} — ${item.q.length > 60 ? item.q.slice(0,57) + '...' : item.q}`;
            const description = item.q.length > 100 ? item.q.slice(0,100) + '...' : undefined;
            return { label, value: String(idx), description };
          });

          const select = new StringSelectMenuBuilder()
            .setCustomId(`faq_select:${page}`)
            .setPlaceholder('Selecione a pergunta...')
            .addOptions(options)
            .setMinValues(1)
            .setMaxValues(1);

          const rowQuestions = new ActionRowBuilder().addComponents(select);

          const components = [rowQuestions];
          if (totalPages > 1) {
            const rowNav = new ActionRowBuilder();
            const prev = new ButtonBuilder().setCustomId(`faq_page:${page-1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0);
            const pageBadge = new ButtonBuilder().setCustomId(`faq_page_badge:${page}`).setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
            const next = new ButtonBuilder().setCustomId(`faq_page:${page+1}`).setLabel('Próximo ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages-1);
            rowNav.addComponents(prev, pageBadge, next);
            components.push(rowNav);
          }

          await interaction.update({ embeds: [embed], components });
        } catch (err) {
          console.error('Erro ao processar faq_page:', err);
          if (!interaction.replied) await interaction.reply({ content: 'Erro ao navegar páginas de FAQ.', ephemeral: true });
        }
        return;
      }

      if (id && id.startsWith('faq_show:')) {
        // Reply ephemeral with the answer so only the clicking user sees it.
        try {
          const idx = parseInt(id.split(':')[1], 10);
          const fs = require('fs');
          const { EmbedBuilder } = require('discord.js');
          const dbPath = './data/faq.json';
          if (!fs.existsSync(dbPath)) return interaction.reply({ content: 'Nenhuma FAQ encontrada.', ephemeral: true });
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          const entry = db.faqs[idx];
          if (!entry) return interaction.reply({ content: 'FAQ não encontrada.', ephemeral: true });

          const answer = entry.a.length > 4000 ? entry.a.slice(0, 3997) + '...' : entry.a;
          const embed = new EmbedBuilder().setTitle(entry.q).setDescription(answer).setFooter({ text: 'FAQ (privado)' }).setTimestamp();
          // Use ephemeral reply so only the user sees the answer
          return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
          console.error('Erro ao processar faq_show (ephemeral):', err);
          if (!interaction.replied) await interaction.reply({ content: 'Erro ao recuperar a resposta.', ephemeral: true });
        }
        return;
      }
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
        // footer field was removed from the modal to respect the 5-component limit
        const footer = null;
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
        // Try to refresh the panel message (if available)
        try {
          if (pending.panelChannelId && pending.panelMessageId) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
            const ch = await interaction.client.channels.fetch(pending.panelChannelId).catch(()=>null);
            if (ch && ch.isTextBased()) {
              const msg = await ch.messages.fetch(pending.panelMessageId).catch(()=>null);
              if (msg) {
                const embed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription(pending.containers.length ? pending.containers.map((c,i)=>`#${i+1} — ${c.title||'[sem título]'}`).join('\n\n') : 'Sem containers');
                const makeRows = (key, containers=[]) => {
                  const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`message_remove_last:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`message_upload:${key}`).setLabel('📎 Upload imagem').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
                  );
                  const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
                  );
                  const rows = [row1, row2];
                  if (containers && containers.length) {
                    const opts = containers.slice(0,25).map((c,i)=>({ label: `#${i+1} ${c.title||'[sem título]'}`, value: String(i) }));
                    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`message_select_edit:${key}`).setPlaceholder('Editar container...').addOptions(opts).setMinValues(1).setMaxValues(1)));
                  }
                  return rows;
                };
                await msg.edit({ embeds: [embed], components: makeRows(key, pending.containers) }).catch(()=>{});
              }
            }
          }
        } catch (err) { console.error('Erro ao atualizar painel após adicionar container:', err); }
        // release lock if present
        try { if (interaction.client.messageLocks && interaction.client.messageLocks.has(key)) interaction.client.messageLocks.delete(key); } catch {}
        return interaction.reply({ content: 'Container adicionado ao painel. Use Pré-visualizar ou Enviar.', ephemeral: true });
      }

      // modal for editing a specific container: message_edit_idx:<key>:<index>
      if (id && id.startsWith('message_edit_idx:')) {
        try {
          const parts = id.split(':');
          const key = parts[1];
          const idx = parseInt(parts[2], 10);
          const pending = client.pendingMessages && client.pendingMessages.get(key);
          if (!pending) return interaction.reply({ content: 'Sessão expirada ou inválida.', ephemeral: true });
          if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem iniciou pode submeter este modal.', ephemeral: true });

          if (!pending.containers || idx < 0 || idx >= pending.containers.length) return interaction.reply({ content: 'Container não encontrado.', ephemeral: true });

          const existing = pending.containers[idx] || {};
          const title = interaction.fields.getTextInputValue('c_title') || existing.title || null;
          const description = interaction.fields.getTextInputValue('c_description') || existing.description || null;
          const color = interaction.fields.getTextInputValue('c_color') || existing.color || null;
          const image = interaction.fields.getTextInputValue('c_image') || existing.image || null;
          // footer input removed from modal; keep existing footer if present
          const footer = existing.footer || null;
          const fieldsRaw = (interaction.fields.getTextInputValue('c_fields') || '').trim();
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

          pending.containers[idx] = { title, description, color, image, footer, fields };
          client.pendingMessages.set(key, pending);
          // Try to refresh the panel message (if available)
          try {
            if (pending.panelChannelId && pending.panelMessageId) {
              const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
              const ch = await interaction.client.channels.fetch(pending.panelChannelId).catch(()=>null);
              if (ch && ch.isTextBased()) {
                const msg = await ch.messages.fetch(pending.panelMessageId).catch(()=>null);
                if (msg) {
                  const embed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription(pending.containers.length ? pending.containers.map((c,i)=>`#${i+1} — ${c.title||'[sem título]'}`).join('\n\n') : 'Sem containers');
                  const makeRows = (key, containers=[]) => {
                    const row1 = new ActionRowBuilder().addComponents(
                      new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
                      new ButtonBuilder().setCustomId(`message_remove_last:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
                      new ButtonBuilder().setCustomId(`message_upload:${key}`).setLabel('📎 Upload imagem').setStyle(ButtonStyle.Primary),
                      new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
                    );
                    const row2 = new ActionRowBuilder().addComponents(
                      new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
                      new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
                      new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
                    );
                    const rows = [row1, row2];
                    if (containers && containers.length) {
                      const opts = containers.slice(0,25).map((c,i)=>({ label: `#${i+1} ${c.title||'[sem título]'}`, value: String(i) }));
                      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`message_select_edit:${key}`).setPlaceholder('Editar container...').addOptions(opts).setMinValues(1).setMaxValues(1)));
                    }
                    return rows;
                  };
                  await msg.edit({ embeds: [embed], components: makeRows(key, pending.containers) }).catch(()=>{});
                }
              }
            }
          } catch (err) { console.error('Erro ao atualizar painel após editar container:', err); }
          try { if (interaction.client.messageLocks && interaction.client.messageLocks.has(key)) interaction.client.messageLocks.delete(key); } catch {}
          return interaction.reply({ content: `Container #${idx+1} atualizado.`, ephemeral: true });
        } catch (err) {
          console.error('Erro em message_edit_idx submit:', err);
          if (!interaction.replied) await interaction.reply({ content: 'Erro ao atualizar container.', ephemeral: true });
        }
      }

      if (id && id.startsWith('message_edit:')) {
        const key = id.split(':')[1];
        const pending = client.pendingMessages && client.pendingMessages.get(key);
        if (!pending) return interaction.reply({ content: 'Sessão expirada ou inválida.', ephemeral: true });
        if (interaction.user.id !== pending.authorId) return interaction.reply({ content: 'Apenas quem iniciou pode submeter este modal.', ephemeral: true });

        if (!pending.containers || pending.containers.length === 0) {
          try { if (interaction.client.messageLocks && interaction.client.messageLocks.has(key)) interaction.client.messageLocks.delete(key); } catch {}
          return interaction.reply({ content: 'Nenhum container para editar.', ephemeral: true });
        }

        const lastIndex = pending.containers.length - 1;
        const existing = pending.containers[lastIndex] || {};

        const title = interaction.fields.getTextInputValue('c_title') || existing.title || null;
        const description = interaction.fields.getTextInputValue('c_description') || existing.description || null;
        const color = interaction.fields.getTextInputValue('c_color') || existing.color || null;
        const image = interaction.fields.getTextInputValue('c_image') || existing.image || null;
  // footer input was removed from the modal to respect component limits
  const footer = existing.footer || null;
        const fieldsRaw = (interaction.fields.getTextInputValue('c_fields') || '').trim();
        const fields = [];
        if (fieldsRaw.length > 0) {
          const lines = fieldsRaw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
          for (const ln of lines) {
            const parts = ln.split('|');
            if (parts.length >= 2) fields.push({ name: parts[0].trim(), value: parts.slice(1).join('|').trim() });
          }
        } else {
          // keep existing fields if user didn't provide new
          if (existing.fields) for (const f of existing.fields) fields.push(f);
        }

        pending.containers[lastIndex] = { title, description, color, image, footer, fields };
        client.pendingMessages.set(key, pending);
        // Try to refresh panel message
        try {
          if (pending.panelChannelId && pending.panelMessageId) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
            const ch = await interaction.client.channels.fetch(pending.panelChannelId).catch(()=>null);
            if (ch && ch.isTextBased()) {
              const msg = await ch.messages.fetch(pending.panelMessageId).catch(()=>null);
              if (msg) {
                const embed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription(pending.containers.length ? pending.containers.map((c,i)=>`#${i+1} — ${c.title||'[sem título]'}`).join('\n\n') : 'Sem containers');
                const makeRows = (key, containers=[]) => {
                  const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`message_remove_last:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`message_upload:${key}`).setLabel('📎 Upload imagem').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
                  );
                  const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
                  );
                  const rows = [row1, row2];
                  if (containers && containers.length) {
                    const opts = containers.slice(0,25).map((c,i)=>({ label: `#${i+1} ${c.title||'[sem título]'}`, value: String(i) }));
                    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`message_select_edit:${key}`).setPlaceholder('Editar container...').addOptions(opts).setMinValues(1).setMaxValues(1)));
                  }
                  return rows;
                };
                await msg.edit({ embeds: [embed], components: makeRows(key, pending.containers) }).catch(()=>{});
              }
            }
          }
        } catch (err) { console.error('Erro ao atualizar painel após editar último container:', err); }
        try { if (interaction.client.messageLocks && interaction.client.messageLocks.has(key)) interaction.client.messageLocks.delete(key); } catch {}
        return interaction.reply({ content: 'Container atualizado.', ephemeral: true });
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
