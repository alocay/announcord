import { z } from 'zod';

export interface Config {
  discordToken: string;
  discordClientId: string;
  awsRegion: string;
  unlimitedGuildIds: ReadonlySet<string>;
  devGuildId: string | undefined;
  dataDir: string;
  idleLeaveSeconds: number;
  cacheMaxMb: number;
  logLevel: string;
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const required = z.string().min(1);
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  DISCORD_TOKEN: required,
  DISCORD_CLIENT_ID: required,
  // Read by the AWS SDK straight from the environment; checked here only so a
  // missing credential fails at startup instead of on the first announcement.
  AWS_ACCESS_KEY_ID: required,
  AWS_SECRET_ACCESS_KEY: required,
  AWS_REGION: z.string().default('us-east-1'),
  UNLIMITED_GUILD_IDS: z.string().default(''),
  DEV_GUILD_ID: z.string().optional(),
  DATA_DIR: z.string().default('./data'),
  IDLE_LEAVE_SECONDS: positiveInt(60),
  CACHE_MAX_MB: positiveInt(200),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  // An empty value in a .env file means "not set".
  const present = Object.fromEntries(
    Object.keys(schema.shape)
      .map((key) => [key, env[key]] as const)
      .filter(([, value]) => value !== undefined && value !== ''),
  );

  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    // Report variable names only; never echo values, which may be secrets.
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} is missing or invalid`),
    );
  }

  const values = parsed.data;
  return {
    discordToken: values.DISCORD_TOKEN,
    discordClientId: values.DISCORD_CLIENT_ID,
    awsRegion: values.AWS_REGION,
    unlimitedGuildIds: new Set(
      values.UNLIMITED_GUILD_IDS.split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
    devGuildId: values.DEV_GUILD_ID,
    dataDir: values.DATA_DIR,
    idleLeaveSeconds: values.IDLE_LEAVE_SECONDS,
    cacheMaxMb: values.CACHE_MAX_MB,
    logLevel: values.LOG_LEVEL,
  };
}
