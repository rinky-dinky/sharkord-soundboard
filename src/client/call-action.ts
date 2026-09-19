// The host's executePluginAction now dispatches by plugin id (pluginId, actionName, payload)
// instead of just (actionName, payload), so this plugin's own id has to be supplied on every call.
const PLUGIN_ID = 'sharkord-soundboard';

const callPluginAction = <TResponse = unknown>(
  actionName: string,
  payload?: unknown
): Promise<TResponse> =>
  window.__SHARKORD_STORE__.actions.executePluginAction<TResponse>(PLUGIN_ID, actionName, payload);

export { callPluginAction };
