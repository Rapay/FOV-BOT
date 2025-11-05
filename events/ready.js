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
  }
};
