import { describe, expect, it } from 'vitest';
import { PollyProvider, type PollySender } from '../../src/tts/pollyProvider.js';

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

function voice(id: string, engines: string[], languageCode = 'en-US') {
  return {
    Id: id,
    Name: id,
    LanguageCode: languageCode,
    LanguageName: languageCode === 'en-US' ? 'US English' : 'Castilian Spanish',
    SupportedEngines: engines,
  };
}

function stubClient(options: { pages?: unknown[][]; audio?: Uint8Array | null } = {}) {
  const pages = options.pages ?? [
    [voice('Matthew', ['neural', 'standard']), voice('Ivy', ['standard'])],
  ];
  const sent: SentCommand[] = [];
  const client: PollySender = {
    async send(command) {
      const name = command.constructor.name;
      const input = command.input as Record<string, unknown>;
      sent.push({ name, input });

      if (name === 'DescribeVoicesCommand') {
        const index = input.NextToken ? Number(input.NextToken) : 0;
        return {
          Voices: pages[index],
          NextToken: index + 1 < pages.length ? String(index + 1) : undefined,
        };
      }
      const audio = options.audio === undefined ? new Uint8Array([1, 2, 3]) : options.audio;
      return {
        AudioStream: audio ? { transformToByteArray: async () => audio } : undefined,
      };
    },
  };
  return { client, sent };
}

describe('PollyProvider', () => {
  it('lists voices across every page of results', async () => {
    const { client } = stubClient({
      pages: [[voice('Matthew', ['neural'])], [voice('Lucia', ['neural'], 'es-ES')]],
    });

    const voices = await new PollyProvider(client).listVoices();

    expect(voices).toEqual([
      { id: 'Lucia', name: 'Lucia', languageCode: 'es-ES', languageName: 'Castilian Spanish' },
      { id: 'Matthew', name: 'Matthew', languageCode: 'en-US', languageName: 'US English' },
    ]);
  });

  it('leaves out voices that only support premium-priced engines', async () => {
    const { client } = stubClient({
      pages: [[voice('Matthew', ['neural']), voice('Pricey', ['long-form', 'generative'])]],
    });

    const voices = await new PollyProvider(client).listVoices();

    expect(voices.map((v) => v.id)).toEqual(['Matthew']);
  });

  it('asks Polly for the voice list only once within a day', async () => {
    const { client, sent } = stubClient();
    let now = 0;
    const provider = new PollyProvider(client, () => now);

    await provider.listVoices();
    now = 23 * 60 * 60 * 1000;
    await provider.listVoices();
    expect(sent).toHaveLength(1);

    now = 25 * 60 * 60 * 1000;
    await provider.listVoices();
    expect(sent).toHaveLength(2);
  });

  it('keeps serving the last known voices when a refresh fails', async () => {
    const { client } = stubClient();
    let now = 0;
    const provider = new PollyProvider(client, () => now);
    const first = await provider.listVoices();

    now = 25 * 60 * 60 * 1000;
    client.send = async () => {
      throw new Error('network down');
    };

    expect(await provider.listVoices()).toEqual(first);
  });

  it('prefers the neural engine and falls back to standard', async () => {
    const provider = new PollyProvider(stubClient().client);

    expect(await provider.engineFor('Matthew')).toBe('neural');
    expect(await provider.engineFor('Ivy')).toBe('standard');
  });

  it('requests plain-text Ogg/Opus speech with the engine the voice supports', async () => {
    const { client, sent } = stubClient();

    const clip = await new PollyProvider(client).synthesize('<speak>hi</speak>', 'Ivy');

    expect(clip).toEqual(Buffer.from([1, 2, 3]));
    expect(sent.at(-1)).toEqual({
      name: 'SynthesizeSpeechCommand',
      input: {
        Engine: 'standard',
        OutputFormat: 'ogg_opus',
        Text: '<speak>hi</speak>',
        TextType: 'text',
        VoiceId: 'Ivy',
      },
    });
  });

  it('fails when Polly returns no audio', async () => {
    const { client } = stubClient({ audio: null });

    await expect(new PollyProvider(client).synthesize('hi', 'Matthew')).rejects.toThrow(/no audio/i);
  });

  it('fails when Polly returns empty audio', async () => {
    const { client } = stubClient({ audio: new Uint8Array() });

    await expect(new PollyProvider(client).synthesize('hi', 'Matthew')).rejects.toThrow(/no audio/i);
  });
});
