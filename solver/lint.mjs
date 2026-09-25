#!/usr/bin/env node
// Refuses a solver binary that carries what the build is supposed to exclude:
// a relaxed-SIMD instruction (the 0xfd prefix, opcodes 0x100 through 0x113,
// whose results WebAssembly 3.0 lets a host choose), a memory.grow (0x40),
// or a memory whose maximum is absent or differs from its initial size.
//
// The code section is decoded instruction by instruction, not scanned for
// bytes: 0x40 is also the empty block type, and an opcode's bytes can appear
// inside any LEB128 immediate. An opcode this decoder does not know is itself
// a refusal, so a binary it cannot read never passes.
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

/**
 * @typedef {{ initial: number, maximum: number | null, imported: boolean }} Memory
 * @typedef {{ ok: boolean, reasons: string[], memories: Memory[], functions: number, instructions: number, simd: number }} Lint
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
    /** Unsigned LEB128, up to 32 bits. */
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
 * @param {ReturnType<typeof reader>} r
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
 * @param {ReturnType<typeof reader>} r
 */
function memarg(r) {
  const align = r.u32();
  if (align & 0x40) {
    r.u32();
  }
  r.u32();
}

/**
 * @param {ReturnType<typeof reader>} r
 */
function blocktype(r) {
  const b = r.byte();
  if (b === 0x40 || (b >= 0x6f && b <= 0x7f)) {
    return;
  }
  r.at = r.at - 1;
  r.signed(33);
}

/**
 * Decodes one function body's instructions to its final end.
 * @param {ReturnType<typeof reader>} r
 * @param {number} stop the byte after the body
 * @param {number} index the function's index among the code section's bodies
 * @param {Lint} lint
 */
function body(r, stop, index, lint) {
  const groups = r.u32();
  for (let g = 0; g < groups; g = g + 1) {
    r.u32();
    r.byte();
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
      r.skip(n);
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
      r.byte();
    } else if (op === 0xfc) {
      misc(r, at, index);
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
 * @param {ReturnType<typeof reader>} r
 * @param {number} at
 * @param {number} index
 */
function misc(r, at, index) {
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
}

/**
 * The 0xfd prefix: SIMD, with relaxed SIMD at 0x100 through 0x113.
 * @param {ReturnType<typeof reader>} r
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
  if (sub <= 0x0b || sub === 0x5c || sub === 0x5d) {
    memarg(r);
  } else if (sub === 0x0c || sub === 0x0d) {
    r.skip(16);
  } else if (sub >= 0x15 && sub <= 0x22) {
    r.byte();
  } else if (sub >= 0x54 && sub <= 0x5b) {
    memarg(r);
    r.byte();
  } else if (sub > 0xff) {
    throw new Refusal('opcode 0xfd 0x' + sub.toString(16) + ' at byte ' + at + ' in function body ' + index + ' is not one this lint decodes');
  }
}

/**
 * @param {Uint8Array} bytes a WebAssembly module
 * @returns {Lint}
 */
export function lintWasm(bytes) {
  /** @type {Lint} */
  const lint = { ok: false, reasons: [], memories: [], functions: 0, instructions: 0, simd: 0 };
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
            r.byte();
            const flags = r.byte();
            r.u32();
            if (flags & 0x01) {
              r.u32();
            }
          } else if (kind === 0x02) {
            lint.memories.push(limits(r, true));
          } else if (kind === 0x03) {
            r.byte();
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
      } else if (id === 10) {
        const n = r.u32();
        lint.functions = n;
        for (let i = 0; i < n; i = i + 1) {
          const len = r.u32();
          body(r, r.at + len, i, lint);
        }
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
  return 'lint clean: memory ' + memories + ', ' + lint.functions + ' function bodies, ' + lint.instructions + ' instructions, ' + lint.simd + ' SIMD, no relaxed SIMD, no memory.grow';
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
