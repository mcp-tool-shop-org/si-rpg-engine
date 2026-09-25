// The T1 trace line. It is written in packages/tick/trace-line.js, since the
// replay command prints it for a bundle and the tick never imports the
// harness; this re-export keeps the harness's own paths. The format is stated
// there and in docs/PHASE-2.md.
//
// Runs under node and the three shells.

export { FIELDS, bits, endLine, snapshotDigest, snapshotField, thrownLine, traceLine } from '../packages/tick/trace-line.js';
