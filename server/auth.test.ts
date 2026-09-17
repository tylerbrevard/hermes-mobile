import { describe, expect, it } from 'vitest';
import { createPairingService, constantTimeEqual } from './auth.js';

describe('pairing authentication', () => {
  it('accepts the configured code once and rejects reuse', () => {
    const pairing = createPairingService('correct horse battery staple');

    expect(pairing.consume('wrong')).toBe(false);
    expect(pairing.consume('correct horse battery staple')).toBe(true);
    expect(pairing.consume('correct horse battery staple')).toBe(false);
  });

  it('compares codes without early string equality', () => {
    expect(constantTimeEqual('same', 'same')).toBe(true);
    expect(constantTimeEqual('same', 'different')).toBe(false);
    expect(constantTimeEqual('same', 'sam')).toBe(false);
  });
});
