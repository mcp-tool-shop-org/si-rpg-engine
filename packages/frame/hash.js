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
