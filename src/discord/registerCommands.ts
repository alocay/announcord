import { REST, Routes } from 'discord.js';
import { commandDefinitions } from '../commands/definitions.js';

// Publishes the slash commands to Discord. Run with `npm run register` after
// changing definitions.ts. With DEV_GUILD_ID set, commands go to that one
// guild and update instantly; without it they are registered globally.
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const devGuildId = process.env.DEV_GUILD_ID || undefined;

if (!token || !clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set.');
  process.exit(1);
}

const rest = new REST().setToken(token);
const route = devGuildId
  ? Routes.applicationGuildCommands(clientId, devGuildId)
  : Routes.applicationCommands(clientId);

try {
  await rest.put(route, { body: commandDefinitions });
  console.log(
    `Registered ${commandDefinitions.length} commands ${devGuildId ? `to guild ${devGuildId}` : 'globally'}.`,
  );
} catch (error) {
  console.error('Failed to register commands:', error instanceof Error ? error.message : error);
  process.exit(1);
}
