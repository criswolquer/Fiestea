import type { LockInfo } from "./types";

/*
 * Password protection for notebooks. The password is never stored: only a
 * PBKDF2 hash with a random salt. This keeps a notebook closed inside the app;
 * it does not encrypt the data stored on the device.
 */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, key, 256);
  return toHex(bits);
}

export async function makeLock(password: string): Promise<LockInfo> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt) };
}

export async function checkLock(lock: LockInfo, password: string): Promise<boolean> {
  return (await derive(password, fromHex(lock.salt))) === lock.hash;
}

/** Notebooks unlocked during this browser session. */
export const unlocked = new Set<string>();
