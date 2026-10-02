export interface Voice {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
}

/**
 * A text-to-speech backend. Everything above this interface is provider
 * agnostic, so a second backend only needs to implement these four members.
 */
export interface TtsProvider {
  readonly id: string;
  listVoices(): Promise<Voice[]>;
  /** The engine `synthesize` will use for this voice; part of the cache key. */
  engineFor(voiceId: string): Promise<string>;
  /** Returns an Ogg/Opus clip of the plain text spoken by the voice. */
  synthesize(text: string, voiceId: string): Promise<Buffer>;
}
