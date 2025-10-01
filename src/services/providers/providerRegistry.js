const registry = new Map();

export const registerProviderClient = (name, client) => {
  if (!name || typeof name !== 'string') {
    throw new Error('Provider name is required');
  }
  registry.set(name.toLowerCase(), client);
};

export const getProviderClient = (name) => {
  if (!name || typeof name !== 'string') return null;
  return registry.get(name.toLowerCase()) || null;
};

export const listRegisteredProviders = () => Array.from(registry.keys());

export default { registerProviderClient, getProviderClient, listRegisteredProviders };
