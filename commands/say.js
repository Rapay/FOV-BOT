const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, RoleSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

      // If user included {emoji} placeholders, prompt for emoji inputs (one per line)
      const emojiPlaceholders = (content.match(/\{emoji\}/gi) || []).length;
      if (emojiPlaceholders > 0) {
        const btnRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`say_fill_emoji:${sid}`).setLabel('Preencher emojis').setStyle(ButtonStyle.Primary)
        );
        const prompt = await submitted.followUp({ content: `Encontrei ${emojiPlaceholders} placeholder(s) {emoji}. Clique em "Preencher emojis" e cole os emojis/IDs (um por linha) na ordem. Você pode usar <a:name:id> ou apenas o id.`, components: [btnRow], ephemeral: true, fetchReply: true });

        const coll = prompt.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, max: 1, time: 5*60*1000 });
        const sel = await new Promise((resolve) => {
          coll.on('collect', async selI => { try { await selI.deferUpdate(); } catch {} resolve(selI); });
          coll.on('end', collected => { if (!collected || collected.size === 0) resolve(null); });
        });
        if (!sel) {
          await submitted.followUp({ content: 'Nenhum emoji fornecido — placeholders {emoji} serão removidos.', ephemeral: true });
          content = content.replace(/\{emoji\}/gi, '');
        } else {
          try {
            const modal2 = new ModalBuilder().setCustomId(`modal_say_emoji:${sid}`).setTitle('Forneça os emojis');
            modal2.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji_list').setLabel('Cole aqui os emojis (um por linha)').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('<a:seta:851206127471034378>\n851206127471034378')));
            await sel.showModal(modal2);
            const res = await sel.awaitModalSubmit({ time: 5*60*1000, filter: m => m.user.id === interaction.user.id });
            const lines = (res.fields.getTextInputValue('emoji_list') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            const replacements = [];
            for (const line of lines.slice(0, emojiPlaceholders)) {
              const m = line.match(/<(a)?:[A-Za-z0-9_]+:(\d+)>/);
              if (m) {
                replacements.push({ markup: m[0], id: m[2], animated: !!m[1] });
                continue;
              }
              const idm = line.match(/^(\d+)$/);
              if (idm) {
                // create a placeholder markup; name can be arbitrary
                replacements.push({ markup: `<:e:${idm[1]}>`, id: idm[1], animated: false });
                continue;
              }
              const any = line.match(/(\d{17,20})/);
              if (any) {
                replacements.push({ markup: `<:e:${any[1]}>`, id: any[1], animated: false });
                continue;
              }
            }
            // sequentially replace placeholders
            let ri = 0;
            content = content.replace(/\{emoji\}/gi, () => {
              const r = replacements[ri++];
              return r ? r.markup : '';
            });
            await res.reply({ content: 'Emojis aplicados no texto.', ephemeral: true });
          } catch (err) {
            console.error('emoji modal error', err);
            await submitted.followUp({ content: 'Erro ao processar emojis; placeholders removidos.', ephemeral: true });
            content = content.replace(/\{emoji\}/gi, '');
          }
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
      // send missing emoji images as embeds so the emoji appearance is preserved even if bot can't use inline emoji
      for (const me of missingEmojiImages) {
        try {
          const url = `https://cdn.discordapp.com/emojis/${me.id}.${me.animated ? 'gif' : 'png'}`;
          const emb = new EmbedBuilder().setImage(url);
          await target.send({ embeds: [emb] });
        } catch (e) { console.error('Erro ao enviar emoji como imagem', e); }
      }
      const replyText = `Mensagem enviada em ${target}${parts.length > 1 ? ` (dividida em ${parts.length} partes)` : ''}`;
      return interaction.reply({ content: replyText, ephemeral: true });
    } catch (err) {
      console.error('Erro em /say:', err);
      return interaction.reply({ content: 'Falha ao enviar a mensagem (verifique permissões do bot).', ephemeral: true });
    }
  }
};
