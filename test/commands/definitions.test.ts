import {
  ApplicationCommandOptionType as OptionType,
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../../src/commands/definitions.js';

interface Option {
  name: string;
  type: number;
  required?: boolean;
  autocomplete?: boolean;
  channel_types?: number[];
  choices?: Array<{ name: string; value: string }>;
  options?: Option[];
}

function command(name: string) {
  const found = commandDefinitions.find((c) => c.name === name);
  if (!found) throw new Error(`no command ${name}`);
  // Read the registered JSON through a loose shape; the API types are a wide union.
  return found as unknown as {
    default_member_permissions?: string | null;
    options: Option[];
  };
}

/** Finds a subcommand by path, e.g. "channel allow". */
function sub(commandName: string, path: string): Option {
  let options: Option[] = command(commandName).options;
  let found: Option | undefined;
  for (const part of path.split(' ')) {
    found = options.find((o) => o.name === part);
    if (!found) throw new Error(`no subcommand ${path}`);
    options = found.options ?? [];
  }
  return found!;
}

const option = (s: Option, name: string) => s.options?.find((o) => o.name === name);
const values = (o: Option | undefined) => o?.choices?.map((c) => c.value);

describe('commandDefinitions', () => {
  it('defines exactly the two commands', () => {
    expect(commandDefinitions.map((c) => c.name)).toEqual(['announce', 'announce-admin']);
  });

  it('makes both commands usable only inside a server', () => {
    for (const definition of commandDefinitions) {
      expect(definition.contexts).toEqual([InteractionContextType.Guild]);
    }
  });

  it('lets everyone use /announce and limits /announce-admin to Manage Server', () => {
    expect(command('announce').default_member_permissions).toBeUndefined();
    expect(command('announce-admin').default_member_permissions).toBe(
      PermissionFlagsBits.ManageGuild.toString(),
    );
  });

  it('gives /announce every member subcommand', () => {
    expect(command('announce').options.map((o) => o.name)).toEqual([
      'voice',
      'enter',
      'exit',
      'pronounce',
      'clear',
      'show',
      'preview',
      'voices',
    ]);
  });

  it('gives /announce-admin every admin subcommand', () => {
    expect(command('announce-admin').options.map((o) => o.name)).toEqual([
      'style',
      'ignore-empty',
      'voice',
      'template',
      'channel',
      'user',
      'settings',
      'reset',
    ]);
    expect(sub('announce-admin', 'channel').options?.map((o) => o.name)).toEqual([
      'allow',
      'deny',
      'unlist',
    ]);
    expect(sub('announce-admin', 'user').options?.map((o) => o.name)).toEqual(['set', 'clear']);
  });

  it('offers autocomplete on every voice option', () => {
    for (const s of [sub('announce', 'voice'), sub('announce-admin', 'voice')]) {
      expect(option(s, 'voice')).toMatchObject({
        type: OptionType.String,
        required: true,
        autocomplete: true,
      });
    }
  });

  it('restricts channel options to voice channels', () => {
    for (const action of ['allow', 'deny', 'unlist']) {
      expect(option(sub('announce-admin', `channel ${action}`), 'channel')).toMatchObject({
        type: OptionType.Channel,
        required: true,
        channel_types: [ChannelType.GuildVoice],
      });
    }
  });

  it('offers the right choices', () => {
    expect(values(option(sub('announce', 'clear'), 'field'))).toEqual([
      'voice',
      'enter',
      'exit',
      'pronounce',
      'all',
    ]);
    expect(values(option(sub('announce-admin', 'style'), 'style'))).toEqual([
      'join',
      'exit',
      'both',
    ]);
    expect(values(option(sub('announce-admin', 'template'), 'kind'))).toEqual(['enter', 'exit']);
    expect(values(option(sub('announce-admin', 'user set'), 'field'))).toEqual([
      'voice',
      'enter',
      'exit',
      'pronounce',
    ]);
    expect(values(option(sub('announce-admin', 'user clear'), 'field'))).toEqual([
      'voice',
      'enter',
      'exit',
      'pronounce',
      'all',
    ]);
  });

  it('takes a member for the user subcommands', () => {
    for (const action of ['set', 'clear']) {
      expect(option(sub('announce-admin', `user ${action}`), 'member')).toMatchObject({
        type: OptionType.User,
        required: true,
      });
    }
  });

  it('makes the language filter optional', () => {
    expect(option(sub('announce', 'voices'), 'language')?.required ?? false).toBe(false);
  });
});
