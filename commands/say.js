const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Faz o bot enviar texto cru (preserva marcação do Discord como spoilers, negrito, etc.)')
  .addStringOption(o => o.setName('content').setDescription('Texto a ser enviado pelo bot').setRequired(false))
  .addChannelOption(o => o.setName('channel').setDescription('Canal para enviar a mensagem (opcional)').setRequired(false))
  .addBooleanOption(o => o.setName('ephemeral').setDescription('Responder ao autor de forma efêmera indicando envio?').setRequired(false)),

  async execute(interaction) {
    // Restrict usage to staff: ManageMessages or Administrator
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
    }

  const contentOpt = interaction.options.getString('content');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    const ephemeral = interaction.options.getBoolean('ephemeral') || false;

    if (!target || !target.isTextBased()) return interaction.reply({ content: 'Canal alvo inválido.', ephemeral: true });

    // helper to split long messages into <=2000-char chunks, preserving line breaks where possible
    function splitMessage(text, limit = 2000) {
      if (!text) return [];
      if (text.length <= limit) return [text];
      const lines = text.split('\n');
      const chunks = [];
      let cur = '';
      for (const line of lines) {
        const add = (cur.length === 0) ? line : '\n' + line;
        if ((cur.length + add.length) <= limit) {
          cur += add;
        } else {
          if (cur.length > 0) chunks.push(cur);
          if (line.length > limit) {
            // line itself too long: split by substrings
            for (let i = 0; i < line.length; i += limit) {
              chunks.push(line.slice(i, i + limit));
            }
            cur = '';
          } else {
            cur = line;
          }
        }
      }
      if (cur.length > 0) chunks.push(cur);
      return chunks;
    }

    // Always show a modal to collect the message content (so multi-line input is consistent)
    let content = contentOpt;
    const sid = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
  // will store role IDs selected to replace {role} placeholders (keeps mention control)
  let roleIdsSelected = null;
    const modal = new ModalBuilder().setCustomId('say_modal').setTitle('Conteúdo (multi-linha)');
    const input = new TextInputBuilder().setCustomId('say_content').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Escreva sua mensagem (linhas e mais de uma linha são suportadas)...');
    // If the user provided a content option, attempt to prefill the modal input when supported
    if (contentOpt && typeof input.setValue === 'function') {
      try { input.setValue(contentOpt); } catch (e) { /* ignore if not supported */ }
    }
    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);
    try {
      await interaction.showModal(modal);
      const submitted = await interaction.awaitModalSubmit({ time: 5*60*1000, filter: (m) => m.user.id === interaction.user.id });
      content = submitted.fields.getTextInputValue('say_content');

      // If user included {role} placeholders, ask them to pick roles (can pick multiple to fill multiple placeholders)
      const placeholders = (content.match(/\{role\}/gi) || []).length;
      if (placeholders > 0) {
        // create a RoleSelect menu allowing selecting exactly 'placeholders' roles
  // require the user to select exactly the number of placeholders (capped to 25)
  const selectCount = Math.min(placeholders, 25);
  const roleSelect = new RoleSelectMenuBuilder().setCustomId(`say_role_select:${placeholders}`).setPlaceholder('Selecione os cargos para substituir {role} (ordem importa)').setMinValues(selectCount).setMaxValues(selectCount);
        const row = new ActionRowBuilder().addComponents(roleSelect);
        const prompt = await submitted.reply({ content: `Encontrei ${placeholders} placeholder(s) {role}. Selecione ${placeholders} cargo(s) na ordem em que quer que substituam os placeholders.`, components: [row], ephemeral: true, fetchReply: true });

        const coll = prompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 5*60*1000 });
        const sel = await new Promise((resolve) => {
          coll.on('collect', async selI => {
            try {
              // Try to update the prompt immediately to close the select UI (remove components)
              try { await selI.update({ content: 'Seleção recebida — aplicando cargos...', components: [] }); } catch (updErr) {
                // fallback to deferUpdate if update isn't possible
                try { await selI.deferUpdate(); } catch (dErr) { console.error('[say] failed to ack role select', dErr); }
              }
            } catch (e) { console.error('[say] role select collect handler error', e); }
            resolve(selI);
          });
          coll.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
        });
        if (!sel) { await submitted.followUp({ content: 'Nenhum cargo selecionado — cancelando.', ephemeral: true }); return; }
        // extract role IDs robustly: RoleSelect interactions may expose a .values array or a .roles cache
        let roleIds = [];
        try {
          if (Array.isArray(sel.values) && sel.values.length > 0) roleIds = sel.values.slice(0);
          else if (sel.roles && typeof sel.roles === 'object') {
            // sel.roles can be a Collection
            try { roleIds = Array.from(sel.roles.values()).map(r => (r && r.id) ? r.id : String(r)); } catch (_) { roleIds = [] ; }
          }
        } catch (ex) { console.error('[say] failed to extract role ids from select interaction', ex); roleIds = []; }
  console.log('[say] role select chosen ids:', roleIds);
        // store selected role IDs for allowedMentions later
        roleIdsSelected = roleIds;
        // replace each {role} occurrence with corresponding selected role mention
        let idx = 0;
        content = content.replace(/\{role\}/gi, () => { const rid = roleIds[idx++] || ''; return rid ? `<@&${rid}>` : '{role}'; });
  try { await submitted.followUp({ content: 'Cargos aplicados no texto. Enviando...', ephemeral: true }); } catch (e) { console.error('[say] failed to followUp after role apply', e); }
  console.log('[say] content after role replacement:', content.slice(0, 300));
      } else {
        await submitted.reply({ content: 'Recebido — enviando...', ephemeral: true });
      }

      // If user included {emoji} placeholders, offer a select of bot-accessible emojis and a manual paste fallback
  const emojiPlaceholders = (content.match(/\{emoji\}/gi) || []).length;
  console.log('[say] emojiPlaceholders count:', emojiPlaceholders);
      if (emojiPlaceholders > 0) {
        // build select options from emojis in the target guild (Option A)
        // fallback to client cache if target guild has no emojis or is a DM
        let allEmojis = [];
        try {
          if (target && target.guild && target.guild.emojis) {
            allEmojis = Array.from(target.guild.emojis.cache.values()).slice(0, 25);
          }
        } catch (e) { allEmojis = []; }
        if (!allEmojis || allEmojis.length === 0) allEmojis = Array.from(interaction.client.emojis.cache.values()).slice(0, 25);

        // If no guild/client emojis available, immediately prompt manual paste fallback
        if (!allEmojis || allEmojis.length === 0) {
          try {
            await submitted.followUp({ content: 'Nenhum emoji customizado disponível para seleção. Por favor cole os emojis (um por linha) ou IDs manualmente.', ephemeral: true, fetchReply: true });
            await submitted.showModal(new ModalBuilder().setCustomId(`modal_say_emoji_manual:${sid}`).setTitle('Forneça os emojis').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji_list').setLabel('Cole aqui os emojis (um por linha)').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('<a:seta:851206127471034378>\n851206127471034378'))));
            const res = await submitted.awaitModalSubmit({ time: 5*60*1000, filter: m => m.user.id === interaction.user.id });
            const lines = (res.fields.getTextInputValue('emoji_list') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            const replacements = [];
            for (const line of lines.slice(0, emojiPlaceholders)) {
              const m = line.match(/<(a)?:[A-Za-z0-9_]+:(\d+)>/);
              if (m) { replacements.push({ markup: m[0], id: m[2], animated: !!m[1] }); continue; }
              const idm = line.match(/^(\d+)$/);
              if (idm) { replacements.push({ markup: `<:e:${idm[1]}>`, id: idm[1], animated: false }); continue; }
              const any = line.match(/(\d{17,20})/);
              if (any) { replacements.push({ markup: `<:e:${any[1]}>`, id: any[1], animated: false }); continue; }
            }
            let ri = 0;
            content = content.replace(/\{emoji\}/gi, () => { const r = replacements[ri++]; return r ? r.markup : ''; });
            await res.reply({ content: 'Emojis aplicados no texto (manual).', ephemeral: true });
          } catch (err) {
            console.error('emoji manual fallback error', err);
            await submitted.followUp({ content: 'Falha ao processar emojis manualmente; placeholders removidos.', ephemeral: true });
            content = content.replace(/\{emoji\}/gi, '');
          }
        } else {
        const options = allEmojis.map(e => ({ label: e.name || e.id, value: e.id, description: `ID: ${e.id}`, emoji: { id: e.id, name: e.name, animated: e.animated } }));
        // We'll ask for one emoji at a time so the user can pick the same emoji multiple times if needed.
        const select = new StringSelectMenuBuilder()
          .setCustomId(`say_emoji_select:${sid}`)
          .setPlaceholder('Selecione um emoji (será pedido N vezes)')
          .addOptions(options)
          .setMinValues(1)
          .setMaxValues(1);
        const manualBtn = new ButtonBuilder().setCustomId(`say_fill_emoji:${sid}`).setLabel('Colar IDs/manual').setStyle(ButtonStyle.Secondary);
  const progressBtn = new ButtonBuilder().setCustomId(`say_progress:${sid}`).setLabel(`0/${emojiPlaceholders}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
  const progressRow = new ActionRowBuilder().addComponents(progressBtn);
  const prompt = await submitted.followUp({ content: `Encontrei ${emojiPlaceholders} placeholder(s) {emoji}. Você será solicitado a selecionar ${emojiPlaceholders} emoji(s), um por vez. Ou clique em "Colar IDs/manual" para inserir markups/IDs manualmente.`, components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(manualBtn), progressRow], ephemeral: true, fetchReply: true });
        
        // iterative selection flow: allow picking the same emoji multiple times (one-by-one)
        const chosen = [];
        let currentPrompt = prompt;
        let aborted = false;
        for (let slot = 0; slot < emojiPlaceholders; slot++) {
          try {
            // create a collector for a single selection or manual paste
            const coll = currentPrompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 5*60*1000 });
            const sel = await new Promise((resolve) => {
              coll.on('collect', async selI => { resolve(selI); });
              coll.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
            });
            if (!sel) { aborted = true; break; }
              if (sel.customId && sel.customId.startsWith('say_emoji_select:')) {
              try { await sel.deferUpdate(); } catch {};
              const id = (sel.values && sel.values[0]) || null;
              if (!id) { aborted = true; break; }
              chosen.push(id);
              // update prompt to show progress
              try {
                const prog = new ButtonBuilder().setCustomId(`say_progress:${sid}`).setLabel(`${chosen.length}/${emojiPlaceholders}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
                const progRow = new ActionRowBuilder().addComponents(prog);
                await sel.editReply({ content: `Selecionado ${chosen.length}/${emojiPlaceholders}. Selecione o próximo emoji (ou cancele).`, components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(manualBtn), progRow] });
                currentPrompt = await interaction.client.channels.fetch(submitted.channelId).then(ch => ch.messages.fetch(sel.message.id)).catch(()=>currentPrompt);
              } catch (e) { /* ignore */ }
              // continue to next slot
            } else if (sel.customId && sel.customId.startsWith('say_fill_emoji:')) {
              // manual paste fallback (open modal) — collect enough replacements and break
              try {
                await sel.showModal(new ModalBuilder().setCustomId(`modal_say_emoji:${sid}`).setTitle('Forneça os emojis').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji_list').setLabel('Cole aqui os emojis (um por linha)').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('<a:seta:851206127471034378>\n851206127471034378'))));
                const res = await sel.awaitModalSubmit({ time: 5*60*1000, filter: m => m.user.id === interaction.user.id });
                const lines = (res.fields.getTextInputValue('emoji_list') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                const replacements = [];
                for (const line of lines.slice(0, emojiPlaceholders)) {
                  const m = line.match(/<(a)?:[A-Za-z0-9_]+:(\d+)>/);
                  if (m) { replacements.push({ markup: m[0], id: m[2], animated: !!m[1] }); continue; }
                  const idm = line.match(/^(\d+)$/);
                  if (idm) { replacements.push({ markup: `<:e:${idm[1]}>`, id: idm[1], animated: false }); continue; }
                  const any = line.match(/(\d{17,20})/);
                  if (any) { replacements.push({ markup: `<:e:${any[1]}>`, id: any[1], animated: false }); continue; }
                }
                // apply replacements directly and skip iterative loop
                let ri = 0;
                content = content.replace(/\{emoji\}/gi, () => { const r = replacements[ri++]; return r ? r.markup : ''; });
                await res.reply({ content: 'Emojis aplicados no texto.', ephemeral: true });
                // mark done
                chosen.length = emojiPlaceholders; // signal completion
                break;
              } catch (err) { console.error('emoji modal error', err); await submitted.followUp({ content: 'Erro ao processar emojis; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); aborted = true; break; }
            } else {
              aborted = true; break;
            }
          } catch (err) { console.error('emoji selection error', err); await submitted.followUp({ content: 'Erro ao processar seleção de emojis; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); aborted = true; break; }
        }

        if (aborted || chosen.length === 0) {
          await submitted.followUp({ content: 'Nenhum emoji fornecido — placeholders {emoji} serão removidos.', ephemeral: true });
          content = content.replace(/\{emoji\}/gi, '');
        } else if (chosen.length > 0 && chosen.length < emojiPlaceholders) {
          // partial selection: remove placeholders
          await submitted.followUp({ content: 'Seleção incompleta — placeholders {emoji} serão removidos.', ephemeral: true });
          content = content.replace(/\{emoji\}/gi, '');
        } else if (chosen.length === emojiPlaceholders) {
          // Ask for final confirmation before applying chosen emojis
          try {
            console.log('[say] emoji selector chosen ids (iterative):', chosen);
            const confirmBtn = new ButtonBuilder().setCustomId(`say_emoji_confirm:${sid}`).setLabel('Confirmar').setStyle(ButtonStyle.Success);
            const cancelBtn = new ButtonBuilder().setCustomId(`say_emoji_cancel:${sid}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger);
            const confirmPrompt = await submitted.followUp({ content: `Você selecionou ${chosen.length} emoji(s). Confirme para aplicar.`, components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)], ephemeral: true, fetchReply: true });
            const confColl = confirmPrompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 2*60*1000 });
            const conf = await new Promise((resolve) => {
              confColl.on('collect', async ci => { try { await ci.deferUpdate(); } catch {} resolve(ci); });
              confColl.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
            });
            if (!conf) { await submitted.followUp({ content: 'Nenhuma confirmação recebida — placeholders {emoji} serão removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
            else if (conf.customId && conf.customId.startsWith('say_emoji_confirm:')) {
              // apply chosen emojis inline
              let ri = 0;
              content = content.replace(/\{emoji\}/gi, () => {
                const id = chosen[ri++];
                const em = interaction.client.emojis.cache.get(id);
                if (em) return `${em.animated ? '<a:' : '<:'}${em.name}:${em.id}>`;
                return '';
              });
              await submitted.followUp({ content: 'Emojis aplicados.', ephemeral: true });
            } else { await submitted.followUp({ content: 'Operação cancelada — placeholders {emoji} serão removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
          } catch (err) { console.error('emoji selection confirm error', err); await submitted.followUp({ content: 'Erro ao processar confirmação; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
        }
        }

        // iterative selection flow: allow picking the same emoji multiple times (one-by-one)
        const chosen = [];
        let currentPrompt = prompt;
        let aborted = false;
        for (let slot = 0; slot < emojiPlaceholders; slot++) {
          try {
            // create a collector for a single selection or manual paste
            const coll = currentPrompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 5*60*1000 });
            const sel = await new Promise((resolve) => {
              coll.on('collect', async selI => { resolve(selI); });
              coll.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
            });
            if (!sel) { aborted = true; break; }
              if (sel.customId && sel.customId.startsWith('say_emoji_select:')) {
              try { await sel.deferUpdate(); } catch {};
              const id = (sel.values && sel.values[0]) || null;
              if (!id) { aborted = true; break; }
              chosen.push(id);
              // update prompt to show progress
              try {
                const prog = new ButtonBuilder().setCustomId(`say_progress:${sid}`).setLabel(`${chosen.length}/${emojiPlaceholders}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
                const progRow = new ActionRowBuilder().addComponents(prog);
                await sel.editReply({ content: `Selecionado ${chosen.length}/${emojiPlaceholders}. Selecione o próximo emoji (ou cancele).`, components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(manualBtn), progRow] });
                currentPrompt = await interaction.client.channels.fetch(submitted.channelId).then(ch => ch.messages.fetch(sel.message.id)).catch(()=>currentPrompt);
              } catch (e) { /* ignore */ }
              // continue to next slot
            } else if (sel.customId && sel.customId.startsWith('say_fill_emoji:')) {
              // manual paste fallback (open modal) — collect enough replacements and break
              try {
                await sel.showModal(new ModalBuilder().setCustomId(`modal_say_emoji:${sid}`).setTitle('Forneça os emojis').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji_list').setLabel('Cole aqui os emojis (um por linha)').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('<a:seta:851206127471034378>\n851206127471034378'))));
                const res = await sel.awaitModalSubmit({ time: 5*60*1000, filter: m => m.user.id === interaction.user.id });
                const lines = (res.fields.getTextInputValue('emoji_list') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                const replacements = [];
                for (const line of lines.slice(0, emojiPlaceholders)) {
                  const m = line.match(/<(a)?:[A-Za-z0-9_]+:(\d+)>/);
                  if (m) { replacements.push({ markup: m[0], id: m[2], animated: !!m[1] }); continue; }
                  const idm = line.match(/^(\d+)$/);
                  if (idm) { replacements.push({ markup: `<:e:${idm[1]}>`, id: idm[1], animated: false }); continue; }
                  const any = line.match(/(\d{17,20})/);
                  if (any) { replacements.push({ markup: `<:e:${any[1]}>`, id: any[1], animated: false }); continue; }
                }
                // apply replacements directly and skip iterative loop
                let ri = 0;
                content = content.replace(/\{emoji\}/gi, () => { const r = replacements[ri++]; return r ? r.markup : ''; });
                await res.reply({ content: 'Emojis aplicados no texto.', ephemeral: true });
                // mark done
                chosen.length = emojiPlaceholders; // signal completion
                break;
              } catch (err) { console.error('emoji modal error', err); await submitted.followUp({ content: 'Erro ao processar emojis; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); aborted = true; break; }
            } else {
              aborted = true; break;
            }
          } catch (err) { console.error('emoji selection error', err); await submitted.followUp({ content: 'Erro ao processar seleção de emojis; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); aborted = true; break; }
        }

        if (aborted || chosen.length === 0) {
          await submitted.followUp({ content: 'Nenhum emoji fornecido — placeholders {emoji} serão removidos.', ephemeral: true });
          content = content.replace(/\{emoji\}/gi, '');
        } else if (chosen.length > 0 && chosen.length < emojiPlaceholders) {
          // partial selection: remove placeholders
          await submitted.followUp({ content: 'Seleção incompleta — placeholders {emoji} serão removidos.', ephemeral: true });
          content = content.replace(/\{emoji\}/gi, '');
        } else if (chosen.length === emojiPlaceholders) {
          // Ask for final confirmation before applying chosen emojis
          try {
            console.log('[say] emoji selector chosen ids (iterative):', chosen);
            const confirmBtn = new ButtonBuilder().setCustomId(`say_emoji_confirm:${sid}`).setLabel('Confirmar').setStyle(ButtonStyle.Success);
            const cancelBtn = new ButtonBuilder().setCustomId(`say_emoji_cancel:${sid}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger);
            const confirmPrompt = await submitted.followUp({ content: `Você selecionou ${chosen.length} emoji(s). Confirme para aplicar.`, components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)], ephemeral: true, fetchReply: true });
            const confColl = confirmPrompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 2*60*1000 });
            const conf = await new Promise((resolve) => {
              confColl.on('collect', async ci => { try { await ci.deferUpdate(); } catch {} resolve(ci); });
              confColl.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
            });
            if (!conf) { await submitted.followUp({ content: 'Nenhuma confirmação recebida — placeholders {emoji} serão removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
            else if (conf.customId && conf.customId.startsWith('say_emoji_confirm:')) {
              // apply chosen emojis inline
              let ri = 0;
              content = content.replace(/\{emoji\}/gi, () => {
                const id = chosen[ri++];
                const em = interaction.client.emojis.cache.get(id);
                if (em) return `${em.animated ? '<a:' : '<:'}${em.name}:${em.id}>`;
                return '';
              });
              await submitted.followUp({ content: 'Emojis aplicados.', ephemeral: true });
            } else { await submitted.followUp({ content: 'Operação cancelada — placeholders {emoji} serão removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
          } catch (err) { console.error('emoji selection confirm error', err); await submitted.followUp({ content: 'Erro ao processar confirmação; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
        }
      }
    } catch (err) {
      console.error('Modal say error', err);
      return; // user probably closed modal or timeout
    }

    if (!content || content.trim().length === 0) return interaction.reply({ content: 'Conteúdo vazio não permitido.', ephemeral: true });

    // === handle custom emojis that the bot cannot use directly ===
    // find all custom emoji markups like <:name:id> or <a:name:id>
    const emojiRegex = /<(a)?:[A-Za-z0-9_]+:(\d+)>/g;
    let emMatch;
    const foundEmojis = new Map(); // id -> { animated }
    while ((emMatch = emojiRegex.exec(content)) !== null) {
      const animated = !!emMatch[1];
      const id = emMatch[2];
      if (!foundEmojis.has(id)) foundEmojis.set(id, { animated });
    }

    const missingEmojiImages = []; // array of {id, animated}
    for (const [id, info] of foundEmojis.entries()) {
      // Determine accessibility without relying on fetch(): prefer cache + guild membership.
      let accessible = false;
      try {
        const cached = interaction.client.emojis.cache.get(id);
        if (cached) {
          // If the emoji's guildId is the same as the target guild, or the bot is a member of the emoji's guild,
          // then the bot can use the emoji inline.
          const emojiGuildId = cached.guildId || (cached.guild ? cached.guild.id : null);
          if (!emojiGuildId) {
            // no guildId (rare) — conservatively treat as inaccessible
            accessible = false;
          } else if (target && target.guild && target.guild.id === emojiGuildId) {
            accessible = true;
          } else if (interaction.client.guilds.cache.has(emojiGuildId)) {
            accessible = true;
          } else {
            accessible = false;
          }
        } else {
          // not in cache: assume inaccessible (we avoid fetching here to prevent transient failures)
          accessible = false;
        }
      } catch (e) {
        accessible = false;
      }
      if (!accessible) {
        const markupRe = new RegExp(`<a?:[A-Za-z0-9_]+:${id}>`, 'g');
        content = content.replace(markupRe, '');
        missingEmojiImages.push({ id, animated: info.animated });
      }
    }

    try {
      // Prepare the message parts but do NOT send yet — ask the user to confirm first
      const parts = splitMessage(content, 2000);
      const allowedMentions = roleIdsSelected && roleIdsSelected.length > 0 ? { roles: roleIdsSelected } : { parse: ['users', 'roles', 'everyone'] };

      // Build an informational reply explaining what will happen and show Confirm/Cancel
      let info = `Pronto para enviar em ${target}${parts.length > 1 ? ` (dividida em ${parts.length} partes)` : ''}`;
      if (missingEmojiImages.length > 0) {
        const idsList = missingEmojiImages.map(m => `${m.id}${m.animated ? ' (animado)' : ''}`).join(', ');
        info += `\n\nAviso: os seguintes emojis foram removidos por não estarem acessíveis: ${idsList}.`;
      }
      info += '\n\nClique em **Enviar** para confirmar ou **Cancelar** para abortar.';

      const confirmBtn = new ButtonBuilder().setCustomId(`say_send:${sid}`).setLabel('Enviar').setStyle(ButtonStyle.Success);
      const cancelBtn = new ButtonBuilder().setCustomId(`say_cancel:${sid}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger);
      const confirmPrompt = await interaction.reply({ content: info, components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)], ephemeral: true, fetchReply: true });

      // Collector for the final confirmation
      const confColl = confirmPrompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 2*60*1000 });
      const conf = await new Promise((resolve) => {
        confColl.on('collect', async ci => {
          try { await ci.deferUpdate(); } catch (e) { try { await ci.deferUpdate(); } catch(_){} }
          resolve(ci);
        });
        confColl.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
      });

      if (!conf) {
        try { await interaction.followUp({ content: 'Nenhuma confirmação recebida — operação cancelada.', ephemeral: true }); } catch (e) { console.error('failed to followUp after no confirm', e); }
        try { await confirmPrompt.edit({ components: [] }); } catch {}
        return;
      }

      if (conf.customId && conf.customId.startsWith('say_cancel:')) {
        try { await interaction.followUp({ content: 'Envio cancelado pelo usuário.', ephemeral: true }); } catch (e) { console.error('failed followUp on cancel', e); }
        try { await confirmPrompt.edit({ components: [] }); } catch {}
        return;
      }

      if (conf.customId && conf.customId.startsWith('say_send:')) {
        // User confirmed: send all parts now
        const sendErrors = [];
        for (let idx = 0; idx < parts.length; idx++) {
          const p = parts[idx];
          try {
            console.log(`[say] sending part ${idx+1}/${parts.length} to ${target.id} (allowedMentions=${JSON.stringify(allowedMentions)})`);
            await target.send({ content: p, allowedMentions });
          } catch (e) {
            console.error('[say] failed to send part', idx, e);
            sendErrors.push({ idx, error: String(e) });
          }
        }

        // Build result message
        let resultText = `Mensagem enviada em ${target}${parts.length > 1 ? ` (dividida em ${parts.length} partes)` : ''}`;
        if (sendErrors && sendErrors.length > 0) {
          const errList = sendErrors.map(s => `parte ${s.idx+1}: ${s.error}`).join('; ');
          resultText += `\n\nAviso: falha ao enviar algumas partes: ${errList}`;
        }
        if (missingEmojiImages.length > 0) {
          const idsList = missingEmojiImages.map(m => `${m.id}${m.animated ? ' (animado)' : ''}`).join(', ');
          resultText += `\n\nOs seguintes emojis não puderam ser usados inline e foram removidos: ${idsList}.`;
        }

        try {
          await interaction.followUp({ content: resultText, ephemeral: true });
        } catch (e) {
          console.error('Erro ao responder interação /say após envio:', e);
          try { await interaction.user.send({ content: resultText }); } catch (ee) { /* ignore */ }
        }
        try { await confirmPrompt.edit({ components: [] }); } catch {}
        return;
      }
    } catch (err) {
      console.error('Erro em /say (confirm flow):', err);
      return interaction.reply({ content: 'Falha ao preparar/envio da mensagem (verifique permissões do bot).', ephemeral: true });
    }
  }
};
