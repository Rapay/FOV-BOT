module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    const client = interaction.client;

    // Handle select menus for FAQ publish pages (customId: faq_select:<page>)
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      try {
        if (id && id.startsWith('faq_select:')) {
          // When a published FAQ select is used, update the original message with the selected answer
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
          const embed = new EmbedBuilder().setTitle(entry.q).setDescription(answer).setFooter({ text: 'FAQ' }).setTimestamp();
          // Update the original published message so switching selection replaces the previous answer
          try {
            await interaction.update({ embeds: [embed], components: interaction.message.components });
          } catch (err) {
            // fallback to ephemeral if update fails
            return interaction.reply({ embeds: [embed], ephemeral: true });
          }
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

      // Message buttons that trigger configured webhooks
      if (id && id.startsWith('message_button_webhook:')) {
        try {
          const parts = id.split(':');
          // customId format: message_button_webhook:<sessionId>:<buttonIdx>
          const sessionKey = `${parts[1]}:${parts[2]}`;
          const hooks = client.messageButtonHooks;
          console.log(`[message_button] clicked sessionKey=${sessionKey}`);
          if (!hooks || !hooks.has(sessionKey)) {
            console.log('[message_button] no hook mapping found for', sessionKey);
            try {
              if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: 'Ação não configurada ou expirada.', ephemeral: true });
            } catch (e) { console.error('[message_button] reply failed', e); }
            return;
          }
          const stored = hooks.get(sessionKey);
          if (!stored) {
            try {
              if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: 'Ação inválida.', ephemeral: true });
            } catch (e) { console.error('[message_button] reply failed', e); }
            return;
          }

          // Debug: log stored hook value
          try { console.log('[message_button] stored hook:', JSON.stringify(stored)); } catch (e) { console.log('[message_button] stored hook (raw):', stored); }

          // Acknowledge the interaction quickly to avoid "This interaction failed".
          let acknowledged = false;
          try {
            if (!interaction.deferred && !interaction.replied) {
              await interaction.deferReply({ ephemeral: true });
              acknowledged = true;
            }
          } catch (e) {
            console.error('[message_button] deferReply failed', e);
            // Try deferUpdate as a lighter-weight ack for component interactions
            try {
              if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
                acknowledged = true;
              }
            } catch (e2) {
              console.error('[message_button] deferUpdate also failed', e2);
            }
          }

          // If stored is a string, treat it as a webhook URL (legacy)
          if (typeof stored === 'string') {
            try {
              const { URL } = require('url');
              const https = require('https');
              const parsed = new URL(stored);
              const payload = JSON.stringify({ userId: interaction.user.id, userTag: interaction.user.tag, messageId: interaction.message.id, channelId: interaction.channelId, guildId: interaction.guildId });
              const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
              const req = https.request(parsed, options, res => {
                // ignore response body
              });
              req.on('error', e => { console.error('Erro ao chamar webhook:', e); });
              req.write(payload);
              req.end();
            } catch (err) {
              console.error('Erro ao executar webhook:', err);
              // Try to inform the user via editReply -> followUp -> channel send
              try { if (acknowledged) return await interaction.editReply({ content: 'Falha ao executar a ação do webhook.' }); } catch (e) { console.error('[message_button] editReply failed', e); }
              try { return await interaction.followUp({ content: 'Falha ao executar a ação do webhook.', ephemeral: true }); } catch (e) { console.error('[message_button] followUp failed', e); }
            }
            try { if (acknowledged) return await interaction.editReply({ content: 'Ação executada (webhook acionado).' }); } catch (e) { console.error('[message_button] editReply failed', e); }
            try { return await interaction.followUp({ content: 'Ação executada (webhook acionado).', ephemeral: true }); } catch (e) { console.error('[message_button] followUp failed', e); }
          }

          // If stored is an object indicating a url_proxy, reply ephemeral with a Link button
          if (stored && stored.type === 'url_proxy' && stored.url) {
            try {
              console.log('[message_button] url_proxy click, sending ephemeral link');
              const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
              const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Abrir link').setStyle(ButtonStyle.Link).setURL(stored.url));

              // Try to edit the deferred reply first (fastest, keeps it ephemeral)
              try {
                if (acknowledged) return await interaction.editReply({ content: 'Clique para abrir o link:', components: [row] });
              } catch (e) {
                console.error('[message_button] editReply failed', e);
              }

              // fallback to followUp (ephemeral)
              try {
                return await interaction.followUp({ content: 'Clique para abrir o link:', components: [row], ephemeral: true });
              } catch (ee) {
                console.error('[message_button] followUp failed', ee);
              }

              // As a last resort, try to acknowledge via deferUpdate then followUp
              try {
                await interaction.deferUpdate();
                return await interaction.followUp({ content: 'Clique para abrir o link:', components: [row], ephemeral: true });
              } catch (eee) {
                console.error('[message_button] fallback deferUpdate+followUp failed', eee);
              }
            } catch (err) {
              console.error('Erro ao criar resposta de url_proxy:', err);
              try { if (acknowledged) return await interaction.editReply({ content: 'Falha ao abrir link.' }); } catch (e) { console.error('[message_button] editReply failed', e); }
              try { return await interaction.followUp({ content: 'Falha ao abrir link.', ephemeral: true }); } catch (e) { console.error('[message_button] followUp failed', e); }
            }
          }
            try { if (acknowledged) return await interaction.editReply({ content: 'Ação não suportada.' }); } catch (e) { console.error('[message_button] editReply failed', e); }
            try { return await interaction.followUp({ content: 'Ação não suportada.', ephemeral: true }); } catch (e) { console.error('[message_button] followUp failed', e); }
        } catch (err) {
          console.error('Erro ao processar message_button_webhook:', err);
          if (!interaction.replied) try { await interaction.reply({ content: 'Erro ao processar ação.', ephemeral: true }); } catch (e) { console.error('[message_button] final reply failed', e); }
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
