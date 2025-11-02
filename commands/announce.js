const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const templatesPath = path.join(__dirname, '..', 'data', 'announce_templates.json');
if (!fs.existsSync(path.join(__dirname, '..', 'data'))) fs.mkdirSync(path.join(__dirname, '..', 'data'));
if (!fs.existsSync(templatesPath)) fs.writeFileSync(templatesPath, JSON.stringify({ guilds: {} }, null, 2));
const configPath = path.join(__dirname, '..', 'data', 'config.json');
if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ staffRoleId: null, ticketCategoryId: null, transcriptChannelId: null, faqChannelId: null, announceRoleIds: [] }, null, 2));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Enviar um anúncio embed em um canal')
    .addSubcommand(sub => sub.setName('send').setDescription('Enviar anúncio com opções completas')
      .addChannelOption(opt => opt.setName('channel').setDescription('Canal para enviar o anúncio').setRequired(true))
      .addStringOption(opt => opt.setName('title').setDescription('Título do embed').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Descrição do embed').setRequired(true))
      .addBooleanOption(opt => opt.setName('spoiler').setDescription('Marcar descrição como spoiler?').setRequired(false))
      .addBooleanOption(opt => opt.setName('promo').setDescription('Marcar como promoção (sugere destaque)').setRequired(false))
      .addStringOption(opt => opt.setName('image').setDescription('URL de imagem para o embed').setRequired(false))
      .addStringOption(opt => opt.setName('thumbnail').setDescription('URL de thumbnail para o embed').setRequired(false))
      .addStringOption(opt => opt.setName('color').setDescription('Cor (hex sem # ou nome) do embed, ex: FF0000 ou BLUE').setRequired(false))
      .addStringOption(opt => opt.setName('footer').setDescription('Texto de rodapé do embed').setRequired(false))
      .addStringOption(opt => opt.setName('author_name').setDescription('Nome do autor exibido no embed').setRequired(false))
      .addStringOption(opt => opt.setName('author_icon').setDescription('URL do ícone do autor').setRequired(false))
      .addStringOption(opt => opt.setName('url').setDescription('URL para o título do embed').setRequired(false))
      .addRoleOption(opt => opt.setName('role').setDescription('Cargo para mencionar no envio').setRequired(false))
      .addBooleanOption(opt => opt.setName('mentioneveryone').setDescription('Mencionar @everyone no envio?').setRequired(false))
      .addStringOption(opt => opt.setName('button_label').setDescription('Texto do botão de ação (opcional)').setRequired(false))
      .addStringOption(opt => opt.setName('button_url').setDescription('URL do botão de ação (opcional)').setRequired(false))
      .addBooleanOption(opt => opt.setName('pin').setDescription('Fixar mensagem após enviar?').setRequired(false))
      .addIntegerOption(opt => opt.setName('delay').setDescription('Atraso para envio em minutos (0 = imediato, max 1440)').setRequired(false))
      .addBooleanOption(opt => opt.setName('preview').setDescription('Mostrar apenas uma prévia ephemera para você (não envia no canal)').setRequired(false)))
    .addSubcommandGroup(group => group.setName('template').setDescription('Gerenciar templates de anúncio')
      .addSubcommand(sub => sub.setName('save').setDescription('Salvar um template').addStringOption(o=>o.setName('name').setDescription('Nome do template').setRequired(true)).addStringOption(o=>o.setName('title').setDescription('Título').setRequired(false)).addStringOption(o=>o.setName('description').setDescription('Descrição').setRequired(false)).addStringOption(o=>o.setName('image').setDescription('Imagem').setRequired(false)).addStringOption(o=>o.setName('thumbnail').setDescription('Thumbnail').setRequired(false)).addStringOption(o=>o.setName('color').setDescription('Cor').setRequired(false)).addStringOption(o=>o.setName('footer').setDescription('Footer').setRequired(false)).addStringOption(o=>o.setName('author_name').setDescription('Author name').setRequired(false)).addStringOption(o=>o.setName('author_icon').setDescription('Author icon').setRequired(false)).addStringOption(o=>o.setName('url').setDescription('Title URL').setRequired(false)).addStringOption(o=>o.setName('button_label').setDescription('Button label').setRequired(false)).addStringOption(o=>o.setName('button_url').setDescription('Button URL').setRequired(false)).addBooleanOption(o=>o.setName('mentioneveryone').setDescription('Mention everyone').setRequired(false)).addRoleOption(o=>o.setName('role').setDescription('Role to mention').setRequired(false)))
      .addSubcommand(sub => sub.setName('list').setDescription('Listar templates'))
      .addSubcommand(sub => sub.setName('use').setDescription('Usar template e preparar anúncio').addStringOption(o=>o.setName('name').setDescription('Nome do template').setRequired(true)).addChannelOption(o=>o.setName('channel').setDescription('Canal para enviar (opcional)').setRequired(false)))
      .addSubcommand(sub => sub.setName('delete').setDescription('Deletar template').addStringOption(o=>o.setName('name').setDescription('Nome do template').setRequired(true))))
    .addSubcommandGroup(group => group.setName('config').setDescription('Configurar permissões do announce')
      .addSubcommand(sub => sub.setName('addrole').setDescription('Adicionar role permitido').addRoleOption(o=>o.setName('role').setDescription('Role a adicionar').setRequired(true)))
      .addSubcommand(sub => sub.setName('removerole').setDescription('Remover role permitido').addRoleOption(o=>o.setName('role').setDescription('Role a remover').setRequired(true)))
      .addSubcommand(sub => sub.setName('listroles').setDescription('Listar roles permitidos')))

,
  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    // handle template subcommand group
    if (group === 'template') {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const templatesDb = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
      if (!templatesDb.guilds[guildId]) templatesDb.guilds[guildId] = {};

      if (sub === 'save') {
        const name = interaction.options.getString('name');
        const fields = {};
        const possible = ['title','description','image','thumbnail','color','footer','author_name','author_icon','url','button_label','button_url'];
        for (const k of possible) {
          const v = interaction.options.getString(k);
          if (v !== null && v !== undefined) fields[k] = v;
        }
        const mentionEveryoneVal = interaction.options.getBoolean('mentioneveryone');
        if (mentionEveryoneVal !== null && mentionEveryoneVal !== undefined) fields.mentioneveryone = !!mentionEveryoneVal;
        const role = interaction.options.getRole('role');
        if (role) fields.role = role.id;
        templatesDb.guilds[guildId][name] = { savedAt: new Date().toISOString(), fields };
        fs.writeFileSync(templatesPath, JSON.stringify(templatesDb, null, 2));
        return interaction.reply({ content: `Template '${name}' salvo.`, ephemeral: true });
      }

      if (sub === 'list') {
        const names = Object.keys(templatesDb.guilds[guildId] || {});
        if (names.length === 0) return interaction.reply({ content: 'Nenhum template salvo.', ephemeral: true });
        return interaction.reply({ content: `Templates: ${names.join(', ')}`, ephemeral: true });
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name');
        if (!templatesDb.guilds[guildId] || !templatesDb.guilds[guildId][name]) return interaction.reply({ content: 'Template não encontrado.', ephemeral: true });
        delete templatesDb.guilds[guildId][name];
        fs.writeFileSync(templatesPath, JSON.stringify(templatesDb, null, 2));
        return interaction.reply({ content: `Template '${name}' removido.`, ephemeral: true });
      }

      if (sub === 'use') {
        const name = interaction.options.getString('name');
        const tpl = templatesDb.guilds[guildId] && templatesDb.guilds[guildId][name];
        if (!tpl) return interaction.reply({ content: 'Template não encontrado.', ephemeral: true });
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

        const data = tpl.fields || {};
        const embed = new EmbedBuilder().setTitle(data.title || '');
        if (data.description) embed.setDescription(data.description);
        if (data.image) try { embed.setImage(data.image); } catch {}
        if (data.thumbnail) try { embed.setThumbnail(data.thumbnail); } catch {}
        if (data.author_name) embed.setAuthor({ name: data.author_name, iconURL: data.author_icon || undefined });
        if (data.url) try { embed.setURL(data.url); } catch {}
        if (data.footer) embed.setFooter({ text: data.footer });
        if (data.color) try { embed.setColor(data.color); } catch {}

        const mentionEveryone = data.mentioneveryone === 'true' || data.mentioneveryone === true;
        const roleId = data.role || null;
        let content = '';
        if (mentionEveryone) content += '@everyone';
        if (roleId) content += (content ? ' ' : '') + `<@&${roleId}>`;

        const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
        const payload = { channelId: channel.id, content: content || null, embed: embed.toJSON(), authorId: interaction.user.id, buttonLabel: data.button_label || null, buttonUrl: data.button_url || null, pin: false, delayMinutes: 0 };
        interaction.client.pendingAnnounces.set(id, payload);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`announce_confirm:${id}`).setLabel('Confirmar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`announce_cancel:${id}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ content: 'Template carregado — confirme o envio:', embeds: [embed], components: [row], ephemeral: true });
      }
    }

    if (group === 'config') {
      const sub = interaction.options.getSubcommand();
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (sub === 'addrole') {
        if (!interaction.member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Apenas administradores podem configurar.', ephemeral: true });
        const role = interaction.options.getRole('role');
        cfg.announceRoleIds = cfg.announceRoleIds || [];
        if (!cfg.announceRoleIds.includes(role.id)) cfg.announceRoleIds.push(role.id);
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        return interaction.reply({ content: `Role ${role} adicionada às permissões de announce.`, ephemeral: true });
      }
      if (sub === 'removerole') {
        if (!interaction.member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Apenas administradores podem configurar.', ephemeral: true });
        const role = interaction.options.getRole('role');
        cfg.announceRoleIds = cfg.announceRoleIds || [];
        cfg.announceRoleIds = cfg.announceRoleIds.filter(r => r !== role.id);
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        return interaction.reply({ content: `Role ${role} removida das permissões de announce.`, ephemeral: true });
      }
      if (sub === 'listroles') {
        const ids = cfg.announceRoleIds || [];
        if (ids.length === 0) return interaction.reply({ content: 'Nenhuma role configurada (fallback: Manage Messages ou Admin têm permissão).', ephemeral: true });
        const mentions = ids.map(id => `<@&${id}>`).join(', ');
        return interaction.reply({ content: `Roles permitidos: ${mentions}`, ephemeral: true });
      }
    }

    // normal announce flow continues
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const spoiler = interaction.options.getBoolean('spoiler') || false;
    const promo = interaction.options.getBoolean('promo') || false;
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');
    const color = interaction.options.getString('color');
    const footer = interaction.options.getString('footer');
    const authorName = interaction.options.getString('author_name');
    const authorIcon = interaction.options.getString('author_icon');
    const titleUrl = interaction.options.getString('url');
    const role = interaction.options.getRole('role');
    const mentionEveryone = interaction.options.getBoolean('mentioneveryone') || false;
    const buttonLabel = interaction.options.getString('button_label');
    const buttonUrl = interaction.options.getString('button_url');
    const pin = interaction.options.getBoolean('pin') || false;
    const delay = interaction.options.getInteger('delay') || 0;
    const preview = interaction.options.getBoolean('preview') || false;

    // validações
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'Canal inválido.', ephemeral: true });

    // permissões: verificar config first (announceRoleIds) então fallback para ManageMessages/Admin
    const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (cfg.announceRoleIds && cfg.announceRoleIds.length > 0) {
      const hasRole = cfg.announceRoleIds.some(rid => interaction.member.roles.cache.has(rid));
      if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
    } else {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'Você não tem permissão para usar este comando. (Manage Messages ou Administrator necessário)', ephemeral: true });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(title + (promo ? ' 🔥' : ''))
      .setDescription(spoiler ? `||${description}||` : description)
      .setTimestamp();

    if (image) try { embed.setImage(image); } catch {}
    if (thumbnail) try { embed.setThumbnail(thumbnail); } catch {}
    if (titleUrl) try { embed.setURL(titleUrl); } catch {}
    if (authorName) embed.setAuthor({ name: authorName, iconURL: authorIcon || undefined });
    if (footer) embed.setFooter({ text: footer });

    if (color) {
      const hex = color.replace('#', '').toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) embed.setColor(`#${hex}`);
      else try { embed.setColor(color.toUpperCase()); } catch {}
    }

    // Preview rápido
    if (preview) {
      let previewContent = '';
      if (mentionEveryone) previewContent += '@everyone';
      if (role) previewContent += (previewContent ? ' ' : '') + `<@&${role.id}>`;
      const components = [];
      if (buttonLabel && buttonUrl) components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(buttonLabel).setStyle(ButtonStyle.Link).setURL(buttonUrl)));
      return interaction.reply({ content: previewContent || undefined, embeds: [embed], components, ephemeral: true });
    }

    // Conteúdo (menções)
    let content = '';
    if (mentionEveryone) content += '@everyone';
    if (role) content += (content ? ' ' : '') + `<@&${role.id}>`;

    // Criar payload pendente para confirmação
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const payload = { channelId: channel.id, content: content || null, embed: embed.toJSON(), authorId: interaction.user.id, buttonLabel: buttonLabel || null, buttonUrl: buttonUrl || null, pin: !!pin, delayMinutes: delay };
    interaction.client.pendingAnnounces.set(id, payload);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`announce_confirm:${id}`).setLabel('Confirmar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`announce_cancel:${id}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: 'Confirme o envio do anúncio (ou cancele):', embeds: [embed], components: [row], ephemeral: true });
  }
};
