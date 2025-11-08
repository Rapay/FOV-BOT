const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
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

      const makeRows = (key) => {
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_clear:${key}`).setLabel('🧹 Limpar').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );
        return [row1, row2];
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
              const modal = new ModalBuilder().setCustomId(`message_modal_local:${id}`).setTitle('Novo container (sem imagem)');
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const title = submitted.fields.getTextInputValue('c_title') || null;
              const description = submitted.fields.getTextInputValue('c_description') || null;

              // Present choice buttons
              const choiceRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`message_add_choice:confirm_noimage:${id}`).setLabel('✅ Confirmar sem imagem').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`message_add_choice:wait_image:${id}`).setLabel('🕒 Aguardar imagem (60s)').setStyle(ButtonStyle.Primary)
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
                    session.containers.push({ title, description, image: null });
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
                      session.containers.push({ title, description, image: att ? att.url : null });
                      try { await panelChannel.send({ content: `${interaction.user}`, embeds: [] }).catch(()=>{}); } catch {}
                      try { await refreshPanel(); } catch {}
                    });
                    mc.on('end', async collected => {
                      if (!collected || collected.size === 0) {
                        // no image received
                        session.containers.push({ title, description, image: null });
                        try { await panelChannel.send({ content: `${interaction.user}`, embeds: [] }).catch(()=>{}); } catch {}
                        try { await refreshPanel(); } catch {}
                      }
                    });
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

