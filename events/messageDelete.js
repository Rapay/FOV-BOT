module.exports = {
  name: 'messageDelete',
  async execute(message) {
    try {
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(__dirname, '..', 'data', 'message_buttons.json');
      // remove persisted mappings that reference this message id
      if (fs.existsSync(dbPath)) {
        try {
          const raw = fs.readFileSync(dbPath, 'utf8') || '{}';
          const obj = JSON.parse(raw);
          const prefix = `${message.id}:`;
          let removed = 0;
          for (const k of Object.keys(obj)) {
            if (k.startsWith(prefix)) {
              delete obj[k];
              removed++;
            }
          }
          if (removed > 0) {
            fs.writeFileSync(dbPath, JSON.stringify(obj, null, 2), 'utf8');
            console.log(`messageDelete cleanup: removed ${removed} persisted button hook(s) for message ${message.id}`);
          }
        } catch (e) {
          console.error('Erro lendo/escrevendo message_buttons.json durante cleanup:', e);
        }
      }

      // remove from in-memory map as well
      try {
        const client = message.client;
        if (client && client.messageButtonHooks) {
          const keys = Array.from(client.messageButtonHooks.keys());
          let removedMem = 0;
          for (const k of keys) {
            if (k.startsWith(`${message.id}:`)) {
              client.messageButtonHooks.delete(k);
              removedMem++;
            }
          }
          if (removedMem > 0) console.log(`messageDelete cleanup: removed ${removedMem} in-memory hook(s) for message ${message.id}`);
        }
      } catch (e) {
        console.error('Erro ao limpar client.messageButtonHooks em memory:', e);
      }
    } catch (err) {
      console.error('Erro no handler messageDelete (cleanup):', err);
    }
  }
};
