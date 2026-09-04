/**
 * UUID v4 sin dependencias externas. Única copia en la app.
 * Usa Math.random: para una clave de dedup (colisión ~2^-122) alcanza y no es
 * un secreto. ponytail: si algún día se usa para algo sensible, cambiar a
 * expo-crypto (getRandomValues).
 */
export function generateUUIDv4(): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}