// The product scene as harness/sim.mjs runs it, one line per quantum. The
// line format is fixed in harness/trace-line.mjs and docs/PHASE-2.md:
//
//   <tick> <hash> body <id> <x y z vx vy vz qx qy qz qw wx wy wz as IEEE hex> <zone|-> <links|-> ...
//     snap <len> <digest> mind <body> <met flags> <newest belief|-> ...
//   end <lines>
//
// Line 0 is the load. The last quantum's hash is fixtures/golden.txt.
// Compare two traces with harness/first-difference.js.
//
// Run as a module: `v8 --module`, `spidermonkey -m`, `javascriptcore -m`, or node.

import { runProduct } from './product-run.mjs';
import { endLine, thrownLine, traceLine } from './trace-line.mjs';

/** @param {string} line */
function out(line) {
  // @ts-ignore the shells define print; node does not
  if (typeof print === 'function') {
    // @ts-ignore
    print(line);
  } else {
    console.log(line);
  }
}

let lines = 0;
runProduct((tick, hash, world, memory) => {
  out(traceLine(tick, hash === null ? 'NAN' : hash, world, memory));
  lines = lines + 1;
}, (tick) => {
  out(thrownLine(tick));
  lines = lines + 1;
});
out(endLine(lines));
