// Minimal, single-file /message command implementation
const { SlashCommandBuilder: SCB, EmbedBuilder: EB, ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BStyle, ModalBuilder: MB, TextInputBuilder: TIB, TextInputStyle: TIS, PermissionFlagsBits: PFB } = require('discord.js');
const FS = require('fs');
const PATH = require('path');

const DB = PATH.join(__dirname, '..', 'data', 'message_buttons.json');
function saveHook(k, u) {
  try {
    let d = {};
    if (FS.existsSync(DB)) {
      try { d = JSON.parse(FS.readFileSync(DB, 'utf8') || '{}'); } catch { d = {}; }
    }
    d[k] = u;
    FS.writeFileSync(DB, JSON.stringify(d, null, 2), 'utf8');
  } catch (e) { console.error('saveHook failed', e); }
}

function normalizeStyleInput(s) {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  if (v === 'primary' || v === 'p') return 'Primary';
  if (v === 'secondary' || v === 'sec' || v === 's') return 'Secondary';
  if (v === 'success' || v === 'green') return 'Success';
  if (v === 'danger' || v === 'red') return 'Danger';
  if (v === 'link' || v === 'url') return 'Link';
  return null;
}
function mapButtonStyle(s) {
  if (!s) return BStyle.Primary;
  const k = String(s).toLowerCase();
  if (k === 'primary') return BStyle.Primary;
  if (k === 'secondary') return BStyle.Secondary;
  if (k === 'success') return BStyle.Success;
  if (k === 'danger') return BStyle.Danger;
  if (k === 'link') return BStyle.Link;
  return BStyle.Primary;
}

function normalizeHexColor(input) {
  if (!input) return null;
  let v = String(input).trim();
  if (v.startsWith('#')) v = v.slice(1);
  // accept 3 or 6 hex digits
  if (!/^[0-9a-fA-F]{3}$/.test(v) && !/^[0-9a-fA-F]{6}$/.test(v)) return null;
  if (v.length === 3) {
    // expand shorthand e.g. 'f00' -> 'ff0000'
    v = v.split('').map(c => c + c).join('');
  }
  return '#' + v.toLowerCase();
}

function mapHexToStyle(hex) {
  if (!hex) return null;
  // hex expected as #rrggbb
  try {
    let v = String(hex).trim();
    if (v.startsWith('#')) v = v.slice(1);
    const r = parseInt(v.slice(0,2),16);
    const g = parseInt(v.slice(2,4),16);
    const b = parseInt(v.slice(4,6),16);
    // choose dominant color
    if (g > r && g > b) return BStyle.Success; // green
    if (r > g && r > b) return BStyle.Danger; // red
    if (b > r && b > g) return BStyle.Primary; // blue
    // fallback
    return BStyle.Secondary;
  } catch (e) { return null; }
}

module.exports = {
  data: new SCB().setName('message').setDescription('Criar mensagem simples').addChannelOption(o => o.setName('channel').setDescription('Canal (opcional)').setRequired(false)),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PFB.ManageMessages) && !interaction.member.permissions.has(PFB.Administrator)) return interaction.reply({ content: 'Você não tem permissão.', ephemeral: true });
    const target = interaction.options.getChannel('channel') || interaction.channel;
    if (!target || !target.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

    const sid = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const session = { id: sid, author: interaction.user.id, channelId: target.id, container: null };

    const controls = (k) => [new ARB().addComponents(
      new BB().setCustomId(`add:${k}`).setLabel('➕ Adicionar').setStyle(BStyle.Primary),
      new BB().setCustomId(`clear:${k}`).setLabel('🧹 Limpar').setStyle(BStyle.Secondary),
      new BB().setCustomId(`preview:${k}`).setLabel('👁️ Pré-visualizar').setStyle(BStyle.Secondary),
      new BB().setCustomId(`send:${k}`).setLabel('✅ Enviar').setStyle(BStyle.Success),
      new BB().setCustomId(`cancel:${k}`).setLabel('❌ Cancelar').setStyle(BStyle.Danger)
    )];

    const panelE = new EB().setTitle('Criar mensagem (simples)').setDescription('Use ➕ Adicionar para criar conteúdo. Envie imagem somente se usar Upload (DM).');
  const panel = await interaction.reply({ embeds: [panelE], components: controls(sid), fetchReply: true, ephemeral: true });

    const refresh = async () => {
      console.log(`[message] refresh called for session ${sid} (container=${!!session.container})`);
      const e = new EB();
      if (!session.container) e.setTitle('Sem conteúdo').setDescription('Clique em ➕ Adicionar');
      else {
        const c = session.container;
        if (c.title) e.setTitle(c.title);
        if (c.description) e.setDescription(c.description);
        if (c.image) e.setImage(c.image);
        if (c.imageText) e.setFooter({ text: c.imageText });
        if (c.color) {
          try { e.setColor(c.color); } catch (e2) { /* ignore invalid */ }
        }
        if (c.buttons && c.buttons.length) e.addFields({ name: 'Botões', value: `${c.buttons.length} adicionados`, inline: false });
      }
      try {
        const base = controls(sid);
        // if a container exists, show the optional actions in a second row so the main collector handles them
          if (session.container) {
          const extra = new ARB().addComponents(
            new BB().setCustomId(`uploaddm:${sid}`).setLabel('📤 Upload (DM)').setStyle(BStyle.Primary),
            new BB().setCustomId(`addbtn:${sid}`).setLabel('➕ Adicionar Botão').setStyle(BStyle.Secondary),
            new BB().setCustomId(`managebtns:${sid}`).setLabel('🔧 Gerenciar Botões').setStyle(BStyle.Secondary),
            new BB().setCustomId(`done:${sid}`).setLabel('✅ Concluído').setStyle(BStyle.Success)
          );
          base.push(extra);
        }
        // no webhook option any more: buttons are URL-only
        try {
          // Prefer editing the original interaction reply (works reliably for ephemeral replies)
          if (interaction && typeof interaction.editReply === 'function') {
            await interaction.editReply({ embeds: [e], components: base });
          } else {
            await panel.edit({ embeds: [e], components: base });
          }
        } catch (err) {
          console.error('[message] failed to update panel via editReply/panel.edit', err);
          try { await interaction.followUp({ content: 'Falha ao atualizar o painel (verifique logs).', ephemeral: true }); } catch {}
        }
      } catch {}
    };

    const coll = panel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 10*60*1000 });
    coll.on('collect', async i => {
      try {
        const [act, k] = i.customId.split(':');
        if (k !== sid) return i.reply({ content: 'Sessão inválida', ephemeral: true });

        if (act === 'add') {
          const modal = new MB().setCustomId(`modal_add:${sid}`).setTitle('Adicionar');
          modal.addComponents(
            new ARB().addComponents(new TIB().setCustomId('t_title').setLabel('Título').setStyle(TIS.Short).setRequired(false)),
            new ARB().addComponents(new TIB().setCustomId('t_desc').setLabel('Descrição').setStyle(TIS.Paragraph).setRequired(false)),
            new ARB().addComponents(new TIB().setCustomId('t_imgtext').setLabel('Legenda (opcional)').setStyle(TIS.Short).setRequired(false)),
            new ARB().addComponents(new TIB().setCustomId('t_color').setLabel('Cor do embed (hex, ex: #ff0000)').setStyle(TIS.Short).setRequired(false))
          );
          try {
            await i.showModal(modal);
            const sub = await i.awaitModalSubmit({ time: 2*60*1000, filter: m => m.user.id === interaction.user.id });
            const title = sub.fields.getTextInputValue('t_title') || null;
            const description = sub.fields.getTextInputValue('t_desc') || null;
            const imageText = sub.fields.getTextInputValue('t_imgtext') || null;
            const colorRaw = sub.fields.getTextInputValue('t_color') || null;
            const color = normalizeHexColor(colorRaw);
            session.container = { title, description, image: null, imageText, buttons: [] };
            if (color) session.container.color = color;
            let replyMsg = 'Container criado. Você pode enviar imagem via DM (opcional) ou adicionar botões.';
            if (colorRaw && !color) replyMsg += ' (cor inválida fornecida; será ignorada — use #RRGGBB)';
            else if (color) replyMsg += ` (cor aplicada: ${color})`;
            await sub.reply({ content: replyMsg, ephemeral: true });
            await refresh();
          } catch {}
          return;
        }

        if (act === 'uploaddm') {
          if (!session.container) return i.reply({ content: 'Crie o container primeiro.', ephemeral: true });
          try {
            const user = interaction.user;
            console.log(`[message] uploaddm requested by ${user.id} for session ${sid}`);
            // Inform the panel user that we're attempting to open a DM
            try { await i.reply({ content: 'Tentando abrir DM para upload. Se suas DMs estiverem bloqueadas, o bot não conseguirá enviar.', ephemeral: true }); } catch {}
            let dm;
            try {
              dm = await user.createDM();
            } catch (err) {
              console.error('[message] createDM failed', err);
              try { await i.followUp({ content: 'Não foi possível abrir DM — verifique suas configurações de privacidade.', ephemeral: true }); } catch {}
              return;
            }

            // Send DM with Confirm and Cancel buttons so the user can confirm or abort the upload
            const confirmRow = new ARB().addComponents(
              new BB().setCustomId(`dm_confirm:${sid}`).setLabel('📤 Confirmar upload').setStyle(BStyle.Primary),
              new BB().setCustomId(`dm_cancel:${sid}`).setLabel('❌ Cancelar').setStyle(BStyle.Danger)
            );
            let dmMsg;
            try {
              dmMsg = await dm.send({ content: 'Envie abaixo a imagem que deseja usar. Quando terminar, clique em **Confirmar upload** para aplicar ou em **Cancelar** para abortar.', components: [confirmRow] });
              console.log(`[message] DM sent to ${user.id} for session ${sid}`);
            } catch (err) {
              console.error('[message] dm.send failed', err);
              try { await i.followUp({ content: 'Erro ao enviar DM — verifique se o bot pode enviar mensagens diretas para você.', ephemeral: true }); } catch {}
              return;
            }

            // Always require a NEW upload: clear any previous pendingImage and do NOT inspect older DM messages.
            session.pendingImage = null;

            // Collect messages with attachments (wait for user to upload a NEW image). No timeout — user will confirm or cancel.
            const imgUrlRegex = /(https?:\/\/.+\.(?:png|jpe?g|gif|webp))(?:\?.*)?$/i;
            const dcoll = dm.createMessageCollector({ filter: m => {
              if (m.author.id !== user.id) return false;
              if (m.attachments && m.attachments.size>0) return true;
              // also accept GIFs or images posted as embeds (e.g., GIPHY links)
              if (m.embeds && m.embeds.length>0) {
                return m.embeds.some(e => (e.type === 'gifv' || e.type === 'image' || !!(e.image && e.image.url) || !!(e.thumbnail && e.thumbnail.url) || !!e.url));
              }
              // accept plain image links in message content
              if (m.content && imgUrlRegex.test(m.content.trim())) return true;
              return false;
            } });
            dcoll.on('collect', async m => {
              // store pending image, only apply on explicit confirm
              let url = null;
              if (m.attachments && m.attachments.size>0) url = m.attachments.first().url;
              else if (m.embeds && m.embeds.length>0) {
                const e = m.embeds.find(e2 => (e2.type === 'gifv' || e2.type === 'image' || !!(e2.image && e2.image.url) || !!(e2.thumbnail && e2.thumbnail.url) || !!e2.url));
                if (e) url = e.image?.url || e.thumbnail?.url || e.url || null;
              }
              // if still no url, check for a plain url in content
              if (!url && m.content) {
                const match = m.content.trim().match(imgUrlRegex);
                if (match) url = match[1];
              }
              if (url) {
                session.pendingImage = url;
                console.log(`[message] DM upload received for session ${sid}: ${url}`);
                try { await dm.send('Imagem recebida. Clique em **Confirmar upload** para aplicá-la, ou em **Cancelar** para abortar.'); } catch {}
                await refresh();
              } else {
                try { await dm.send('Não consegui detectar uma imagem válida no que você enviou. Envie um arquivo de imagem/GIF.'); } catch {}
              }
            });

            // Collector for the confirm/cancel buttons in DM
            const compColl = dmMsg.createMessageComponentCollector({ filter: b => b.user.id === user.id });
            compColl.on('collect', async btnI => {
              try {
                await btnI.deferUpdate();
                const [prefix, id] = btnI.customId.split(':'); // e.g. 'dm_confirm', sid
                if (id !== sid) return; // ignore other sessions
                const action = prefix && prefix.split('_')[1]; // 'confirm' or 'cancel'
                if (action === 'confirm') {
                  if (session.pendingImage) {
                    console.log(`[message] DM confirm pressed for session ${sid}, applying image ${session.pendingImage}`);
                    session.container.image = session.pendingImage;
                    delete session.pendingImage;
                    try { await dm.send('Upload confirmado. Imagem aplicada.'); } catch {}
                    try { await i.followUp({ content: 'Imagem aplicada.', ephemeral: true }); } catch {}
                    try { await dmMsg.edit({ components: [ new ARB().addComponents(new BB().setCustomId('dm_confirm_disabled').setLabel('✔️ Confirmado').setStyle(BStyle.Success).setDisabled(true), new BB().setCustomId('dm_cancel_disabled').setLabel('Cancelado').setStyle(BStyle.Secondary).setDisabled(true)) ] }); } catch {}
                    // stop collectors
                    try { dcoll.stop(); } catch {}
                    try { compColl.stop(); } catch {}
                    await refresh();
                    return;
                  } else {
                    // fallback: try to fetch recent messages from the DM channel to find a recently sent image
                    try {
                      const chan = btnI.channel;
                      if (chan && chan.messages && typeof chan.messages.fetch === 'function') {
                        const recent = await chan.messages.fetch({ limit: 30 });
                        // iterate in chronological order (newest first)
                        let found = null;
                        for (const m of recent.values()) {
                          if (m.author && m.author.id !== user.id) continue;
                          if (m.attachments && m.attachments.size>0) { found = m.attachments.first().url; break; }
                          if (m.embeds && m.embeds.length>0) {
                            const e = m.embeds.find(e2 => (e2.type === 'gifv' || e2.type === 'image' || !!(e2.image && e2.image.url) || !!(e2.thumbnail && e2.thumbnail.url) || !!e2.url));
                            if (e) { found = e.image?.url || e.thumbnail?.url || e.url || null; if (found) break; }
                          }
                          const imgMatch = (m.content || '').trim().match(/(https?:\/\/.+\.(?:png|jpe?g|gif|webp))(?:\?.*)?$/i);
                          if (imgMatch) { found = imgMatch[1]; break; }
                        }
                        if (found) {
                          console.log(`[message] found recent DM image for session ${sid}: ${found}`);
                          session.container.image = found;
                          try { await dm.send('Upload confirmado (via fallback). Imagem aplicada.'); } catch {}
                          try { await i.followUp({ content: 'Imagem aplicada (via fallback).', ephemeral: true }); } catch {}
                          try { await dmMsg.edit({ components: [ new ARB().addComponents(new BB().setCustomId('dm_confirm_disabled').setLabel('✔️ Confirmado').setStyle(BStyle.Success).setDisabled(true), new BB().setCustomId('dm_cancel_disabled').setLabel('Cancelado').setStyle(BStyle.Secondary).setDisabled(true)) ] }); } catch {}
                          try { dcoll.stop(); } catch {}
                          try { compColl.stop(); } catch {}
                          await refresh();
                          return;
                        }
                      }
                    } catch (err) { console.error('confirm fallback fetch err', err); }
                    try { await btnI.followUp({ content: 'Nenhuma imagem nova encontrada. Envie a imagem na DM antes de confirmar.', ephemeral: true }); } catch {}
                    return;
                  }
                }
                if (action === 'cancel') {
                  // clear pending and abort
                  session.pendingImage = null;
                  try { await dm.send('Upload cancelado.'); } catch {}
                  try { await i.followUp({ content: 'Upload cancelado.', ephemeral: true }); } catch {}
                  try { await dmMsg.edit({ components: [ new ARB().addComponents(new BB().setCustomId('dm_confirm_disabled').setLabel('Confirmar').setStyle(BStyle.Primary).setDisabled(true), new BB().setCustomId('dm_cancel_disabled').setLabel('✔️ Cancelado').setStyle(BStyle.Danger).setDisabled(true)) ] }); } catch {}
                  try { dcoll.stop(); } catch {}
                  try { compColl.stop(); } catch {}
                  return;
                }
              } catch (err) { console.error('dm confirm err', err); }
            });
            compColl.on('end', () => { try { dmMsg.edit({ components: [ new ARB().addComponents(new BB().setCustomId('dm_confirm_timeout').setLabel('Tempo esgotado').setStyle(BStyle.Secondary).setDisabled(true)) ] }); } catch {} });

          } catch (err) { console.error('DM upload error', err); return i.reply({ content: 'Não foi possível abrir DM.', ephemeral: true }); }
          return;
        }
        
        if (act === 'addbtn') {
          if (!session.container) return i.reply({ content: 'Crie o container primeiro.', ephemeral: true });
          // Directly open the URL button style chooser and modal (no webhook option)
          try { await i.deferUpdate(); } catch {}
          const styleRow = new ARB().addComponents(
            new BB().setCustomId(`addbtn_style:${sid}:primary`).setLabel('Primary').setStyle(BStyle.Primary),
            new BB().setCustomId(`addbtn_style:${sid}:secondary`).setLabel('Secondary').setStyle(BStyle.Secondary),
            new BB().setCustomId(`addbtn_style:${sid}:success`).setLabel('Success').setStyle(BStyle.Success),
            new BB().setCustomId(`addbtn_style:${sid}:danger`).setLabel('Danger').setStyle(BStyle.Danger),
            new BB().setCustomId(`addbtn_style:${sid}:link`).setLabel('Link').setStyle(BStyle.Link)
          );
          const replyMsg = await i.followUp({ content: 'Escolha o estilo do botão (Link ignora cor):', components: [styleRow], ephemeral: true, fetchReply: true });
          const selColl = replyMsg.createMessageComponentCollector({ filter: b => b.user.id === interaction.user.id, max:1, time:2*60*1000 });
          selColl.on('collect', async selI => {
            try {
              const parts = selI.customId.split(':');
              const chosen = parts[2] || 'primary';
              // open modal to collect label/url/hex
              const modal = new MB().setCustomId(`modal_btn_url:${sid}`).setTitle('Botão URL');
              modal.addComponents(
                new ARB().addComponents(new TIB().setCustomId('lbl').setLabel('Rótulo').setStyle(TIS.Short).setRequired(true)),
                new ARB().addComponents(new TIB().setCustomId('url').setLabel('URL').setStyle(TIS.Short).setRequired(true)),
                new ARB().addComponents(new TIB().setCustomId('b_hex').setLabel('Hex do botão (opcional, ex: #ff0000)').setStyle(TIS.Short).setRequired(false))
              );
              await selI.showModal(modal);
              try {
                const sub = await selI.awaitModalSubmit({ time:2*60*1000, filter: m => m.user.id===interaction.user.id });
                session.container.buttons = session.container.buttons||[];
                const rawHex = sub.fields.getTextInputValue('b_hex') || null;
                const hex = normalizeHexColor(rawHex);
                const styleName = (chosen === 'link') ? 'Link' : (chosen.charAt(0).toUpperCase() + chosen.slice(1));
                session.container.buttons.push({ type:'url', label: sub.fields.getTextInputValue('lbl'), url: sub.fields.getTextInputValue('url'), style: styleName, hex });
                if (hex) session.container.color = hex;
                await sub.reply({ content:'Botão URL adicionado.', ephemeral:true });
                await refresh();
              } catch {}
            } catch (err) { console.error('addbtn style select err', err); }
          });
          return;
        }

        if (act === 'managebtns') {
          if (!session.container || !session.container.buttons || session.container.buttons.length === 0) return i.reply({ content: 'Nenhum botão para gerenciar.', ephemeral: true });
          try {
            const { StringSelectMenuBuilder } = require('discord.js');
            const options = session.container.buttons.map((b, idx) => ({ label: b.label || `btn${idx}`, value: String(idx), description: 'URL' }));
            const sel = new StringSelectMenuBuilder().setCustomId(`manage_buttons_select:${sid}`).setPlaceholder('Selecione o botão para editar...').addOptions(options).setMinValues(1).setMaxValues(1);
            const row = new ARB().addComponents(sel);
            const replyMsg = await i.reply({ content: 'Escolha o botão a editar:', components: [row], ephemeral: true, fetchReply: true });

            const selColl = replyMsg.createMessageComponentCollector({ filter: c => c.user.id === interaction.user.id, max: 1, time: 2*60*1000 });
            selColl.on('collect', async selI => {
              try {
                await selI.deferUpdate();
                const idx = Number(selI.values[0]);
                const btn = session.container.buttons[idx];
                const actionRow = new ARB().addComponents(
                  new BB().setCustomId(`manage_edit:${sid}:${idx}`).setLabel('✏️ Editar').setStyle(BStyle.Primary),
                  new BB().setCustomId(`manage_delete:${sid}:${idx}`).setLabel('🗑️ Remover').setStyle(BStyle.Danger)
                );
                const follow = await selI.followUp({ content: `Botão selecionado: ${btn.label||idx}`, components: [actionRow], ephemeral: true, fetchReply: true });
                const actColl = follow.createMessageComponentCollector({ filter: c2 => c2.user.id === interaction.user.id, max:1, time: 2*60*1000 });
                actColl.on('collect', async ai => {
                  const parts = ai.customId.split(':');
                  const subact = parts[0];
                  const bIdx = Number(parts[2]);
                  if (subact === 'manage_delete') {
                    session.container.buttons.splice(bIdx,1);
                    try { await ai.update({ content: 'Botão removido.', components: [] }); } catch {}
                    await refresh();
                    return;
                  }
                  if (subact === 'manage_edit') {
                    const targetBtn = session.container.buttons[bIdx];
                    if (!targetBtn) return ai.reply({ content: 'Botão inexistente.', ephemeral: true });
                    if (targetBtn.type === 'url') {
                      const modal = new MB().setCustomId(`modal_edit_url:${sid}:${bIdx}`).setTitle('Editar Botão URL');
                      modal.addComponents(
                        new ARB().addComponents(new TIB().setCustomId('lbl').setLabel('Rótulo').setStyle(TIS.Short).setRequired(true)),
                        new ARB().addComponents(new TIB().setCustomId('url').setLabel('URL').setStyle(TIS.Short).setRequired(true)),
                        new ARB().addComponents(new TIB().setCustomId('b_hex').setLabel('Hex do botão (opcional, ex: #ff0000)').setStyle(TIS.Short).setRequired(false))
                      );
                      await ai.showModal(modal);
                      try {
                        const res = await ai.awaitModalSubmit({ time:2*60*1000, filter: m => m.user.id === interaction.user.id });
                        targetBtn.label = res.fields.getTextInputValue('lbl');
                        targetBtn.url = res.fields.getTextInputValue('url');
                        const rawHex = res.fields.getTextInputValue('b_hex') || null;
                        targetBtn.hex = normalizeHexColor(rawHex);
                        // if user edited the button hex, apply it to the container embed color as well
                        if (targetBtn.hex) session.container.color = targetBtn.hex;
                        await res.reply({ content: 'Botão atualizado.', ephemeral: true });
                        await refresh();
                      } catch {}
                    }
                  }
                });
              } catch (err) { console.error('selColl collect err', err); }
            });
            return;
          } catch (err) { console.error('managebtns err', err); return i.reply({ content: 'Erro ao abrir gerenciador.', ephemeral: true }); }
        }

        if (act === 'btn_url') {
          // Ask user to choose a style first via ephemeral buttons, then open modal to collect label/url/hex
          try { await i.deferUpdate(); } catch {}
          const styleRow = new ARB().addComponents(
            new BB().setCustomId(`btn_url_style:${sid}:primary`).setLabel('Primary').setStyle(BStyle.Primary),
            new BB().setCustomId(`btn_url_style:${sid}:secondary`).setLabel('Secondary').setStyle(BStyle.Secondary),
            new BB().setCustomId(`btn_url_style:${sid}:success`).setLabel('Success').setStyle(BStyle.Success),
            new BB().setCustomId(`btn_url_style:${sid}:danger`).setLabel('Danger').setStyle(BStyle.Danger),
            new BB().setCustomId(`btn_url_style:${sid}:link`).setLabel('Link').setStyle(BStyle.Link)
          );
          const replyMsg = await i.followUp({ content: 'Escolha o estilo do botão (Link ignora cor):', components: [styleRow], ephemeral: true, fetchReply: true });
          const selColl = replyMsg.createMessageComponentCollector({ filter: b => b.user.id === interaction.user.id, max:1, time:2*60*1000 });
          selColl.on('collect', async selI => {
            try {
              const parts = selI.customId.split(':');
              const chosen = parts[2] || 'primary';
              // open modal to collect label/url/hex
              const modal = new MB().setCustomId(`modal_btn_url:${sid}`).setTitle('Botão URL');
              modal.addComponents(
                new ARB().addComponents(new TIB().setCustomId('lbl').setLabel('Rótulo').setStyle(TIS.Short).setRequired(true)),
                new ARB().addComponents(new TIB().setCustomId('url').setLabel('URL').setStyle(TIS.Short).setRequired(true)),
                new ARB().addComponents(new TIB().setCustomId('b_hex').setLabel('Hex do botão (opcional, ex: #ff0000)').setStyle(TIS.Short).setRequired(false))
              );
              await selI.showModal(modal);
              try {
                const sub = await selI.awaitModalSubmit({ time:2*60*1000, filter: m => m.user.id===interaction.user.id });
                session.container.buttons = session.container.buttons||[];
                const rawHex = sub.fields.getTextInputValue('b_hex') || null;
                const hex = normalizeHexColor(rawHex);
                const styleName = (chosen === 'link') ? 'Link' : (chosen.charAt(0).toUpperCase() + chosen.slice(1));
                session.container.buttons.push({ type:'url', label: sub.fields.getTextInputValue('lbl'), url: sub.fields.getTextInputValue('url'), style: styleName, hex });
                if (hex) session.container.color = hex;
                await sub.reply({ content:'Botão URL adicionado.', ephemeral:true });
                await refresh();
              } catch {}
            } catch (err) { console.error('btn_url style select err', err); }
          });
          session.awaitingButtonType = false;
          return;
        }

        // webhook option removed

        if (act === 'done') {
          try { await i.reply({ content: 'Concluído.', ephemeral: true }); } catch {}
          session.awaitingButtonType = false;
          await refresh();
          return;
        }

        if (act === 'clear') { session.container = null; await i.reply({ content: 'Container limpo.', ephemeral: true }); await refresh(); return; }
        if (act === 'preview') {
          if (!session.container) return i.reply({ content: 'Nenhum container.', ephemeral: true });
          try {
            const c = session.container;
            const e = new EB();
            if (c.title) e.setTitle(c.title);
            if (c.description) e.setDescription(c.description);
            if (c.image) e.setImage(c.image);
            if (c.imageText) e.setFooter({ text: c.imageText });
            if (c.color) { try { e.setColor(c.color); } catch {} }
            const comps = [];
            if (c.buttons && c.buttons.length) {
              const r = new ARB();
              c.buttons.slice(0,5).forEach((b,i) => {
                // For URL buttons with a hex color, create two buttons in the preview row:
                // 1) a colored proxy (interactive) to show the color, and
                // 2) a Link button that opens the URL directly (so users can still navigate)
                if (b.type === 'url') {
                  if (b.hex) {
                    const proxy = new BB().setLabel(b.label||`btn${i}`);
                    const hexStyle = b.hex ? mapHexToStyle(b.hex) : null;
                    if (hexStyle) proxy.setStyle(hexStyle); else proxy.setStyle(mapButtonStyle(b.style));
                    proxy.setCustomId(`url_preview:${sid}:${i}`);
                    const link = new BB().setLabel('Abrir').setStyle(BStyle.Link);
                    try { link.setURL(b.url||''); } catch {}
                    r.addComponents(proxy, link);
                  } else {
                    const btn = new BB().setLabel(b.label||`btn${i}`);
                    btn.setStyle(BStyle.Link);
                    try { btn.setURL(b.url||b.hook||''); } catch {}
                    r.addComponents(btn);
                  }
                } else {
                  const btn = new BB().setLabel(b.label||`btn${i}`);
                  btn.setStyle(BStyle.Secondary);
                  btn.setCustomId(`btn:${sid}:${i}`);
                  r.addComponents(btn);
                }
              });
              comps.push(r);
            }
            // Send an ephemeral preview to the command user (visible only to them)
            await i.reply({ content: 'Pré-visualização (somente você):', embeds: [e], components: comps, ephemeral: true });
          } catch (err) { console.error(err); try { await i.reply({ content:'Erro na pré-visualização.', ephemeral:true }); } catch {} }
          return;
        }

        if (act === 'send') {
          if (!session.container) return i.reply({ content: 'Nenhum container.', ephemeral: true });
          try {
            const ch = await interaction.client.channels.fetch(session.channelId);
            const c = session.container;
            const e = new EB();
            if (c.title) e.setTitle(c.title);
            if (c.description) e.setDescription(c.description);
            if (c.image) e.setImage(c.image);
            if (c.imageText) e.setFooter({ text: c.imageText });
            if (c.color) { try { e.setColor(c.color); } catch {} }

            // Build components: for webhook buttons we use a temporary customId and will rewrite after sending
            const comps = [];
            if (c.buttons && c.buttons.length) {
              const r = new ARB();
              c.buttons.slice(0,5).forEach((b,i) => {
                // For URL buttons with hex, include both a colored proxy (interactive) and a Link button
                if (b.type === 'url') {
                  if (b.hex) {
                    const proxy = new BB().setLabel(b.label||`btn${i}`);
                    const hexStyle = b.hex ? mapHexToStyle(b.hex) : null;
                    if (hexStyle) proxy.setStyle(hexStyle); else proxy.setStyle(mapButtonStyle(b.style));
                    proxy.setCustomId(`message_button_tmp:${i}`);
                    const link = new BB().setLabel('Abrir').setStyle(BStyle.Link);
                    try { link.setURL(b.url||''); } catch {}
                    r.addComponents(proxy, link);
                  } else {
                    const btn = new BB().setLabel(b.label||`btn${i}`);
                    btn.setStyle(BStyle.Link);
                    try { btn.setURL(b.url||b.hook||''); } catch {}
                    r.addComponents(btn);
                  }
                } else {
                  const btn = new BB().setLabel(b.label||`btn${i}`);
                  btn.setStyle(BStyle.Secondary);
                  btn.setCustomId(`btn:${sid}:${i}`);
                  r.addComponents(btn);
                }
              });
              comps.push(r);
            }

            const sent = await ch.send({ embeds:[e], components:comps });

            // For webhook buttons: persist mapping and update message components to final customIds
            if (sent && c.buttons && c.buttons.length) {
              // load current components, replace tmp ids with message_button_webhook:<messageId>:<idx>
              try {
                const newRows = [];
                const failedPersist = [];
                const fs = require('fs');
                const path = require('path');
                const dbPath = path.join(__dirname, '..', 'data', 'message_buttons.json');
                for (const row of sent.components) {
                  const newRow = ARB.from(row);
                  const comps = newRow.components.map((comp) => {
                    if (comp.customId && comp.customId.startsWith('message_button_tmp:')) {
                      const btnIdx = Number(comp.customId.split(':')[1]);
                      const finalId = `message_button_webhook:${sent.id}:${btnIdx}`;
                      const nb = BB.from(comp).setCustomId(finalId);
                      // persist mapping for url-proxy (only URL buttons are supported now)
                      const btnInfo = c.buttons[btnIdx];
                      try {
                        if (btnInfo && btnInfo.type === 'url' && btnInfo.url) {
                          // store as an object to indicate this is a url-proxy mapping
                          const val = { type: 'url_proxy', url: btnInfo.url };
                          saveHook(`${sent.id}:${btnIdx}`, val);
                          console.log('[message] saved hook mapping', `${sent.id}:${btnIdx}`, JSON.stringify(val));
                        }

                        // verify persistence immediately (best-effort) without awaiting inside map
                        try {
                          if (fs.existsSync(dbPath)) {
                            const raw = fs.readFileSync(dbPath, 'utf8') || '{}';
                            const obj = JSON.parse(raw || '{}');
                            const k = `${sent.id}:${btnIdx}`;
                            if (!Object.prototype.hasOwnProperty.call(obj, k)) {
                              console.error('[message] saveHook verification FAILED for', k);
                              failedPersist.push({ key: k, idx: btnIdx });
                            }
                          }
                        } catch (verr) { console.error('[message] saveHook verification error', verr); }
                      } catch (e) { console.error('saveHook mapping error', e); }
                      return nb;
                    }
                    return comp;
                  });
                  // recreate the row with replaced components
                  const rebuilt = new ARB().addComponents(...comps);
                  newRows.push(rebuilt);
                }
                // If we detected failed persistence, notify the command issuer after edit
                try {
                  await sent.edit({ components: newRows });
                } catch (e) { console.error('Failed to rewrite webhook button IDs', e); }
                if (failedPersist.length > 0) {
                  try {
                    const keys = failedPersist.map(f => f.key).join(', ');
                    try { await interaction.followUp({ content: `Aviso: falha ao persistir ações para botões: ${keys}. Entrarei em fallback.`, ephemeral: true }); } catch (e) { try { await interaction.user.send(`Aviso: falha ao persistir ações para botões: ${keys} na mensagem ${sent.id}.`); } catch {} }
                  } catch (e) { console.error('[message] failed to notify about failedPersist', e); }
                }
              } catch (e) { console.error('Failed to rewrite webhook button IDs', e); }
            }

            await i.reply({ content:'Mensagem enviada.', ephemeral:true }); coll.stop('sent');
          } catch (err) { console.error('send err', err); await i.reply({ content:'Erro ao enviar.', ephemeral:true }); }
          return;
        }

        if (act === 'cancel') { try { await i.update({ content: 'Cancelado.', embeds:[], components:[] }); } catch {} coll.stop('cancel'); return; }
        await i.reply({ content:'Ação desconhecida.', ephemeral:true });
      } catch (err) { console.error('collector', err); }
    });
  coll.on('end', async ()=>{ try { if (interaction && typeof interaction.editReply === 'function') await interaction.editReply({ content:'Sessão encerrada.', embeds:[], components:[] }); else await panel.edit({ content:'Sessão encerrada.', embeds:[], components:[] }); } catch (err) { console.error('collector end edit failed', err); } });
  }
};
