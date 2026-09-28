const encoder = new TextEncoder();
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export function randomCode(): string {
  // Rejection sampling avoids modulo bias across the 100 million eight-digit codes.
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= 4_200_000_000);
  return String(bytes[0] % 100_000_000).padStart(8, '0');
}

export async function authDigest(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export function equalDigest(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
