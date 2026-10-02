export const MAX_TEMPLATE = 150;
export const MAX_PRONUNCIATION = 50;
export const NAME_PLACEHOLDER = '%name';

export type Validated = { ok: true; value: string } | { ok: false; error: string };

// <@123> <@!123> <@&123> <#123> <:name:123> <a:name:123>
const DISCORD_TOKENS = /<(?:@[!&]?|#)\d+>|<a?:\w+:\d+>/g;
const MARKUP_CHARS = /[<>&]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Reduces user-supplied text to something safe and sensible to speak. Text is
 * always sent to the TTS provider as plain text; removing markup characters
 * here means it could not be interpreted as SSML even if that ever changed.
 */
export function sanitizeSpoken(text: string): string {
  return text
    .replace(DISCORD_TOKENS, ' ')
    .replace(MARKUP_CHARS, '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the text contains at least one letter or digit a voice could say. */
export function isSpeakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function validateTemplate(input: string): Validated {
  const value = sanitizeSpoken(input);
  if (!value) return { ok: false, error: 'The message cannot be empty.' };

  const length = value.split(NAME_PLACEHOLDER).join('').length;
  if (length > MAX_TEMPLATE) {
    return {
      ok: false,
      error: `The message is too long. The limit is ${MAX_TEMPLATE} characters, not counting \`${NAME_PLACEHOLDER}\`.`,
    };
  }
  return { ok: true, value };
}

export function validatePronunciation(input: string): Validated {
  const value = sanitizeSpoken(input);
  if (!isSpeakable(value)) {
    return { ok: false, error: 'The pronunciation needs at least one letter or number.' };
  }
  if (value.length > MAX_PRONUNCIATION) {
    return {
      ok: false,
      error: `The pronunciation is too long. The limit is ${MAX_PRONUNCIATION} characters.`,
    };
  }
  return { ok: true, value };
}
