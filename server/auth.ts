import { timingSafeEqual } from 'node:crypto';

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export interface PairingService {
  consume(code: string): boolean;
}

export function createPairingService(expectedCode: string): PairingService {
  let consumed = false;
  return {
    consume(code: string): boolean {
      if (consumed || !expectedCode || !constantTimeEqual(code, expectedCode)) return false;
      consumed = true;
      return true;
    },
  };
}
