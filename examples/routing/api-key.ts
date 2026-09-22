/** Same origin-local override convention as the community playground. */
export const KEY_STORAGE = "typesafe-api-key-override";
export function readApiKey(): string { try { return localStorage.getItem(KEY_STORAGE) ?? ""; } catch { return ""; } }
export function saveApiKey(raw: string) {
  const key = raw.trim();
  if (key && (key.length > 1024 || !/^[\x21-\x7e]+$/.test(key))) throw Error("Check the key format.");
  if (key) localStorage.setItem(KEY_STORAGE, key); else localStorage.removeItem(KEY_STORAGE);
}
