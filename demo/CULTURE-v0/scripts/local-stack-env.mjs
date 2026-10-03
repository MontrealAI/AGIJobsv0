import { parse } from 'dotenv';

export function localStackEnv(inherited, example, fixture, compose) {
  const env = { ...inherited };
  // Compose gives the shell precedence over --env-file. The local stack must
  // use its own fixtures, even when launched from a production operator shell.
  const controlled = new Set([
    ...Object.keys(parse(example)),
    ...Object.keys(parse(fixture)),
    ...Array.from(compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g), (m) => m[1]),
    'COMPOSE_FILE',
    'COMPOSE_PROFILES',
    'COMPOSE_PROJECT_NAME',
  ]);
  for (const key of controlled) delete env[key];
  return {
    ...env,
    CULTURE_LOCAL_FIXTURES: '1',
    CULTURE_ENV_FILE: '.env.local',
    LOCAL_UID: String(process.getuid?.() ?? 1000),
    LOCAL_GID: String(process.getgid?.() ?? 1000),
    CULTURE_DEPLOY_OUTPUT:
      '/workspace/demo/CULTURE-v0/config/deployments.local.json',
  };
}
