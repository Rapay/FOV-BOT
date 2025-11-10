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
    const panel = await interaction.reply({ embeds: [panelE], components: controls(sid), fetchReply: true });

    const refresh = async () => {
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
            new BB().setCustomId(`done:${sid}`).setLabel('✅ Concluído').setStyle(BStyle.Success)
          );
          base.push(extra);
        }
        // If we're awaiting the choice of button type, show the URL/webhook options on the panel
        if (session.awaitingButtonType) {
          const choiceRow = new ARB().addComponents(
            new BB().setCustomId(`btn_url:${sid}`).setLabel('URL').setStyle(BStyle.Primary),
            new BB().setCustomId(`btn_hook:${sid}`).setLabel('Webhook').setStyle(BStyle.Success)
          );
          base.push(choiceRow);
        }
        await panel.edit({ embeds: [e], components: base });
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
            const dm = await user.createDM();
            await i.reply({ content: 'Abra DM e envie a imagem (60s).', ephemeral: true });
            await dm.send('Envie a imagem que deseja usar (60s).');
            const recent = await dm.messages.fetch({ limit: 10 }).catch(()=>null);
            if (recent) {
              const found = recent.find(m => m.author.id === user.id && m.attachments && m.attachments.size>0);
              if (found) { session.container.image = found.attachments.first().url; await dm.send('Imagem aplicada.'); await i.followUp({ content: 'Imagem aplicada.', ephemeral: true }); await refresh(); return; }
            }
            const dcoll = dm.createMessageCollector({ filter: m => m.author.id === user.id && m.attachments && m.attachments.size>0, max:1, time:60*1000 });
            dcoll.on('collect', async m => { session.container.image = m.attachments.first().url; try { await dm.send('Imagem recebida.'); } catch{}; try{ await i.followUp({ content: 'Imagem recebida e aplicada.', ephemeral: true }); } catch{}; await refresh(); });
            dcoll.on('end', collected => { if (!collected || collected.size===0) try{ dm.send('Tempo esgotado: nenhuma imagem recebida.'); } catch{} });
          } catch (err) { console.error('DM upload error', err); return i.reply({ content: 'Não foi possível abrir DM.', ephemeral: true }); }
          return;
        }
        if (act === 'addbtn') {
          if (!session.container) return i.reply({ content: 'Crie o container primeiro.', ephemeral: true });
          // Mark that we're awaiting a button-type selection and refresh the panel so the main collector will capture the choice
          try {
            await i.deferUpdate();
          } catch {}
          session.awaitingButtonType = true;
          await refresh();
          return;
        }

        if (act === 'btn_url') {
          const modal = new MB().setCustomId(`modal_btn_url:${sid}`).setTitle('Botão URL');
          modal.addComponents(new ARB().addComponents(new TIB().setCustomId('lbl').setLabel('Rótulo').setStyle(TIS.Short).setRequired(true)), new ARB().addComponents(new TIB().setCustomId('url').setLabel('URL').setStyle(TIS.Short).setRequired(true)));
          await i.showModal(modal);
          try {
            const sub = await i.awaitModalSubmit({ time:2*60*1000, filter: m => m.user.id===interaction.user.id });
            session.container.buttons = session.container.buttons||[];
            session.container.buttons.push({ type:'url', label: sub.fields.getTextInputValue('lbl'), url: sub.fields.getTextInputValue('url'), style: 'link' });
            await sub.reply({ content:'Botão URL adicionado.', ephemeral:true });
            await refresh();
          } catch {}
          session.awaitingButtonType = false;
          return;
        }

        if (act === 'btn_hook') {
          const modal = new MB().setCustomId(`modal_btn_hook:${sid}`).setTitle('Botão Webhook');
          modal.addComponents(new ARB().addComponents(new TIB().setCustomId('lbl').setLabel('Rótulo').setStyle(TIS.Short).setRequired(true)), new ARB().addComponents(new TIB().setCustomId('hook').setLabel('Webhook URL').setStyle(TIS.Short).setRequired(true)), new ARB().addComponents(new TIB().setCustomId('b_style').setLabel('Cor do botão (Primary/Secondary/Success/Danger)').setStyle(TIS.Short).setRequired(false)));
          await i.showModal(modal);
          try { const sub = await i.awaitModalSubmit({ time:2*60*1000, filter: m => m.user.id===interaction.user.id }); session.container.buttons = session.container.buttons||[]; const rawStyle = sub.fields.getTextInputValue('b_style') || 'Primary'; const bstyle = normalizeStyleInput(rawStyle) || 'Primary'; session.container.buttons.push({ type:'webhook', label: sub.fields.getTextInputValue('lbl'), hook: sub.fields.getTextInputValue('hook'), style: bstyle }); await sub.reply({ content:'Botão webhook adicionado.', ephemeral:true }); session.awaitingButtonType = false; await refresh(); } catch {}
          return;
        }

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
            const ch = await interaction.client.channels.fetch(session.channelId);
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
                const btn = new BB().setLabel(b.label||`btn${i}`);
                if (b.type === 'url') {
                  btn.setStyle(BStyle.Link);
                  try { btn.setURL(b.url||b.hook||''); } catch {}
                } else if (b.type === 'webhook') {
                  btn.setStyle(mapButtonStyle(b.style));
                  btn.setCustomId(`hook_preview:${sid}:${i}`);
                } else {
                  btn.setStyle(BStyle.Secondary);
                  btn.setCustomId(`btn:${sid}:${i}`);
                }
                r.addComponents(btn);
              });
              comps.push(r);
            }
            await ch.send({ content:`Pré-visualização por ${interaction.user.tag}:`, embeds:[e], components:comps });
            await i.reply({ content:'Pré-visualização enviada.', ephemeral:true });
          } catch (err) { console.error(err); await i.reply({ content:'Erro na pré-visualização.', ephemeral:true }); }
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
                const btn = new BB().setLabel(b.label||`btn${i}`);
                if (b.type === 'url') {
                  btn.setStyle(BStyle.Link);
                  try { btn.setURL(b.url||b.hook||''); } catch {}
                } else if (b.type === 'webhook') {
                  btn.setStyle(mapButtonStyle(b.style));
                  btn.setCustomId(`message_button_tmp:${i}`);
                } else {
                  btn.setStyle(BStyle.Secondary);
                  btn.setCustomId(`btn:${sid}:${i}`);
                }
                r.addComponents(btn);
              });
              comps.push(r);
            }

            const sent = await ch.send({ embeds:[e], components:comps });

            // For webhook buttons: persist mapping and update message components to final customIds
            if (sent && c.buttons && c.buttons.length) {
              // load current components, replace tmp ids with message_button_webhook:<messageId>:<idx>
              try {
                const newRows = [];
                for (const row of sent.components) {
                  const newRow = ARB.from(row);
                  const comps = newRow.components.map((comp) => {
                    if (comp.customId && comp.customId.startsWith('message_button_tmp:')) {
                      const btnIdx = Number(comp.customId.split(':')[1]);
                      const finalId = `message_button_webhook:${sent.id}:${btnIdx}`;
                      const nb = BB.from(comp).setCustomId(finalId);
                      // persist mapping
                      const hookInfo = c.buttons[btnIdx];
                      if (hookInfo && hookInfo.hook) saveHook(`${sent.id}:${btnIdx}`, hookInfo.hook);
                      return nb;
                    }
                    return comp;
                  });
                  // recreate the row with replaced components
                  const rebuilt = new ARB().addComponents(...comps);
                  newRows.push(rebuilt);
                }
                await sent.edit({ components: newRows });
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
    coll.on('end', ()=>{ try { panel.edit({ content:'Sessão encerrada.', embeds:[], components:[] }); } catch {} });
  }
};
