import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type SlashCommandBooleanOption,
  type SlashCommandStringOption,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';

// Discord's own cap is generous; the real limits (which exclude %name) are
// enforced in validation.ts so the user gets a clear message.
const MAX_INPUT = 400;

const OVERRIDE_FIELDS = [
  { name: 'voice', value: 'voice' },
  { name: 'enter message', value: 'enter' },
  { name: 'exit message', value: 'exit' },
  { name: 'pronunciation', value: 'pronounce' },
] as const;
const EVERYTHING = { name: 'everything', value: 'all' } as const;

// Autocomplete can only show 25 of the ~100 voices, so point at the full list.
const VOICE_HINT = 'Type to search. /announce voices lists them all';

const voiceOption = (option: SlashCommandStringOption) =>
  option.setName('voice').setDescription(VOICE_HINT).setRequired(true).setAutocomplete(true);

const enabledOption = (description: string) => (option: SlashCommandBooleanOption) =>
  option.setName('enabled').setDescription(description).setRequired(true);

const textOption = (description: string) => (option: SlashCommandStringOption) =>
  option.setName('text').setDescription(description).setRequired(true).setMaxLength(MAX_INPUT);

const channelSubcommand =
  (name: string, description: string) => (sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName(name)
      .setDescription(description)
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Voice channel')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildVoice),
      );

const announce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Control how you are announced in voice channels')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('voice')
      .setDescription('Choose the voice that announces you')
      .addStringOption(voiceOption),
  )
  .addSubcommand((sub) =>
    sub
      .setName('enter')
      .setDescription('Set what is said when you join. Use %name for your name')
      .addStringOption(textOption('For example: %name has arrived')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('exit')
      .setDescription('Set what is said when you leave. Use %name for your name')
      .addStringOption(textOption('For example: %name has left the building')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('pronounce')
      .setDescription('Set how your name is spoken')
      .addStringOption(textOption('Your name, spelled the way it sounds')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('sneak')
      .setDescription('Join and leave without being announced')
      .addBooleanOption(enabledOption('True to sneak, False to be announced again')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('clear')
      .setDescription('Remove one of your personal settings')
      .addStringOption((option) =>
        option
          .setName('field')
          .setDescription('What to remove')
          .setRequired(true)
          .addChoices(...OVERRIDE_FIELDS, EVERYTHING),
      ),
  )
  .addSubcommand((sub) => sub.setName('show').setDescription('Show your personal settings'))
  .addSubcommand((sub) =>
    sub.setName('preview').setDescription('Hear and see how you will be announced'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('voices')
      .setDescription('List the available voices')
      .addStringOption((option) =>
        option
          .setName('language')
          .setDescription('Language name or code, for example "en-US" or "Spanish"')
          .setMaxLength(50),
      ),
  );

const announceAdmin = new SlashCommandBuilder()
  .setName('announce-admin')
  .setDescription('Configure voice announcements for this server')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('style')
      .setDescription('Choose whether joins, exits or both are announced')
      .addStringOption((option) =>
        option
          .setName('style')
          .setDescription('What to announce')
          .setRequired(true)
          .addChoices(
            { name: 'joins only', value: 'join' },
            { name: 'exits only', value: 'exit' },
            { name: 'joins and exits', value: 'both' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('ignore-empty')
      .setDescription('Skip announcements when nobody else is in the channel')
      .addBooleanOption(enabledOption('On or off')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('sneaking')
      .setDescription('Allow members to hide their own joins and leaves')
      .addBooleanOption(enabledOption('True to allow sneaking, False to announce everyone')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('voice')
      .setDescription('Choose the default voice for this server')
      .addStringOption(voiceOption),
  )
  .addSubcommand((sub) =>
    sub
      .setName('template')
      .setDescription('Set the default join or exit message. Use %name for the member name')
      .addStringOption((option) =>
        option
          .setName('kind')
          .setDescription('Which message')
          .setRequired(true)
          .addChoices({ name: 'enter', value: 'enter' }, { name: 'exit', value: 'exit' }),
      )
      .addStringOption(textOption('For example: %name has entered the channel')),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('channel')
      .setDescription('Choose which voice channels are announced')
      .addSubcommand(channelSubcommand('allow', 'Announce only in allowed channels'))
      .addSubcommand(channelSubcommand('deny', 'Never announce in this channel'))
      .addSubcommand(channelSubcommand('unlist', 'Remove the rule for this channel')),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('user')
      .setDescription("Manage another member's personal settings")
      .addSubcommand((sub) =>
        sub
          .setName('set')
          .setDescription('Set a personal setting for a member')
          .addUserOption((option) =>
            option.setName('member').setDescription('The member').setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('field')
              .setDescription('What to set')
              .setRequired(true)
              .addChoices(...OVERRIDE_FIELDS),
          )
          .addStringOption((option) =>
            option
              .setName('value')
              .setDescription('Voice name, message text or pronunciation')
              .setRequired(true)
              .setMaxLength(MAX_INPUT),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('clear')
          .setDescription('Remove a personal setting from a member')
          .addUserOption((option) =>
            option.setName('member').setDescription('The member').setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('field')
              .setDescription('What to remove')
              .setRequired(true)
              .addChoices(...OVERRIDE_FIELDS, EVERYTHING),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('silence')
          .setDescription('Stop announcing a member. They cannot undo it')
          .addUserOption((option) =>
            option.setName('member').setDescription('The member').setRequired(true),
          )
          .addBooleanOption(enabledOption('True to silence, False to lift it')),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('settings').setDescription('Show the announcement settings for this server'),
  )
  .addSubcommand((sub) =>
    sub.setName('reset').setDescription('Restore the default settings for this server'),
  );

export const commandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  announce.toJSON(),
  announceAdmin.toJSON(),
];
