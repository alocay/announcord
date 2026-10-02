import { PollyClient } from '@aws-sdk/client-polly';
import { describe, expect, it } from 'vitest';
import { PollyProvider } from '../../src/tts/pollyProvider.js';

// Talks to the real Polly API and costs a few characters. Run with:
//   POLLY_LIVE_TEST=1 AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... npm test
const live = process.env.POLLY_LIVE_TEST === '1';

/** Splits an Ogg stream into its packets. */
function oggPackets(ogg: Buffer): Buffer[] {
  const packets: Buffer[] = [];
  let pending: Buffer[] = [];
  let offset = 0;

  while (offset + 27 <= ogg.length && ogg.toString('latin1', offset, offset + 4) === 'OggS') {
    const segmentCount = ogg.readUInt8(offset + 26);
    const lacing = ogg.subarray(offset + 27, offset + 27 + segmentCount);
    let data = offset + 27 + segmentCount;
    for (const length of lacing) {
      pending.push(ogg.subarray(data, data + length));
      data += length;
      if (length < 255) {
        packets.push(Buffer.concat(pending));
        pending = [];
      }
    }
    offset = data;
  }
  return packets;
}

/** Duration in ms of one Opus packet, from its TOC byte (RFC 6716 section 3.1). */
function opusPacketMs(packet: Buffer): number {
  const toc = packet.readUInt8(0);
  const config = toc >> 3;
  const frameMs =
    config < 12
      ? [10, 20, 40, 60][config % 4]!
      : config < 16
        ? [10, 20][config % 2]!
        : [2.5, 5, 10, 20][config % 4]!;
  const code = toc & 0b11;
  const frames = code === 0 ? 1 : code === 3 ? packet.readUInt8(1) & 0x3f : 2;
  return frameMs * frames;
}

describe.skipIf(!live)('Polly (live)', () => {
  it('returns Ogg/Opus in 20 ms packets, which Discord can play untouched', async () => {
    const provider = new PollyProvider(
      new PollyClient({ region: process.env.AWS_REGION ?? 'us-east-1' }),
    );

    const clip = await provider.synthesize('Armando has entered the channel', 'Matthew');
    const packets = oggPackets(clip);

    expect(clip.toString('latin1', 0, 4)).toBe('OggS');
    expect(packets[0]?.toString('latin1', 0, 8)).toBe('OpusHead');
    // Packets 0 and 1 are the Opus headers; audio starts at 2.
    const durations = new Set(packets.slice(2, 12).map(opusPacketMs));
    expect([...durations]).toEqual([20]);
  });
});
