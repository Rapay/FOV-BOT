const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Faz o bot enviar texto cru (preserva marcação do Discord como spoilers, negrito, etc.)')
  .addStringOption(o => o.setName('content').setDescription('Texto a ser enviado pelo bot').setRequired(false))
  .addChannelOption(o => o.setName('channel').setDescription('Canal para enviar a mensagem (opcional)').setRequired(false))
  .addBooleanOption(o => o.setName('ephemeral').setDescription('Responder ao autor de forma efêmera indicando envio?').setRequired(false))
  .addRoleOption(o => o.setName('role').setDescription('Cargo para mencionar no início da mensagem (opcional)').setRequired(false)),

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
      await submitted.reply({ content: 'Recebido — enviando...', ephemeral: true });
    } catch (err) {
      console.error('Modal say error', err);
      return; // user probably closed modal or timeout
    }

    if (!content || content.trim().length === 0) return interaction.reply({ content: 'Conteúdo vazio não permitido.', ephemeral: true });

    try {
      const roleOpt = interaction.options.getRole('role');
      const parts = splitMessage(content, 2000);
      const allowedFirst = roleOpt ? { roles: [roleOpt.id], parse: ['users'] } : { parse: ['users', 'roles', 'everyone'] };
      const allowedOther = roleOpt ? { roles: [], parse: ['users'] } : { parse: ['users', 'roles', 'everyone'] };
      for (let idx = 0; idx < parts.length; idx++) {
        const p = parts[idx];
        const contentToSend = (idx === 0 && roleOpt) ? `<@&${roleOpt.id}> ${p}` : p;
        const allowedMentions = (idx === 0) ? allowedFirst : allowedOther;
        await target.send({ content: contentToSend, allowedMentions });
      }
      const replyText = `Mensagem enviada em ${target}${parts.length > 1 ? ` (dividida em ${parts.length} partes)` : ''}${roleOpt ? ` (mencionando ${roleOpt.name})` : ''}`;
      return interaction.reply({ content: replyText, ephemeral: true });
    } catch (err) {
      console.error('Erro em /say:', err);
      return interaction.reply({ content: 'Falha ao enviar a mensagem (verifique permissões do bot).', ephemeral: true });
    }
  }
};
