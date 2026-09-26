// The hash of a frame. One definition. The harness and the tick both import it.
//
// Bytes: two FNV-1a lanes. Every double is split into its two little-endian
// 32-bit words; the low word feeds lane 0, the high word feeds lane 1. Words
// and text go to both lanes. The digest is the two lanes as sixteen hex digits.
// This is the function the slice 1 golden hash was written with. Changing it
// moves fixtures/golden.txt, and that is the only legitimate reason to run
// write-golden.
//
// Arithmetic here is integer only (Math.imul, shifts, xor). The doubles it
// reads are produced by the caller with add, subtract, multiply, divide, and
// square root, the five operations ECMAScript specifies exactly.

/**
 * @returns {import('./types.js').Hasher}
 */
export function createHasher() {
  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const view = new DataView(buf);
  let h0 = 0x811c9dc5;
  let h1 = 0x811c9dc5;

  /**
   * @param {number} h
   * @param {number} word
   */
  function mix(h, word) {
    for (let i = 0; i < 4; i = i + 1) {
      const b = (word >>> (i * 8)) & 255;
      h = Math.imul(h ^ b, 0x01000193) >>> 0;
    }
    return h;
  }

  /** @param {number} w */
  function u32(w) {
    const v = w >>> 0;
    h0 = mix(h0, v);
    h1 = mix(h1, v);
  }

  return {
    /**
     * A byte stream, split across the lanes the way a double is: of every
     * eight bytes, the first four feed lane 0 and the last four lane 1. For a
     * stream of little-endian doubles that is exactly what `float` does with
     * each. A stream fed through `u32` one byte at a time would reach both
     * lanes alike, and its digest would have two equal halves: 32 bits, not
     * 64 (S1 pin 13). The frame hash does not call this, so no frame hash moves.
     * @param {Uint8Array} data
     */
    bytes(data) {
      for (let i = 0; i < data.length; i = i + 1) {
        if ((i & 4) === 0) {
          h0 = Math.imul(h0 ^ data[i], 0x01000193) >>> 0;
        } else {
          h1 = Math.imul(h1 ^ data[i], 0x01000193) >>> 0;
        }
      }
    },
    float(x) {
      if (x !== x) {
        return false;
      }
      f64[0] = x;
      h0 = mix(h0, view.getUint32(0, true));
      h1 = mix(h1, view.getUint32(4, true));
      return true;
    },
    u32,
    text(s) {
      u32(s.length);
      for (let i = 0; i < s.length; i = i + 1) {
        u32(s.charCodeAt(i));
      }
    },
    digest() {
      return hex(h0) + hex(h1);
    },
    /**
     * The two lanes as they stand: the whole of the hasher's state. A tick's
     * save carries them (T6 pin 1), so a restored tick hashes on from where
     * the saved one was, not from where it has since run.
     * @returns {[number, number]}
     */
    lanes() {
      return [h0, h1];
    },
    /**
     * Puts back two lanes that lanes() returned. Throws, changing nothing,
     * unless both are whole numbers from 0 through 2^32 - 1.
     * @param {ReadonlyArray<number>} saved
     */
    resume(saved) {
      if (!Array.isArray(saved) || saved.length !== 2 || !saved.every((lane) => Number.isInteger(lane) && lane >= 0 && lane <= 0xffffffff)) {
        throw new Error('resume refused: the lanes are two whole numbers from 0 through 2^32 - 1');
      }
      h0 = saved[0];
      h1 = saved[1];
    },
  };
}

/** @param {number} n */
export function hex(n) {
  let s = (n >>> 0).toString(16);
  while (s.length < 8) {
    s = '0' + s;
  }
  return s;
}
