const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// message buttons persistence file
const _buttonsDbPath = path.join(__dirname, '..', 'data', 'message_buttons.json');
function _saveButtonHook(key, url) {
  try {
    let data = {};
    if (fs.existsSync(_buttonsDbPath)) {
      try { data = JSON.parse(fs.readFileSync(_buttonsDbPath, 'utf8') || '{}'); } catch (e) { data = {}; }
    }
    data[key] = url;
    fs.writeFileSync(_buttonsDbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro salvando message button hook:', e);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Abrir painel para criar mensagens/embeds customizados')
    .addChannelOption(opt => opt.setName('channel').setDescription('Canal padrão para enviar (opcional)').setRequired(false)),

  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

      // permission check (reuse existing config behavior if present)
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
  const session = { id, authorId: interaction.user.id, channelId: channel.id, panelChannelId: null, container: null };

      const makeRows = (key) => {
        const rows = [];
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_add:${key}`).setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`message_edit:${key}`).setLabel('✏️ Editar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_add_button:${key}`).setLabel('➕ Botão').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_manage_buttons:${key}`).setLabel('🧾 Botões').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_remove:${key}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`message_preview:${key}`).setLabel('👁️ Pré-visualizar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`message_send:${key}`).setLabel('✅ Enviar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`message_cancel:${key}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
        );
        rows.push(row1, row2);

        // If a container exists for this session, show the advanced inline panel rows so users can add icons, fields and buttons directly from the panel
        try {
          if (session && session.container) {
            const adv1 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`message_edit_set_author:${key}`).setLabel('✍️ Autor').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`message_edit_upload_authoricon:${key}`).setLabel('📤 Autor Icon (DM)').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`message_edit_set_titleurl:${key}`).setLabel('🔗 Title URL').setStyle(ButtonStyle.Secondary)
            );
            const adv2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`message_edit_upload_thumbnail:${key}`).setLabel('📤 Thumbnail (DM)').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`message_edit_upload_footericon:${key}`).setLabel('📤 Footer Icon (DM)').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`message_edit_toggle_timestamp:${key}`).setLabel('⏱️ Timestamp').setStyle(ButtonStyle.Secondary)
            );
            const advTitle = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`message_edit_toggle_titlelarge:${key}`).setLabel('⬆️ Título grande').setStyle(ButtonStyle.Secondary)
            );
            const advButtons = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`message_edit_add_button_url:${key}`).setLabel('➕ Botão (URL)').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`message_edit_add_button_webhook:${key}`).setLabel('➕ Botão (Webhook)').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`message_manage_buttons:${key}`).setLabel('🧾 Gerenciar').setStyle(ButtonStyle.Secondary)
            );
            // inline selects to reduce clicks: choose button type and default style directly from the panel
            const selType = new StringSelectMenuBuilder().setCustomId(`message_panel_button_type:${key}`).setPlaceholder('Criar botão: escolha o tipo').addOptions([
              { label: 'URL', value: 'url', description: 'Botão que abre um link' },
              { label: 'Webhook', value: 'webhook', description: 'Botão que aciona um webhook' }
            ]).setMinValues(1).setMaxValues(1);
            const selStyle = new StringSelectMenuBuilder().setCustomId(`message_panel_button_style:${key}`).setPlaceholder('Estilo (aplica-se a webhooks)').addOptions([
              { label: 'Primary', value: 'primary', description: 'Destaque (azul)' },
              { label: 'Secondary', value: 'secondary', description: 'Cinza' },
              { label: 'Success', value: 'success', description: 'Verde' },
              { label: 'Danger', value: 'danger', description: 'Vermelho' }
            ]).setMinValues(1).setMaxValues(1);
            const selRowType = new ActionRowBuilder().addComponents(selType);
            const selRowStyle = new ActionRowBuilder().addComponents(selStyle);
            const advFields = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`message_edit_add_field:${key}`).setLabel('➕ Adicionar Field').setStyle(ButtonStyle.Secondary)
            );
            rows.push(adv1, adv2, advTitle, advButtons, advFields, selRowType, selRowStyle);
          }
        } catch (e) { /* ignore */ }

        return rows;
      };

  const panelEmbed = new EmbedBuilder().setTitle('Painel de criação de mensagem').setDescription('Use os botões para montar sua mensagem (sem salvamento).\nAdicionar: cria um novo container (pode anexar imagem via DM). Pré-visualizar: envia uma prévia. Enviar: publica os embeds no canal selecionado.').setTimestamp();
      const panel = await interaction.reply({ embeds: [panelEmbed], components: makeRows(id), ephemeral: false, fetchReply: true });
      session.panelChannelId = panel.channel.id;

      const refreshPanel = async () => {
        const embed = new EmbedBuilder();
        if (!session.container) embed.setTitle('Sem container').setDescription('Clique em ➕ Adicionar para criar um novo container.');
        else embed.setTitle(session.container.title || 'Container criado').setDescription(session.container.description || '[sem descrição]');
        try { await panel.edit({ embeds: [embed], components: makeRows(id) }); } catch (e) { }
      };

      const collector = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15 * 60 * 1000 });

      collector.on('collect', async i => {
        try {
          const parts = i.customId.split(':');
          const action = parts[0];
          const key = parts[1];
          const arg = parts[2];
          if (key !== id) return i.reply({ content: 'Sessão inválida.', ephemeral: true });

          // advanced edit handlers that include an index argument (arg)
          const parseIdx = () => { const n = Number(arg); return Number.isNaN(n) ? null : n; };

          // Handle edit-advanced actions (single container)
          if (action === 'message_edit_set_author' || action === 'message_edit_set_titleurl' || action === 'message_edit_add_field' || action === 'message_edit_toggle_timestamp' || action === 'message_edit_upload_authoricon' || action === 'message_edit_upload_thumbnail' || action === 'message_edit_upload_footericon' || action === 'message_edit_toggle_titlelarge' || action === 'message_edit_add_button_url' || action === 'message_edit_add_button_webhook') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Nenhum container criado ainda. Use Adicionar primeiro.', ephemeral: true });

            try {
              // set author name
              if (action === 'message_edit_set_author') {
                const modal = new ModalBuilder().setCustomId(`message_modal_set_author:${id}`).setTitle('Definir autor');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('author_name').setLabel('Nome do autor').setStyle(TextInputStyle.Short).setRequired(false)));
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
                const name = submitted.fields.getTextInputValue('author_name') || null;
                existing.authorName = name;
                await submitted.reply({ content: 'Autor atualizado.', ephemeral: true }).catch(()=>{});
                await refreshPanel();
                return;
              }

              // set title URL
              if (action === 'message_edit_set_titleurl') {
                const modal = new ModalBuilder().setCustomId(`message_modal_set_titleurl:${id}`).setTitle('Definir Title URL');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title_url').setLabel('URL do título (ex: https://...)').setStyle(TextInputStyle.Short).setRequired(false)));
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
                const url = submitted.fields.getTextInputValue('title_url') || null;
                existing.titleUrl = url;
                await submitted.reply({ content: 'Title URL atualizado.', ephemeral: true }).catch(()=>{});
                await refreshPanel();
                return;
              }

              // add a field (name + value)
              if (action === 'message_edit_add_field') {
                const modal = new ModalBuilder().setCustomId(`message_modal_add_field:${id}`).setTitle('Adicionar field (até 3)');
                modal.addComponents(
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('f_name').setLabel('Nome do field').setStyle(TextInputStyle.Short).setRequired(true)),
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('f_value').setLabel('Valor do field').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
                const fname = submitted.fields.getTextInputValue('f_name') || null;
                const fvalue = submitted.fields.getTextInputValue('f_value') || null;
                existing.fields = existing.fields || [];
                if (existing.fields.length >= 3) {
                  await submitted.reply({ content: 'Limite de 3 fields atingido.', ephemeral: true }).catch(()=>{});
                } else {
                  existing.fields.push({ name: fname, value: fvalue, inline: false });
                  await submitted.reply({ content: 'Field adicionado.', ephemeral: true }).catch(()=>{});
                }
                await refreshPanel();
                return;
              }

              // toggle timestamp
              if (action === 'message_edit_toggle_timestamp') {
                existing.timestamp = !existing.timestamp;
                await i.reply({ content: `Timestamp ${existing.timestamp ? 'ativado' : 'desativado'}.`, ephemeral: true }).catch(()=>{});
                await refreshPanel();
                return;
              }

              // DM-only uploads for icons/thumbnail/footer
              if (action === 'message_edit_upload_authoricon' || action === 'message_edit_upload_thumbnail' || action === 'message_edit_upload_footericon') {
                try {
                  const user = interaction.user;
                  const dmChannel = await user.createDM();
                  await i.reply({ content: 'Abri um DM para receber o arquivo (60s). Envie a imagem no DM agora.', ephemeral: true }).catch(()=>{});
                  await dmChannel.send({ content: 'Envie a imagem para este DM; ela será aplicada ao embed.' }).catch(()=>{});
                  const recent = await dmChannel.messages.fetch({ limit: 10 }).catch(() => null);
                  const found = recent && recent.find(m => m.author.id === user.id && m.attachments && m.attachments.size > 0);
                    if (found) {
                    const url = found.attachments.first().url;
                    if (action === 'message_edit_upload_authoricon') existing.authorIcon = url;
                    if (action === 'message_edit_upload_thumbnail') existing.thumbnail = url;
                    if (action === 'message_edit_upload_footericon') existing.footerIcon = url;
                    await dmChannel.send({ content: 'Imagem aplicada.' }).catch(()=>{});
                    await i.followUp({ content: 'Imagem aplicada ao container.', ephemeral: true }).catch(()=>{});
                    await refreshPanel();
                    return;
                  }
                  const fdm = m => m.author.id === user.id && m.attachments && m.attachments.size > 0;
                  const mc = dmChannel.createMessageCollector({ filter: fdm, max: 1, time: 60 * 1000 });
                  mc.on('collect', async m => {
                    const url = m.attachments.first().url;
                    if (action === 'message_edit_upload_authoricon') existing.authorIcon = url;
                    if (action === 'message_edit_upload_thumbnail') existing.thumbnail = url;
                    if (action === 'message_edit_upload_footericon') existing.footerIcon = url;
                    try { await dmChannel.send({ content: 'Imagem recebida e aplicada.' }).catch(()=>{}); } catch {}
                    try { await i.followUp({ content: 'Imagem recebida e aplicada ao container.', ephemeral: true }); } catch {}
                    try { await refreshPanel(); } catch {}
                  });
                  mc.on('end', async collected => {
                    if (!collected || collected.size === 0) {
                      try { await dmChannel.send({ content: 'Tempo esgotado: nenhuma imagem recebida.' }).catch(()=>{}); } catch {}
                      try { await i.followUp({ content: 'Nenhuma imagem recebida.', ephemeral: true }); } catch {}
                    }
                  });
                } catch (err) {
                  console.error('Erro no upload DM (advanced):', err);
                  try { await i.reply({ content: 'Falha ao abrir DM para upload.', ephemeral: true }); } catch {}
                }
                return;
              }

          // toggle title-large (use the title as a big header in the description)
          if (action === 'message_edit_toggle_titlelarge') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Nenhum container criado ainda.', ephemeral: true });
            existing.titleLarge = !existing.titleLarge;
            await i.reply({ content: `Título grande ${existing.titleLarge ? 'ativado' : 'desativado'}.`, ephemeral: true }).catch(()=>{});
            await refreshPanel();
            return;
          }
            } catch (err) {
              console.error('Erro nas opções avançadas:', err);
              return i.reply({ content: 'Erro nas opções avançadas.', ephemeral: true });
            }
          }

          // ADD: open a modal (title, description, color) then open a DM and wait for an attachment
          if (action === 'message_add') {
            try {
              const modal = new ModalBuilder().setCustomId(`message_modal_local:${id}`).setTitle('Novo container');
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex, ex: #FF0000)').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_image_text').setLabel('Texto pequeno abaixo da imagem (caption)').setStyle(TextInputStyle.Short).setRequired(false))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const title = submitted.fields.getTextInputValue('c_title') || null;
              const description = submitted.fields.getTextInputValue('c_description') || null;
              const color = submitted.fields.getTextInputValue('c_color') || null;
              const imageText = submitted.fields.getTextInputValue('c_image_text') || null;

              // Auto-open DM and wait for image (60s)
              try {
                const user = interaction.user;
                const dmChannel = await user.createDM();
                await submitted.reply({ content: 'Abri um DM para você enviar a imagem; envie a imagem neste DM nas próximas 60s. Se não enviar, o container será adicionado sem imagem.', ephemeral: true }).catch(()=>{});
                await dmChannel.send({ content: 'Envie a imagem para este DM nas próximas 60s; ela será anexada ao container que você está criando.' }).catch(()=>{});

                // Wait for an image attachment in the DM (60s). Provide a button in the DM so the user can signal
                // they've finished uploading (helps when attachments are not immediately detected).
                try {
                  const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`message_dm_confirm:${id}`).setLabel('📎 Concluir upload').setStyle(ButtonStyle.Primary)
                  );
                  const dmPrompt = await dmChannel.send({ content: 'Clique em "Concluir upload" quando terminar de enviar a imagem neste DM.', components: [confirmRow] }).catch(()=>null);

                  const fdm = m => m.author.id === user.id && m.attachments && m.attachments.size > 0;
                  const mcDM = dmChannel.createMessageCollector({ filter: fdm, max: 1, time: 60 * 1000 });

                  // component collector for the DM prompt button (if message was sent)
                  let compCollector;
                  if (dmPrompt && dmPrompt.createMessageComponentCollector) {
                    compCollector = dmPrompt.createMessageComponentCollector({ filter: btn => btn.user.id === user.id, time: 60 * 1000, max: 1 });
                  }

                  const applyAttachment = async (attUrl) => {
                    session.container = { title, description, color: color || null, image: attUrl || null, imageText };
                    try { await dmChannel.send({ content: attUrl ? 'Imagem recebida e aplicada ao container.' : 'Nenhuma imagem encontrada: container adicionado sem imagem.' }).catch(()=>{}); } catch {}
                    try { await refreshPanel(); } catch {}
                    // after adding the container, offer advanced options (including adding buttons)
                    try {
                      const idx = 0;
                      const advRow1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`message_edit_set_author:${id}`).setLabel('✍️ Autor').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`message_edit_upload_authoricon:${id}`).setLabel('📤 Autor Icon (DM)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`message_edit_set_titleurl:${id}`).setLabel('🔗 Title URL').setStyle(ButtonStyle.Secondary)
                      );
                      const advRow2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`message_edit_upload_thumbnail:${id}`).setLabel('📤 Thumbnail (DM)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`message_edit_upload_footericon:${id}`).setLabel('📤 Footer Icon (DM)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`message_edit_toggle_timestamp:${id}`).setLabel('⏱️ Toggle Timestamp').setStyle(ButtonStyle.Secondary)
                      );
                      const advRowTitle = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`message_edit_toggle_titlelarge:${id}`).setLabel('⬆️ Título grande').setStyle(ButtonStyle.Secondary)
                      );
                      const advRowButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`message_edit_add_button_url:${id}`).setLabel('➕ Botão (URL)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`message_edit_add_button_webhook:${id}`).setLabel('➕ Botão (Webhook)').setStyle(ButtonStyle.Secondary)
                      );
                      const advRow3 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`message_edit_add_field:${id}`).setLabel('➕ Adicionar Field').setStyle(ButtonStyle.Secondary)
                      );
                      await submitted.followUp({ content: 'Opções avançadas (opcionais):', components: [advRow1, advRow2, advRowTitle, advRowButtons, advRow3], ephemeral: true }).catch(()=>{});
                    } catch (err) { console.error('Erro ao enviar opções avançadas após upload:', err); }
                  };

                  mcDM.on('collect', async m => {
                    try {
                      const att = m.attachments.first();
                      // stop component collector if active
                      try { if (compCollector && !compCollector.ended) compCollector.stop('msg'); } catch(e){}
                      await applyAttachment(att ? att.url : null);
                    } catch (err) {
                      console.error('Erro ao coletar DM de imagem:', err);
                    }
                  });

                  mcDM.on('end', async collected => {
                    if (!collected || collected.size === 0) {
                      // if component collector also didn't fire, add without image
                      // but wait a moment: compCollector may still be running and may provide the attachment
                      if (!compCollector) {
                        await applyAttachment(null);
                      } else {
                        // if compCollector exists, wait for it to finish before deciding
                        // set a short timeout to let compCollector collect
                        setTimeout(async () => {
                          if (!compCollector.ended) {
                            try { if (!compCollector.ended) compCollector.stop('timeout'); } catch(e){}
                          }
                        }, 250);
                      }
                    }
                  });

                  if (compCollector) {
                    compCollector.on('collect', async btn => {
                      try {
                        await btn.reply({ content: 'Verificando imagens no DM...', ephemeral: true });
                        // fetch recent messages and look for an attachment
                        const recent = await dmChannel.messages.fetch({ limit: 10 }).catch(() => null);
                        const found = recent && recent.find(m => m.author.id === user.id && m.attachments && m.attachments.size > 0);
                        if (found) {
                          const url = found.attachments.first().url;
                          // stop message collector
                          try { if (mcDM && !mcDM.ended) mcDM.stop('btn'); } catch(e){}
                          await applyAttachment(url);
                        } else {
                          await dmChannel.send({ content: 'Nenhuma imagem encontrada nas mensagens recentes. Por favor anexe uma imagem e clique em Concluir upload novamente.' }).catch(()=>{});
                        }
                      } catch (err) {
                        console.error('Erro ao processar confirmação DM:', err);
                      }
                    });

                    compCollector.on('end', async () => {
                      // if compCollector ended without collecting and message collector also ended without attachments,
                      // ensure container was added (handled in mcDM end logic)
                    });
                  }
                } catch (err) {
                  console.error('Erro ao aguardar imagem no DM (com botão):', err);
                  session.containers.push({ title, description, color: color || null, image: null, imageText });
                  try { await refreshPanel(); } catch {}
                }
              } catch (err) {
                console.error('Erro ao abrir DM para upload automático:', err);
                try { await submitted.reply({ content: 'Falha ao abrir DM; container adicionado sem imagem.', ephemeral: true }).catch(()=>{}); } catch {}
                session.containers.push({ title, description, color: color || null, image: null });
                try { await refreshPanel(); } catch {}
              }
            } catch (err) {
              try { if (!i.replied) await i.reply({ content: 'Tempo esgotado ao preencher.', ephemeral: true }); } catch {};
            }
            return;
          }

          // Add button directly from main panel (shows ephemeral choice URL / Webhook)
          if (action === 'message_add_button') {
            if (!session.container) return i.reply({ content: 'Crie um container primeiro (➕ Adicionar).', ephemeral: true });
            try {
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`message_add_button_url:${id}`).setLabel('➕ URL').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`message_add_button_webhook:${id}`).setLabel('➕ Webhook').setStyle(ButtonStyle.Success)
              );
              return i.reply({ content: 'Escolha o tipo de botão que deseja adicionar:', components: [row], ephemeral: true });
            } catch (err) {
              console.error('Erro ao mostrar opções de botão:', err);
              return i.reply({ content: 'Erro ao abrir opções de botão.', ephemeral: true });
            }
          }

          // Handler for quick-add URL button (from panel)
          if (action === 'message_add_button_url') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Nenhum container criado ainda.', ephemeral: true });
            try {
              const modal = new ModalBuilder().setCustomId(`message_modal_add_button_url:${id}`).setTitle('Adicionar Botão (URL)');
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_label').setLabel('Rótulo do botão').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_url').setLabel('URL (https://...)').setStyle(TextInputStyle.Short).setRequired(true))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const label = submitted.fields.getTextInputValue('b_label') || 'Abrir';
              const url = submitted.fields.getTextInputValue('b_url') || null;
              const style = 'link';
              existing.buttons = existing.buttons || [];
              existing.buttons.push({ type: 'url', label, url, style });
              await submitted.reply({ content: 'Botão (URL) adicionado ao container.', ephemeral: true }).catch(()=>{});
              await refreshPanel();
            } catch (err) {
              console.error('Erro ao adicionar botão URL (painel):', err);
              return i.reply({ content: 'Erro ao adicionar botão.', ephemeral: true });
            }
            return;
          }

          // Manage buttons: list current buttons in a select so user can remove them
          if (action === 'message_manage_buttons') {
            const existing = session.container;
            if (!existing || !existing.buttons || !existing.buttons.length) return i.reply({ content: 'Nenhum botão adicionado ao container.', ephemeral: true });
            try {
              const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
              const options = existing.buttons.map((b, idx) => ({ label: b.label || `(button ${idx})`, value: String(idx), description: b.type === 'url' ? 'URL' : 'Webhook' }));
              const sel = new StringSelectMenuBuilder().setCustomId(`message_manage_buttons_select:${id}`).setPlaceholder('Selecione um botão para remover...').addOptions(options).setMinValues(1).setMaxValues(1);
              const row = new ActionRowBuilder().addComponents(sel);
              return i.reply({ content: 'Selecione o botão que quer remover (será removido imediatamente).', components: [row], ephemeral: true });
            } catch (err) {
              console.error('Erro ao listar botões:', err);
              return i.reply({ content: 'Erro ao listar botões.', ephemeral: true });
            }
          }

          // Handle selection from manage buttons select
          if (action === 'message_manage_buttons_select') {
            const existing = session.container;
            if (!existing || !existing.buttons || !existing.buttons.length) return i.reply({ content: 'Nenhum botão adicionado ao container.', ephemeral: true });
            const selIdx = Number(arg || (i.values && i.values[0]));
            if (Number.isNaN(selIdx) || selIdx < 0 || selIdx >= existing.buttons.length) return i.reply({ content: 'Índice inválido selecionado.', ephemeral: true });
            const removed = existing.buttons.splice(selIdx, 1);
            await i.update({ content: `Botão removido: ${removed && removed[0] && removed[0].label ? removed[0].label : 'item'}.`, components: [], embeds: [] }).catch(()=>{});
            await refreshPanel();
            return;
          }

          // Panel style select: set default style for webhook buttons in this session
          if (action === 'message_panel_button_style') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Crie um container primeiro.', ephemeral: true });
            const chosen = i.values && i.values[0] ? i.values[0] : null;
            if (!chosen) return i.reply({ content: 'Estilo inválido.', ephemeral: true });
            existing.buttonDefaultStyle = chosen;
            return i.reply({ content: `Estilo padrão para webhooks definido: ${chosen}`, ephemeral: true });
          }

          // Panel type select: open modal to add URL or Webhook button using panel style
          if (action === 'message_panel_button_type') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Crie um container primeiro.', ephemeral: true });
            const chosenType = i.values && i.values[0] ? i.values[0] : null;
            if (!chosenType) return i.reply({ content: 'Tipo inválido.', ephemeral: true });
            const style = existing.buttonDefaultStyle || 'primary';
            try {
              if (chosenType === 'url') {
                const modal = new ModalBuilder().setCustomId(`message_modal_add_button_url:${id}`).setTitle('Adicionar Botão (URL)');
                modal.addComponents(
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_label').setLabel('Rótulo do botão').setStyle(TextInputStyle.Short).setRequired(true)),
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_url').setLabel('URL (https://...)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
                if (!submitted) return;
                const label = submitted.fields.getTextInputValue('b_label') || 'Abrir';
                const url = submitted.fields.getTextInputValue('b_url') || null;
                existing.buttons = existing.buttons || [];
                existing.buttons.push({ type: 'url', label, url, style: 'link' });
                await submitted.reply({ content: 'Botão (URL) adicionado ao container.', ephemeral: true }).catch(()=>{});
                await refreshPanel();
                return;
              }

              if (chosenType === 'webhook') {
                const modal = new ModalBuilder().setCustomId(`message_modal_add_button_webhook:${id}:${style}`).setTitle('Adicionar Botão (Webhook)');
                modal.addComponents(
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_label').setLabel('Rótulo do botão').setStyle(TextInputStyle.Short).setRequired(true)),
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_webhook').setLabel('URL do webhook (https://...)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
                if (!submitted) return;
                const label = submitted.fields.getTextInputValue('b_label') || 'Ação';
                const webhookUrl = submitted.fields.getTextInputValue('b_webhook') || null;
                existing.buttons = existing.buttons || [];
                existing.buttons.push({ type: 'webhook', label, webhookUrl, style });
                await submitted.reply({ content: 'Botão (Webhook) adicionado ao container.', ephemeral: true }).catch(()=>{});
                await refreshPanel();
                return;
              }
            } catch (err) {
              console.error('Erro ao processar seleção de tipo painel:', err);
              return i.reply({ content: 'Erro ao criar botão via painel.', ephemeral: true });
            }
          }

          // Handler for quick-add Webhook button (from panel) - uses select then modal
          if (action === 'message_add_button_webhook') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Nenhum container criado ainda.', ephemeral: true });
            try {
              const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
              const sel = new StringSelectMenuBuilder()
                .setCustomId(`message_select_button_style:${id}`)
                .setPlaceholder('Escolha o estilo do botão (cor)')
                .addOptions([
                  { label: 'Primary', value: 'primary', description: 'Cor padrão (azul) - destaque' },
                  { label: 'Secondary', value: 'secondary', description: 'Cinza' },
                  { label: 'Success', value: 'success', description: 'Verde' },
                  { label: 'Danger', value: 'danger', description: 'Vermelho' }
                ])
                .setMinValues(1).setMaxValues(1);

              const row = new ActionRowBuilder().addComponents(sel);
              const styleMsg = await i.reply({ content: 'Escolha o estilo para o botão webhook:', components: [row], ephemeral: true, fetchReply: true });
              const collected = await styleMsg.awaitMessageComponent({ filter: b => b.user.id === interaction.user.id, time: 2 * 60 * 1000 }).catch(() => null);
              if (!collected) {
                try { await i.followUp({ content: 'Tempo esgotado: nenhum estilo selecionado.', ephemeral: true }); } catch {}
                return;
              }
              const chosen = collected.values && collected.values[0] ? collected.values[0] : 'primary';
              const modal = new ModalBuilder().setCustomId(`message_modal_add_button_webhook:${id}:${chosen}`).setTitle('Adicionar Botão (Webhook)');
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_label').setLabel('Rótulo do botão').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_webhook').setLabel('URL do webhook (https://...)').setStyle(TextInputStyle.Short).setRequired(true))
              );
              await collected.showModal(modal);
              const submitted = await collected.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id }).catch(() => null);
              if (!submitted) {
                try { await i.followUp({ content: 'Tempo esgotado ao preencher o modal.', ephemeral: true }); } catch {}
                return;
              }
              const label = submitted.fields.getTextInputValue('b_label') || 'Ação';
              const webhookUrl = submitted.fields.getTextInputValue('b_webhook') || null;
              existing.buttons = existing.buttons || [];
              existing.buttons.push({ type: 'webhook', label, webhookUrl, style: chosen });
              await submitted.reply({ content: 'Botão (Webhook) adicionado ao container.', ephemeral: true }).catch(()=>{});
              await refreshPanel();
            } catch (err) {
              console.error('Erro ao adicionar botão webhook (painel):', err);
              return i.reply({ content: 'Erro ao criar botão webhook.', ephemeral: true });
            }
            return;
          }

          // REMOVE (single container)
          if (action === 'message_remove') {
            if (!session.container) return i.update({ content: 'Nenhum container para remover.', ephemeral: true, components: makeRows(id) }).catch(()=>{});
            session.container = null;
            await i.update({ content: 'Container removido.', ephemeral: true, components: makeRows(id) }).catch(()=>{});
            await refreshPanel();
            return;
          }

          // UPLOAD (DM) pre-upload removed (feature deprecated)

          // EDIT (single container)
          if (action === 'message_edit') {
            const existing = session.container || {};
            try {
              const modal = new ModalBuilder().setCustomId(`message_edit_local:${id}`).setTitle(`Editar container`);
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.title || '')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(existing.description || '')),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_color').setLabel('Cor (hex)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(existing.color || ''))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const title = submitted.fields.getTextInputValue('c_title') || existing.title || null;
              const description = submitted.fields.getTextInputValue('c_description') || existing.description || null;
              const sessionColor = submitted.fields.getTextInputValue('c_color') || existing.color || null;
              const imageText = submitted.fields.getTextInputValue('c_image_text') || existing.imageText || null;
              session.container = { title, description, color: sessionColor || null, image: existing.image || null, imageText };
                await submitted.reply({ content: `Container atualizado.`, ephemeral: true });
              await refreshPanel();

              // Offer advanced edit options via ephemeral buttons (author, icons (DM-only), title URL, timestamp, fields, buttons)
              try {
                const advRow1 = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`message_edit_set_author:${id}`).setLabel('✍️ Autor').setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`message_edit_upload_authoricon:${id}`).setLabel('📤 Autor Icon (DM)').setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`message_edit_set_titleurl:${id}`).setLabel('🔗 Title URL').setStyle(ButtonStyle.Secondary)
                );
                const advRow2 = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`message_edit_upload_thumbnail:${id}`).setLabel('📤 Thumbnail (DM)').setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`message_edit_upload_footericon:${id}`).setLabel('📤 Footer Icon (DM)').setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`message_edit_toggle_timestamp:${id}`).setLabel('⏱️ Toggle Timestamp').setStyle(ButtonStyle.Secondary)
                );
                // add title-large toggle to allow using the title as a big header in the description
                const advRowTitle = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`message_edit_toggle_titlelarge:${id}`).setLabel('⬆️ Título grande').setStyle(ButtonStyle.Secondary)
                );
                const advRow3 = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`message_edit_add_field:${id}`).setLabel('➕ Adicionar Field').setStyle(ButtonStyle.Secondary)
                );
                const advRowButtons = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`message_edit_add_button_url:${id}`).setLabel('➕ Botão (URL)').setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`message_edit_add_button_webhook:${id}`).setLabel('➕ Botão (Webhook)').setStyle(ButtonStyle.Secondary)
                );
                await submitted.followUp({ content: 'Opções avançadas (opcionais):', components: [advRow1, advRow2, advRowTitle, advRowButtons, advRow3], ephemeral: true }).catch(()=>{});
              } catch (err) {
                console.error('Erro ao enviar opções avançadas:', err);
              }
            } catch (err) {
              console.error('Erro no edit local modal flow:', err);
              return i.reply({ content: 'Erro ou tempo esgotado ao editar.', ephemeral: true });
            }
            return;
          }

          // Add button (URL)
          if (action === 'message_edit_add_button_url') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Nenhum container criado ainda.', ephemeral: true });
            try {
              const modal = new ModalBuilder().setCustomId(`message_modal_add_button_url:${id}`).setTitle('Adicionar Botão (URL)');
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_label').setLabel('Rótulo do botão').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_url').setLabel('URL (https://...)').setStyle(TextInputStyle.Short).setRequired(true))
              );
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id });
              const label = submitted.fields.getTextInputValue('b_label') || 'Abrir';
              const url = submitted.fields.getTextInputValue('b_url') || null;
              // URL buttons must use Link style
              const style = 'link';
              existing.buttons = existing.buttons || [];
              existing.buttons.push({ type: 'url', label, url, style });
              await submitted.reply({ content: 'Botão (URL) adicionado.', ephemeral: true }).catch(()=>{});
              await refreshPanel();
            } catch (err) {
              console.error('Erro ao adicionar botão URL:', err);
              return i.reply({ content: 'Erro ao adicionar botão.', ephemeral: true });
            }
            return;
          }

          // Add button (Webhook)
          if (action === 'message_edit_add_button_webhook') {
            const existing = session.container;
            if (!existing) return i.reply({ content: 'Nenhum container criado ainda.', ephemeral: true });
            try {
              // First ask the user to choose a style via select (better UX than text input)
              try {
                const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
                const sel = new StringSelectMenuBuilder()
                  .setCustomId(`message_select_button_style:${id}`)
                  .setPlaceholder('Escolha o estilo do botão (cor)')
                  .addOptions([
                    { label: 'Primary', value: 'primary', description: 'Cor padrão (azul) - destaque' },
                    { label: 'Secondary', value: 'secondary', description: 'Cinza' },
                    { label: 'Success', value: 'success', description: 'Verde' },
                    { label: 'Danger', value: 'danger', description: 'Vermelho' }
                  ])
                  .setMinValues(1).setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(sel);
                const styleMsg = await i.reply({ content: 'Escolha o estilo para o botão webhook:', components: [row], ephemeral: true, fetchReply: true });
                const collected = await styleMsg.awaitMessageComponent({ filter: b => b.user.id === interaction.user.id, time: 2 * 60 * 1000 }).catch(() => null);
                if (!collected) {
                  try { await i.followUp({ content: 'Tempo esgotado: nenhum estilo selecionado.', ephemeral: true }); } catch {}
                  return;
                }
                const chosen = collected.values && collected.values[0] ? collected.values[0] : 'primary';
                // now show modal to get label + webhook url
                const modal = new ModalBuilder().setCustomId(`message_modal_add_button_webhook:${id}:${chosen}`).setTitle('Adicionar Botão (Webhook)');
                modal.addComponents(
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_label').setLabel('Rótulo do botão').setStyle(TextInputStyle.Short).setRequired(true)),
                  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_webhook').setLabel('URL do webhook (https://...)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await collected.showModal(modal);
                const submitted = await collected.awaitModalSubmit({ time: 2 * 60 * 1000, filter: m => m.user.id === interaction.user.id }).catch(() => null);
                if (!submitted) {
                  try { await i.followUp({ content: 'Tempo esgotado ao preencher o modal.', ephemeral: true }); } catch {}
                  return;
                }
                const label = submitted.fields.getTextInputValue('b_label') || 'Ação';
                const webhookUrl = submitted.fields.getTextInputValue('b_webhook') || null;
                existing.buttons = existing.buttons || [];
                existing.buttons.push({ type: 'webhook', label, webhookUrl, style: chosen });
                await submitted.reply({ content: 'Botão (Webhook) adicionado.', ephemeral: true }).catch(()=>{});
                await refreshPanel();
                return;
              } catch (err) {
                console.error('Erro ao coletar estilo e criar webhook button:', err);
                return i.reply({ content: 'Erro ao criar botão webhook.', ephemeral: true });
              }
            } catch (err) {
              console.error('Erro ao adicionar botão webhook:', err);
              return i.reply({ content: 'Erro ao adicionar botão.', ephemeral: true });
            }
            return;
          }

          // PREVIEW
          if (action === 'message_preview') {
            if (!session.container) return i.update({ content: 'Nenhum container para pré-visualizar.', ephemeral: true, components: makeRows(id) }).catch(() => {});
            try {
              const ch = await interaction.client.channels.fetch(session.channelId);
              if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
              const c = session.container;
              const e = new EmbedBuilder();
              if (c.authorName) e.setAuthor({ name: c.authorName, iconURL: c.authorIcon || undefined });
              if (c.title) {
                if (c.titleLarge) {
                  const descParts = [];
                  descParts.push(`**${c.title}**`);
                  if (c.description) descParts.push('\n' + c.description);
                  e.setDescription(descParts.join('\n\n'));
                } else {
                  e.setTitle(c.title);
                  if (c.description) e.setDescription(c.description);
                }
              } else if (c.description) {
                e.setDescription(c.description);
              }
              if (c.titleUrl && !c.titleLarge) e.setURL(c.titleUrl);
              if (c.thumbnail) e.setThumbnail(c.thumbnail);
              if (c.image) e.setImage(c.image);
              if (c.imageText || c.footerIcon) e.setFooter({ text: c.imageText || '', iconURL: c.footerIcon || undefined });
              if (c.timestamp) e.setTimestamp();
              if (c.fields && Array.isArray(c.fields)) c.fields.slice(0,3).forEach(f => e.addFields({ name: f.name, value: f.value, inline: !!f.inline }));

              // build components from buttons if present
              const components = [];
              if (c.buttons && Array.isArray(c.buttons) && c.buttons.length) {
                const row = new ActionRowBuilder();
                for (let bi = 0; bi < c.buttons.length && bi < 5; bi++) {
                  const b = c.buttons[bi];
                  const btn = new ButtonBuilder().setLabel(b.label || 'Abrir');
                  if (b.type === 'url') {
                    btn.setStyle(ButtonStyle.Link).setURL(b.url);
                  } else if (b.type === 'webhook') {
                    const cid = `message_button_webhook:${session.id}:${bi}`;
                    // map style string to ButtonStyle (preview uses stored style)
                    let pstyle = ButtonStyle.Primary;
                    if (b.style === 'secondary') pstyle = ButtonStyle.Secondary;
                    else if (b.style === 'success') pstyle = ButtonStyle.Success;
                    else if (b.style === 'danger') pstyle = ButtonStyle.Danger;
                    btn.setStyle(pstyle).setCustomId(cid);
                    try {
                      if (!interaction.client.messageButtonHooks) interaction.client.messageButtonHooks = new Map();
                      const key = `${session.id}:${bi}`;
                      interaction.client.messageButtonHooks.set(key, b.webhookUrl);
                      // preview-only: do not persist preview mappings to disk
                    } catch (e) { console.error('Erro ao registrar webhook mapping:', e); }
                  } else {
                    btn.setStyle(ButtonStyle.Secondary).setCustomId(`message_button:${session.id}:${bi}`);
                  }
                  row.addComponents(btn);
                }
                components.push(row);
              }

              await ch.send({ content: `Pré-visualização (por ${interaction.user.tag}):`, embeds: [e], components }).catch(() => {});
              await i.update({ content: 'Pré-visualização enviada no canal padrão.', components: makeRows(id) }).catch(() => {});
            } catch (err) {
              console.error('preview error', err);
              await i.update({ content: 'Falha ao enviar pré-visualização.', components: makeRows(id) }).catch(() => {});
            }
            return;
          }

          // SEND
          if (action === 'message_send') {
            if (!session.container) return i.update({ content: 'Nenhum container para enviar.', ephemeral: true, components: makeRows(id) }).catch(() => {});
            try {
              const ch = await interaction.client.channels.fetch(session.channelId);
              if (!ch || !ch.isTextBased()) throw new Error('Canal inválido');
              const c = session.container;
              const e = new EmbedBuilder();
              if (c.authorName) e.setAuthor({ name: c.authorName, iconURL: c.authorIcon || undefined });
              if (c.title) {
                if (c.titleLarge) {
                  const descParts = [];
                  descParts.push(`**${c.title}**`);
                  if (c.description) descParts.push('\n' + c.description);
                  e.setDescription(descParts.join('\n\n'));
                } else {
                  e.setTitle(c.title);
                  if (c.description) e.setDescription(c.description);
                }
              } else if (c.description) {
                e.setDescription(c.description);
              }
              if (c.titleUrl && !c.titleLarge) e.setURL(c.titleUrl);
              if (c.thumbnail) e.setThumbnail(c.thumbnail);
              if (c.image) e.setImage(c.image);
              if (c.imageText || c.footerIcon) e.setFooter({ text: c.imageText || '', iconURL: c.footerIcon || undefined });
              if (c.timestamp) e.setTimestamp();
              if (c.fields && Array.isArray(c.fields)) c.fields.slice(0,3).forEach(f => e.addFields({ name: f.name, value: f.value, inline: !!f.inline }));
              // build components from buttons if present (for sending)
              const components = [];
              if (c.buttons && Array.isArray(c.buttons) && c.buttons.length) {
                const row = new ActionRowBuilder();
                for (let bi = 0; bi < c.buttons.length && bi < 5; bi++) {
                  const b = c.buttons[bi];
                  const btn = new ButtonBuilder().setLabel(b.label || 'Abrir');
                  if (b.type === 'url') btn.setStyle(ButtonStyle.Link).setURL(b.url);
                  else if (b.type === 'webhook') {
                    // map style for webhook buttons (use stored style or default)
                    let s = ButtonStyle.Primary;
                    if (b.style === 'secondary') s = ButtonStyle.Secondary;
                    else if (b.style === 'success') s = ButtonStyle.Success;
                    else if (b.style === 'danger') s = ButtonStyle.Danger;
                    const cid = `message_button_webhook:${session.id}:${bi}`;
                    btn.setStyle(s).setCustomId(cid);
                    try {
                      if (!interaction.client.messageButtonHooks) interaction.client.messageButtonHooks = new Map();
                      const key = `${session.id}:${bi}`;
                      interaction.client.messageButtonHooks.set(key, b.webhookUrl);
                      _saveButtonHook(key, b.webhookUrl);
                    } catch(e) { console.error(e); }
                  } else btn.setStyle(ButtonStyle.Secondary).setCustomId(`message_button:${session.id}:${bi}`);
                  row.addComponents(btn);
                }
                components.push(row);
              }

              const sent = await ch.send({ embeds: [e], components }).catch(() => null);
              // After sending, if there are webhook buttons, update their customIds to reference the sent message id
              if (sent && c.buttons && Array.isArray(c.buttons) && c.buttons.length) {
                try {
                  const newRow = new ActionRowBuilder();
                  for (let bi = 0; bi < c.buttons.length && bi < 5; bi++) {
                    const b = c.buttons[bi];
                    const btn = new ButtonBuilder().setLabel(b.label || 'Abrir');
                    if (b.type === 'url') btn.setStyle(ButtonStyle.Link).setURL(b.url);
                    else if (b.type === 'webhook') {
                      // map stored style to actual ButtonStyle for the final message
                      let s = ButtonStyle.Primary;
                      if (b.style === 'secondary') s = ButtonStyle.Secondary;
                      else if (b.style === 'success') s = ButtonStyle.Success;
                      else if (b.style === 'danger') s = ButtonStyle.Danger;
                      const key = `${sent.id}:${bi}`;
                      btn.setStyle(s).setCustomId(`message_button_webhook:${sent.id}:${bi}`);
                      try { if (!interaction.client.messageButtonHooks) interaction.client.messageButtonHooks = new Map(); interaction.client.messageButtonHooks.set(key, b.webhookUrl); _saveButtonHook(key, b.webhookUrl); } catch(e) { console.error(e); }
                    } else btn.setStyle(ButtonStyle.Secondary).setCustomId(`message_button:${sent.id}:${bi}`);
                    newRow.addComponents(btn);
                  }
                  await sent.edit({ components: [newRow] }).catch(()=>{});
                } catch (err) {
                  console.error('Erro ao atualizar customIds de botões após envio:', err);
                }
              }

              await i.update({ content: 'Mensagem enviada.', embeds: [], components: [] }).catch(() => {});
              collector.stop('sent');
            } catch (err) {
              console.error('send error', err);
              await i.update({ content: 'Erro ao enviar (permissões/canal).', ephemeral: true, components: makeRows(id) }).catch(() => {});
            }
            return;
          }

          // CANCEL
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

      collector.on('end', () => { try { panel.edit({ content: 'Sessão finalizada.', embeds: [], components: [] }); } catch (e) { } });

    } catch (err) {
      console.error('Erro em /message.execute:', err);
      if (!interaction.replied) await interaction.reply({ content: 'Erro interno.', ephemeral: true });
    }
  }
};

