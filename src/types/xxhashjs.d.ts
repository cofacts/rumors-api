declare module 'xxhashjs' {
  interface Hasher {
    update(input: string | ArrayBuffer): Hasher;
    digest(): {
      toString(radix?: number): string;
    };
  }

  export function h64(seed?: number): Hasher;
  export function h32(seed?: number): Hasher;
}
