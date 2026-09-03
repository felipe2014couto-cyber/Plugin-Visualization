/**
 * Polyfills e protecoes de ambiente para compatibilidade em navegadores
 * e contextos HTTP nao-seguros (acesso por IP de rede local, ex: http://10.247.140.156:3000).
 */
if (typeof window !== 'undefined') {
  // Evita Uncaught TypeError: Cannot read properties of undefined (reading 'keys')
  // quando o Grafana AppWrapper tenta acessar window.caches em contexto HTTP.
  if (!window.caches) {
    (window as any).caches = {
      keys: async () => [],
      has: async () => false,
      open: async () => ({
        match: async () => undefined,
        matchAll: async () => [],
        add: async () => {},
        addAll: async () => {},
        put: async () => {},
        delete: async () => false,
        keys: async () => [],
      }),
      delete: async () => false,
      match: async () => undefined,
    };
  }

  try {
    // Garante que dynamic imports/chunks sejam buscados na raiz absoluta /public/plugins/pims-vision-app/
    // evitando 404 quando o Grafana esta na subrota /a/pims-vision-app
    (window as any).__webpack_public_path__ = '/public/plugins/pims-vision-app/';
  } catch {}
}

export {};
