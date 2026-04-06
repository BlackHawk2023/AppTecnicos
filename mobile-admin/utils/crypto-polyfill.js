/**
 * Polyfill para el módulo crypto de Node.js
 * Axios intenta importar crypto pero no es necesario en React Native
 */

// Exportar un objeto vacío con las funciones básicas que axios podría necesitar
const crypto = {
  getRandomValues: (array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
  randomUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
  createHash: () => ({
    update: () => ({ digest: () => '' }),
  }),
  createHmac: () => ({
    update: () => ({ digest: () => '' }),
  }),
};

module.exports = crypto;
