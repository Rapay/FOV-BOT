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
        const roleSelect = new RoleSelectMenuBuilder().setCustomId(`say_role_select:${placeholders}`).setPlaceholder('Selecione os cargos para substituir {role} (ordem importa)').setMinValues(1).setMaxValues(Math.min(placeholders, 25));
        const row = new ActionRowBuilder().addComponents(roleSelect);
        const prompt = await submitted.reply({ content: `Encontrei ${placeholders} placeholder(s) {role}. Selecione ${placeholders} cargo(s) na ordem em que quer que substituam os placeholders.`, components: [row], ephemeral: true, fetchReply: true });

        const coll = prompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 5*60*1000 });
        const sel = await new Promise((resolve) => {
          coll.on('collect', async selI => { try { await selI.deferUpdate(); } catch {} resolve(selI); });
          coll.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
        });
        if (!sel) { await submitted.followUp({ content: 'Nenhum cargo selecionado — cancelando.', ephemeral: true }); return; }
  const roleIds = sel.values || [];
  // store selected role IDs for allowedMentions later
  roleIdsSelected = roleIds;
  // replace each {role} occurrence with corresponding selected role mention
  let idx = 0;
  content = content.replace(/\{role\}/gi, () => { const rid = roleIds[idx++] || ''; return rid ? `<@&${rid}>` : '{role}'; });
        await submitted.followUp({ content: 'Cargos aplicados no texto. Enviando...', ephemeral: true });
      } else {
        await submitted.reply({ content: 'Recebido — enviando...', ephemeral: true });
      }

      // If user included {emoji} placeholders, offer a select of bot-accessible emojis and a manual paste fallback
      const emojiPlaceholders = (content.match(/\{emoji\}/gi) || []).length;
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
        const options = allEmojis.map(e => ({ label: e.name || e.id, value: e.id, description: `ID: ${e.id}`, emoji: { id: e.id, name: e.name, animated: e.animated } }));
        const select = new StringSelectMenuBuilder().setCustomId(`say_emoji_select:${sid}`).setPlaceholder('Selecione emojis disponíveis...').addOptions(options).setMinValues(Math.min(emojiPlaceholders, options.length)).setMaxValues(Math.min(emojiPlaceholders, options.length));
        const manualBtn = new ButtonBuilder().setCustomId(`say_fill_emoji:${sid}`).setLabel('Colar IDs/manual').setStyle(ButtonStyle.Secondary);
        const prompt = await submitted.followUp({ content: `Encontrei ${emojiPlaceholders} placeholder(s) {emoji}. Selecione ${emojiPlaceholders} emoji(s) na lista OR clique em "Colar IDs/manual" para inserir markups/IDs manualmente.`, components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(manualBtn)], ephemeral: true, fetchReply: true });

        const coll = prompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 5*60*1000 });
        const sel = await new Promise((resolve) => {
          coll.on('collect', async selI => { resolve(selI); });
          coll.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
        });
        if (!sel) {
          await submitted.followUp({ content: 'Nenhum emoji fornecido — placeholders {emoji} serão removidos.', ephemeral: true });
          content = content.replace(/\{emoji\}/gi, '');
        } else {
          try {
            if (sel.customId && sel.customId.startsWith('say_emoji_select:')) {
              // user selected from the bot's emoji list — ask for confirmation before applying
              const chosen = sel.values || [];
              // Debug logging
              try {
                console.log('[say] emoji selector chosen ids:', chosen);
                for (const id of chosen) {
                  const inCache = interaction.client.emojis.cache.has(id);
                  const cached = interaction.client.emojis.cache.get(id);
                  let fetched = null;
                  try { fetched = await interaction.client.emojis.fetch(id).catch(() => null); } catch (e) { fetched = null; }
                  console.log(`[say] emoji id=${id} inCache=${inCache} cacheGuild=${cached ? cached.guildId : 'n/a'} fetched=${fetched ? 'yes' : 'no'}`);
                }
              } catch (logErr) { console.error('[say] error logging emoji selection', logErr); }

              const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
              const confirmBtn = new ButtonBuilder().setCustomId(`say_emoji_confirm:${sid}`).setLabel('Confirmar').setStyle(ButtonStyle.Success);
              const cancelBtn = new ButtonBuilder().setCustomId(`say_emoji_cancel:${sid}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger);

              // update the prompt message to ask for confirmation
              try {
                await sel.update({ content: `Você selecionou ${chosen.length} emoji(s). Confirme para aplicar.`, components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)], ephemeral: true });
              } catch (err) { try { await sel.reply({ content: `Você selecionou ${chosen.length} emoji(s). Confirme para aplicar.`, components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)], ephemeral: true }); } catch (e) { console.error('Erro ao pedir confirmação de emoji:', e); } }

              // wait for confirm/cancel
              const confColl = prompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 2*60*1000 });
              const conf = await new Promise((resolve) => {
                confColl.on('collect', async ci => { try { await ci.deferUpdate(); } catch {} resolve(ci); });
                confColl.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
              });
              if (!conf) {
                await submitted.followUp({ content: 'Nenhuma confirmação recebida — placeholders {emoji} serão removidos.', ephemeral: true });
                content = content.replace(/\{emoji\}/gi, '');
              } else if (conf.customId && conf.customId.startsWith('say_emoji_confirm:')) {
                // apply chosen emojis inline
                let ri = 0;
                content = content.replace(/\{emoji\}/gi, () => {
                  const id = chosen[ri++];
                  const em = interaction.client.emojis.cache.get(id);
                  if (em) return `${em.animated ? '<a:' : '<:'}${em.name}:${em.id}>`;
                  return '';
                });
                await submitted.followUp({ content: 'Emojis aplicados.', ephemeral: true });
              } else {
                await submitted.followUp({ content: 'Operação cancelada — placeholders {emoji} serão removidos.', ephemeral: true });
                content = content.replace(/\{emoji\}/gi, '');
              }
            } else if (sel.customId && sel.customId.startsWith('say_fill_emoji:')) {
              // manual paste fallback (open modal)
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
                let ri = 0;
                content = content.replace(/\{emoji\}/gi, () => { const r = replacements[ri++]; return r ? r.markup : ''; });
                await res.reply({ content: 'Emojis aplicados no texto.', ephemeral: true });
              } catch (err) { console.error('emoji modal error', err); await submitted.followUp({ content: 'Erro ao processar emojis; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
            }
          } catch (err) { console.error('emoji selection error', err); await submitted.followUp({ content: 'Erro ao processar seleção de emojis; placeholders removidos.', ephemeral: true }); content = content.replace(/\{emoji\}/gi, ''); }
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
      let accessible = false;
      try {
        const e = await interaction.client.emojis.fetch(id).catch(() => null);
        if (e) accessible = true;
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
      const parts = splitMessage(content, 2000);
      for (let idx = 0; idx < parts.length; idx++) {
        const p = parts[idx];
        const allowedMentions = roleIdsSelected && roleIdsSelected.length > 0 ? { roles: roleIdsSelected } : { parse: ['users', 'roles', 'everyone'] };
        await target.send({ content: p, allowedMentions });
      }
      // If the bot cannot use certain custom emojis inline, send those emojis as image embeds
      // (this reproduces the previous behavior where animated emojis become GIF attachments).
      for (const me of missingEmojiImages) {
        try {
          const url = `https://cdn.discordapp.com/emojis/${me.id}.${me.animated ? 'gif' : 'png'}`;
          const emb = new EmbedBuilder().setImage(url);
          await target.send({ embeds: [emb] });
        } catch (e) { console.error('Erro ao enviar emoji como imagem', e); }
      }

      const replyText = `Mensagem enviada em ${target}${parts.length > 1 ? ` (dividida em ${parts.length} partes)` : ''}`;
      try {
        if (!interaction.replied) {
          return await interaction.reply({ content: replyText, ephemeral: true });
        } else {
          return await interaction.followUp({ content: replyText, ephemeral: true });
        }
      } catch (e) {
        console.error('Erro ao responder interação /say:', e);
        // as a last resort, try to send DM to user
        try { await interaction.user.send({ content: replyText }); } catch (ee) { /* ignore */ }
        return;
      }
    } catch (err) {
      console.error('Erro em /say:', err);
      return interaction.reply({ content: 'Falha ao enviar a mensagem (verifique permissões do bot).', ephemeral: true });
    }
  }
};
