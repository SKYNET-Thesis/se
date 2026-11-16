const LOCAL_WEB_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function corsOrigins(nodeEnv: string | undefined, configuredOrigins: string | undefined): string[] | false {
  if (nodeEnv === 'production') return configuredOrigins?.split(',').map(origin => origin.trim()).filter(Boolean) ?? false;
  const configured = configuredOrigins?.split(',').map(origin => origin.trim()).filter(Boolean) ?? [];
  if (nodeEnv && nodeEnv !== 'development') return configured.length ? configured : false;
  return [...new Set([...configured, ...LOCAL_WEB_ORIGINS])];
}
