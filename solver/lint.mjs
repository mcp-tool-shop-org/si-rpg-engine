#!/usr/bin/env node
// Refuses a solver binary that carries what the build is supposed to exclude.
//
// Host-chosen results: a relaxed-SIMD instruction (the 0xfd prefix, opcodes
// 0x100 through 0x113, whose results WebAssembly 3.0 lets a host choose); a
// memory.grow (0x40) or table.grow (0xfc 15), whose success the spec leaves to
// the host; a memory whose maximum is absent or differs from its initial size.
//
// State outside linear memory: T2 restores a solver from an image of linear
// memory and the stack pointer, which is the whole state only while the module
// initialises memory with active segments and nothing else. So the lint also
// refuses a start section, a passive data segment, a passive or declared
// element segment, and memory.init, data.drop, table.init, and elem.drop.
//
// The code section is decoded instruction by instruction, not scanned for
// bytes: 0x40 is also the empty block type, an opcode's bytes can appear
// inside any LEB128 immediate, and every LEB128 may be padded. An opcode this
// decoder does not know, including an unlisted 0xfd sub-opcode, is itself a
// refusal, so a binary it cannot read never passes.
//
//   node solver/lint.mjs [file.wasm]
//
// With no file it lints the release build. Exit 0 and one line of facts when
// the binary is clean; exit 1 and one line per reason when it is not.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELAXED_SIMD_FIRST = 0x100;
export const RELAXED_SIMD_LAST = 0x113;
export const MEMORY_GROW = 0x40;

// 0xfd sub-opcodes below 0x100 that WebAssembly 3.0 leaves unassigned.
const SIMD_UNASSIGNED = new Set([0x9a, 0xa2, 0xa5, 0xa6, 0xaf, 0xb0, 0xb2, 0xb3, 0xb4, 0xbb, 0xc2, 0xc5, 0xc6, 0xcf, 0xd0, 0xd2, 0xd3, 0xd4, 0xe2, 0xee]);

// 0xfc sub-opcodes that move state in or out of linear memory's reach, or grow a table.
const MISC_REFUSED = new Map([
  [8, 'memory.init'],
  [9, 'data.drop'],
  [12, 'table.init'],
  [13, 'elem.drop'],
  [15, 'table.grow'],
]);

/**
 * @typedef {{ initial: number, maximum: number | null, imported: boolean }} Memory
 * @typedef {{ ok: boolean, reasons: string[], memories: Memory[], functions: number, instructions: number, simd: number, data: number, elements: number }} Lint
 */

class Refusal extends Error {}

/**
 * @param {Uint8Array} bytes
 */
function reader(bytes) {
  let at = 0;
  const r = {
    get at() {
      return at;
    },
    set at(v) {
      at = v;
    },
    end() {
      return at >= bytes.length;
    },
    byte() {
      if (at >= bytes.length) {
        throw new Refusal('the module ends inside an item at byte ' + at);
      }
      const b = bytes[at];
      at = at + 1;
      return b;
    },
    /** Unsigned LEB128, up to 32 bits, padding allowed to five bytes. */
    u32() {
      let result = 0;
      let shift = 0;
      for (;;) {
        const b = r.byte();
        if (shift === 28 && (b & 0x70) !== 0) {
          throw new Refusal('an unsigned LEB128 overflows 32 bits at byte ' + (at - 1));
        }
        result = result + (b & 0x7f) * 2 ** shift;
        if ((b & 0x80) === 0) {
          return result;
        }
        shift = shift + 7;
        if (shift > 28) {
          throw new Refusal('an unsigned LEB128 is longer than five bytes at byte ' + at);
        }
      }
    },
    /** A signed LEB128 of at most `bits` bits; the value is skipped, not kept. */
    /** @param {number} bits */
    signed(bits) {
      const max = Math.ceil(bits / 7);
      for (let i = 0; i < max; i = i + 1) {
        if ((r.byte() & 0x80) === 0) {
          return;
        }
      }
      throw new Refusal('a signed LEB128 is longer than ' + max + ' bytes at byte ' + at);
    },
    /** @param {number} n */
    skip(n) {
      if (at + n > bytes.length) {
        throw new Refusal('the module ends inside an item at byte ' + at);
      }
      at = at + n;
    },
  };
  return r;
}

/**
 * @typedef {ReturnType<typeof reader>} Reader
 */

/**
 * @param {Reader} r
 * @param {boolean} imported
 * @returns {Memory}
 */
function limits(r, imported) {
  const flags = r.byte();
  if (flags !== 0x00 && flags !== 0x01) {
    throw new Refusal('memory limits flag 0x' + flags.toString(16) + ' is shared or 64-bit, which this binary must not be');
  }
  const initial = r.u32();
  const maximum = flags === 0x01 ? r.u32() : null;
  return { initial, maximum, imported };
}

/**
 * @param {Reader} r
 */
function memarg(r) {
  const align = r.u32();
  if (align & 0x40) {
    r.u32();
  }
  r.u32();
}

/**
 * A heap type: an abstract type as one negative byte, or a type index, both s33.
 * @param {Reader} r
 */
function heaptype(r) {
  r.signed(33);
}

/**
 * A value type: one byte, or `ref null ht` (0x63) and `ref ht` (0x64) with a heap type.
 * @param {Reader} r
 */
function valtype(r) {
  const at = r.at;
  const b = r.byte();
  if (b === 0x63 || b === 0x64) {
    heaptype(r);
  } else if ((b & 0xc0) !== 0x40 || b === 0x40) {
    throw new Refusal('byte 0x' + b.toString(16) + ' at byte ' + at + ' is not a value type');
  }
}

/**
 * Empty (0x40), a value type of one or more bytes, or a type index (s33).
 * @param {Reader} r
 */
function blocktype(r) {
  const b = r.byte();
  if (b === 0x40) {
    return;
  }
  if (b === 0x63 || b === 0x64) {
    heaptype(r);
    return;
  }
  if ((b & 0xc0) === 0x40) {
    return;
  }
  r.at = r.at - 1;
  r.signed(33);
}

/**
 * A constant expression, as a data or element segment's offset or item.
 * @param {Reader} r
 * @param {string} where
 */
function constExpr(r, where) {
  for (;;) {
    const at = r.at;
    const op = r.byte();
    if (op === 0x0b) {
      return;
    }
    if (op === 0x41) {
      r.signed(32);
    } else if (op === 0x42) {
      r.signed(64);
    } else if (op === 0x43) {
      r.skip(4);
    } else if (op === 0x44) {
      r.skip(8);
    } else if (op === 0x23 || op === 0xd2) {
      r.u32();
    } else if (op === 0xd0) {
      heaptype(r);
    } else if (op === 0x6a || op === 0x6b || op === 0x6c || op === 0x7c || op === 0x7d || op === 0x7e) {
      continue;
    } else {
      throw new Refusal('opcode 0x' + op.toString(16) + ' at byte ' + at + ' in ' + where + ' is not a constant this lint decodes');
    }
  }
}

/**
 * Decodes one function body's instructions to its final end.
 * @param {Reader} r
 * @param {number} stop the byte after the body
 * @param {number} index the function's index among the code section's bodies
 * @param {Lint} lint
 */
function body(r, stop, index, lint) {
  const groups = r.u32();
  for (let g = 0; g < groups; g = g + 1) {
    r.u32();
    valtype(r);
  }
  while (r.at < stop) {
    const at = r.at;
    const op = r.byte();
    lint.instructions = lint.instructions + 1;
    if (op <= 0x01 || op === 0x05 || op === 0x0b || op === 0x0f || op === 0x1a || op === 0x1b || op === 0xd1) {
      continue;
    }
    if (op >= 0x02 && op <= 0x04) {
      blocktype(r);
    } else if (op === 0x0c || op === 0x0d || op === 0x10 || op === 0x12 || op === 0xd2) {
      r.u32();
    } else if (op === 0x0e) {
      const n = r.u32();
      for (let i = 0; i <= n; i = i + 1) {
        r.u32();
      }
    } else if (op === 0x11 || op === 0x13) {
      r.u32();
      r.u32();
    } else if (op === 0x1c) {
      const n = r.u32();
      for (let i = 0; i < n; i = i + 1) {
        valtype(r);
      }
    } else if (op >= 0x20 && op <= 0x26) {
      r.u32();
    } else if (op >= 0x28 && op <= 0x3e) {
      memarg(r);
    } else if (op === 0x3f) {
      r.u32();
    } else if (op === MEMORY_GROW) {
      r.u32();
      lint.reasons.push('memory.grow at byte ' + at + ' in function body ' + index);
    } else if (op === 0x41) {
      r.signed(32);
    } else if (op === 0x42) {
      r.signed(64);
    } else if (op === 0x43) {
      r.skip(4);
    } else if (op === 0x44) {
      r.skip(8);
    } else if (op >= 0x45 && op <= 0xc4) {
      continue;
    } else if (op === 0xd0) {
      heaptype(r);
    } else if (op === 0xfc) {
      misc(r, at, index, lint);
    } else if (op === 0xfd) {
      simd(r, at, index, lint);
    } else {
      throw new Refusal('opcode 0x' + op.toString(16) + ' at byte ' + at + ' in function body ' + index + ' is not one this lint decodes');
    }
  }
  if (r.at !== stop) {
    throw new Refusal('function body ' + index + ' overruns its size');
  }
}

/**
 * The 0xfc prefix: saturating truncation, bulk memory, and tables.
 * @param {Reader} r
 * @param {number} at
 * @param {number} index
 * @param {Lint} lint
 */
function misc(r, at, index, lint) {
  const sub = r.u32();
  if (sub <= 7) {
    return;
  }
  if (sub === 8 || sub === 10 || sub === 12 || sub === 14) {
    r.u32();
    r.u32();
  } else if (sub === 9 || sub === 11 || sub === 13 || (sub >= 15 && sub <= 17)) {
    r.u32();
  } else {
    throw new Refusal('opcode 0xfc ' + sub + ' at byte ' + at + ' in function body ' + index + ' is not one this lint decodes');
  }
  const refused = MISC_REFUSED.get(sub);
  if (refused) {
    lint.reasons.push(refused + ' at byte ' + at + ' in function body ' + index);
  }
}

/**
 * The 0xfd prefix: SIMD, with relaxed SIMD at 0x100 through 0x113. Every
 * assigned sub-opcode below 0x100 is listed by its immediates; the rest refuse.
 * @param {Reader} r
 * @param {number} at
 * @param {number} index
 * @param {Lint} lint
 */
function simd(r, at, index, lint) {
  const sub = r.u32();
  lint.simd = lint.simd + 1;
  if (sub >= RELAXED_SIMD_FIRST && sub <= RELAXED_SIMD_LAST) {
    lint.reasons.push('relaxed-SIMD opcode 0xfd 0x' + sub.toString(16) + ' at byte ' + at + ' in function body ' + index);
    return;
  }
  if (sub > 0xff || SIMD_UNASSIGNED.has(sub)) {
    throw new Refusal('opcode 0xfd 0x' + sub.toString(16) + ' at byte ' + at + ' in function body ' + index + ' is not one this lint decodes');
  }
  if (sub <= 0x0b || sub === 0x5c || sub === 0x5d) {
    memarg(r);
  } else if (sub === 0x0c || sub === 0x0d) {
    r.skip(16);
  } else if (sub >= 0x15 && sub <= 0x22) {
    r.byte();
  } else if (sub >= 0x54 && sub <= 0x5b) {
    memarg(r);
    r.byte();
  }
}

/**
 * The element section. A passive or declared segment is refused.
 * @param {Reader} r
 * @param {Lint} lint
 */
function elements(r, lint) {
  const n = r.u32();
  for (let i = 0; i < n; i = i + 1) {
    const where = 'element segment ' + i;
    const flags = r.u32();
    if (flags > 7) {
      throw new Refusal(where + ' has flags ' + flags + ', which this lint does not decode');
    }
    if (flags & 1) {
      lint.reasons.push(where + ' is ' + (flags & 2 ? 'declared' : 'passive') + ': only active segments may initialise the binary');
    } else {
      lint.elements = lint.elements + 1;
    }
    if (flags === 2 || flags === 6) {
      r.u32();
    }
    if ((flags & 1) === 0) {
      constExpr(r, where);
    }
    const exprs = (flags & 4) !== 0;
    if (flags !== 0 && flags !== 4) {
      if (exprs) {
        valtype(r);
      } else {
        r.byte();
      }
    }
    const count = r.u32();
    for (let j = 0; j < count; j = j + 1) {
      if (exprs) {
        constExpr(r, where);
      } else {
        r.u32();
      }
    }
  }
}

/**
 * The data section. A passive segment is refused.
 * @param {Reader} r
 * @param {Lint} lint
 */
function data(r, lint) {
  const n = r.u32();
  for (let i = 0; i < n; i = i + 1) {
    const where = 'data segment ' + i;
    const flags = r.u32();
    if (flags === 1) {
      lint.reasons.push(where + ' is passive: only active segments may initialise the binary');
    } else if (flags === 0 || flags === 2) {
      if (flags === 2) {
        r.u32();
      }
      constExpr(r, where);
      lint.data = lint.data + 1;
    } else {
      throw new Refusal(where + ' has flags ' + flags + ', which this lint does not decode');
    }
    r.skip(r.u32());
  }
}

/**
 * @param {Uint8Array} bytes a WebAssembly module
 * @returns {Lint}
 */
export function lintWasm(bytes) {
  /** @type {Lint} */
  const lint = { ok: false, reasons: [], memories: [], functions: 0, instructions: 0, simd: 0, data: 0, elements: 0 };
  try {
    const r = reader(bytes);
    const magic = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    for (let i = 0; i < magic.length; i = i + 1) {
      if (r.byte() !== magic[i]) {
        throw new Refusal('not a WebAssembly 1.0 binary module');
      }
    }
    while (!r.end()) {
      const id = r.byte();
      const size = r.u32();
      const stop = r.at + size;
      if (stop > bytes.length) {
        throw new Refusal('section ' + id + ' runs past the end of the module');
      }
      if (id === 2) {
        const n = r.u32();
        for (let i = 0; i < n; i = i + 1) {
          r.skip(r.u32());
          r.skip(r.u32());
          const kind = r.byte();
          if (kind === 0x00) {
            r.u32();
          } else if (kind === 0x04) {
            r.byte();
            r.u32();
          } else if (kind === 0x01) {
            valtype(r);
            const flags = r.byte();
            r.u32();
            if (flags & 0x01) {
              r.u32();
            }
          } else if (kind === 0x02) {
            lint.memories.push(limits(r, true));
          } else if (kind === 0x03) {
            valtype(r);
            r.byte();
          } else {
            throw new Refusal('import kind 0x' + kind.toString(16) + ' is not one this lint decodes');
          }
        }
      } else if (id === 5) {
        const n = r.u32();
        for (let i = 0; i < n; i = i + 1) {
          lint.memories.push(limits(r, false));
        }
      } else if (id === 8) {
        lint.reasons.push('a start section runs function ' + r.u32() + ' at instantiation, outside any image');
      } else if (id === 9) {
        elements(r, lint);
      } else if (id === 10) {
        const n = r.u32();
        lint.functions = n;
        for (let i = 0; i < n; i = i + 1) {
          const len = r.u32();
          body(r, r.at + len, i, lint);
        }
      } else if (id === 11) {
        data(r, lint);
      }
      r.at = stop;
    }
    if (lint.memories.length === 0) {
      lint.reasons.push('the module declares no memory');
    }
    for (let i = 0; i < lint.memories.length; i = i + 1) {
      const m = lint.memories[i];
      const which = (m.imported ? 'imported memory ' : 'memory ') + i;
      if (m.maximum === null) {
        lint.reasons.push(which + ' has no maximum: initial ' + m.initial + ' pages can grow');
      } else if (m.maximum !== m.initial) {
        lint.reasons.push(which + ' has maximum ' + m.maximum + ' pages, not its initial ' + m.initial);
      }
    }
  } catch (err) {
    if (!(err instanceof Refusal)) {
      throw err;
    }
    lint.reasons.push(err.message);
  }
  lint.ok = lint.reasons.length === 0;
  return lint;
}

/**
 * One line of facts about a clean binary.
 * @param {Lint} lint
 */
export function facts(lint) {
  const memories = lint.memories.map((m) => m.initial + '/' + m.maximum + ' pages').join(', ');
  return 'lint clean: memory ' + memories + ', ' + lint.functions + ' function bodies, ' + lint.instructions + ' instructions, ' + lint.simd + ' SIMD, '
    + lint.data + ' active data and ' + lint.elements + ' active element segments, no relaxed SIMD, no memory.grow, no table.grow, no start, nothing passive';
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const file = process.argv[2]
    ? resolve(process.argv[2])
    : join(dirname(self), 'target', 'wasm32-unknown-unknown', 'release', 'si_solver.wasm');
  const result = lintWasm(readFileSync(file));
  if (!result.ok) {
    for (const reason of result.reasons) {
      process.stderr.write('lint refused ' + file + ': ' + reason + '\n');
    }
    process.exit(1);
  }
  process.stdout.write(facts(result) + '\n');
}
