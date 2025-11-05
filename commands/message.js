const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel para criar mensagens/embeds customizados')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    try {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

    // permissões: manter similar ao antigo announce (ManageMessages/Admin or configured roles)
    const fs = require('fs');
    const cfgPath = './data/config.json';
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = {}; }
    const { PermissionFlagsBits } = require('discord.js');
    if (cfg.announceRoleIds && cfg.announceRoleIds.length > 0) {
      const hasRole = cfg.announceRoleIds.some(rid => interaction.member.roles.cache.has(rid));
      if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
    } else {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      // Discord limits 1-5 components per ActionRow. We split buttons into two rows.
      const makeRow = (id) => {
        const first = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar container').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover último').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar todos').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success)
        );
        const second = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );
        return [first, second];
      };


    const makeRow = (id) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`message_add:${id}`).setLabel('➕ Adicionar container').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`message_remove_last:${id}`).setLabel('🗑️ Remover último').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_clear:${id}`).setLabel('🧹 Limpar todos').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_preview:${id}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`message_send:${id}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`message_cancel:${id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
      const panel = await interaction.reply({ embeds: [emptyEmbed], components: row, ephemeral: true, fetchReply: true });

    const row = makeRow(id);

    const emptyEmbed = new EmbedBuilder()
      .setTitle('Painel de criação de mensagem')
      .setDescription('Clique em "Adicionar container" para criar um bloco (embed). Você pode adicionar múltiplos containers.')
      .setTimestamp();

    // enviar resposta e obter a mensagem para collectors
    const panel = await interaction.reply({ embeds: [emptyEmbed], components: [row], ephemeral: true, fetchReply: true });

    // helper para atualizar painel
    const updatePanel = async (msg, payload) => {
      const embeds = [];
      if (payload.containers.length === 0) {
        embeds.push(new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Sem containers ainda. Clique em "Adicionar container".').setTimestamp());
      } else {
        const summary = new EmbedBuilder().setTitle('Containers atuais').setDescription(payload.containers.map((c, i) => `#${i+1} — ${c.title || '[sem título]'}\n${c.description ? (c.description.length > 200 ? c.description.slice(0,200)+'…' : c.description) : '*sem descrição*'}`).join('\n\n')).setTimestamp();
        embeds.push(summary);
      }
      try { await msg.edit({ embeds, components: [makeRow(payload.id)] }); } catch (e) { /* ignore edit errors */ }
    };

    // collector para botões
    const collector = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15 * 60 * 1000 });

    collector.on('collect', async i => {
      const [action, payloadId] = i.customId.split(':');
      if (payloadId !== id) return i.reply({ content: 'Painel inválido/expirado.', ephemeral: true });

      // refrescar payload referência
      const pm = interaction.client.pendingMessages.get(id);
      if (!pm) return i.update({ content: 'Sessão expirada.', embeds: [], components: [] });

      if (action === 'message_add') {
        // mostrar modal para inputs do embed
        const modalId = `message_modal:${id}:${Date.now()}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle('Adicionar container (embed)');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor hex (ex: #FF0000) (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer (opcional)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        await i.showModal(modal);

        // listener temporário para o submit do modal
        const onModal = async (m) => {
          try {
            if (!m.isModalSubmit() || m.customId !== modalId) return;
            if (m.user.id !== interaction.user.id) return m.reply({ content: 'Você não pode enviar esse modal.', ephemeral: true });

            // pegar valores
            const title = m.fields.getTextInputValue('title') || null;
            const description = m.fields.getTextInputValue('description') || null;
            const color = (m.fields.getTextInputValue('color') || '').replace('#','') || null;
            const footer = m.fields.getTextInputValue('footer') || null;

            // montar container
            const container = { title, description, color, footer, createdBy: m.user.id, createdAt: Date.now() };
            pm.containers.push(container);
            interaction.client.pendingMessages.set(id, pm);

            // atualizar painel
            await updatePanel(panel, pm);

            await m.reply({ content: 'Container adicionado.', ephemeral: true });
          } finally {
            interaction.client.removeListener('interactionCreate', onModal);
          }
        };

        interaction.client.on('interactionCreate', onModal);

        // safety: remover listener se não usado em 2 minutos
        setTimeout(() => interaction.client.removeListener('interactionCreate', onModal), 2 * 60 * 1000);

      } else if (action === 'message_remove_last') {
        if (pm.containers.length === 0) {
          await i.update({ content: 'Nenhum container para remover.', embeds: [], components: [makeRow(id)] });
          await updatePanel(panel, pm);
        } else {
          pm.containers.pop();
          interaction.client.pendingMessages.set(id, pm);
          await i.update({ content: 'Último container removido.', embeds: [], components: [makeRow(id)] });
          await updatePanel(panel, pm);
        }
      } else if (action === 'message_clear') {
        pm.containers = [];
        interaction.client.pendingMessages.set(id, pm);
        await i.update({ content: 'Todos os containers foram removidos.', embeds: [], components: [makeRow(id)] });
        await updatePanel(panel, pm);
      if (action === 'message_add') {
        // mostrar modal para inputs do embed
        // use a mesma customId que o handler global de modals espera: message_modal:<key>
        const modalId = `message_modal:${id}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle('Adicionar container (embed)');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor hex (ex: #FF0000) (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer (opcional)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        await i.showModal(modal);
      } else if (action === 'message_remove_last') {
        }
      } else if (action === 'message_cancel') {
        interaction.client.pendingMessages.delete(id);
        await i.update({ content: 'Edição cancelada. Painel finalizado.', embeds: [], components: [] });
        collector.stop('cancelled');
      } else {
        await i.reply({ content: 'Ação desconhecida.', ephemeral: true });
      }
    });

    collector.on('end', (_, reason) => {
      const pm = interaction.client.pendingMessages.get(id);
      if (pm) {
        interaction.client.pendingMessages.delete(id);
      }
      try { panel.edit({ content: `Sessão finalizada (${reason}).`, embeds: [], components: [] }); } catch (e) { /* ignore */ }
    });
    } catch (err) {
      console.error('Erro em /message.execute:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Ocorreu um erro interno ao abrir o painel de mensagens.', ephemeral: true });
    }
  }
};
