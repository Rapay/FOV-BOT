module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Bot online como ${client.user.tag}`);
    // Auto-deploy commands on ready if requested via env
    try {
      if (process.env.DEPLOY_ON_READY === 'true' || process.env.DEPLOY_ON_READY === '1') {
        console.log('Variável DEPLOY_ON_READY definida -> atualizando comandos...');
        const deploy = require('../deploy-commands');
        if (typeof deploy === 'function') {
          await deploy();
          console.log('Deploy de comandos finalizado (ready).');
        } else if (deploy && typeof deploy.deployCommands === 'function') {
          await deploy.deployCommands();
          console.log('Deploy de comandos finalizado (ready).');
        } else {
          console.log('Módulo de deploy de comandos não exporta função. Ignorando.');
        }
      }
    } catch (err) {
      console.error('Erro ao executar deploy de comandos on ready:', err);
    }

    // If a restart was requested by the /restart command, notify the requester privately and clear marker
    try {
      const fs = require('fs');
      const p = './data/restart.json';
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          const info = JSON.parse(raw);
          if (info && info.requestedBy && info.requestedBy.id) {
            try {
              const user = await client.users.fetch(info.requestedBy.id).catch(()=>null);
              const when = new Date(info.when || Date.now()).toLocaleString();
              const msg = info.message || `Bot reiniciado (solicitado por ${info.requestedBy ? info.requestedBy.tag : 'alguém'})`;
              if (user) {
                await user.send({ content: `✅ ${msg} — ${when}` }).catch(()=>{});
              }
            } catch (e) { console.error('Erro ao enviar DM de restart:', e); }
          }
        } catch (e) { console.error('Erro ao processar restart marker:', e); }
        try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
      }
    } catch (e) { console.error('Erro verificando marker de restart:', e); }
  }
};
