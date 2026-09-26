// The kernel contract. These types are what the harness had to serialize,
// plus the proposal classes phase 0 names. Runtime code is JavaScript checked
// against this file by `tsc --noEmit`; nothing here is built or emitted.

/** A rigid body: a box with a pose, a linear velocity, a unit quaternion, and an angular velocity. */
export interface Body {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** unit quaternion, w last, w non-negative */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** angular velocity */
  wx: number;
  wy: number;
  wz: number;
  /** half extent on x */
  hx: number;
  /** half extent on y, the up axis */
  hy: number;
  /** half extent on z */
  hz: number;
}

/** A static collider the tick can query. It never moves. Optional quaternion rotates the box about the centre of its extent. */
export interface StaticCollider {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  qx?: number;
  qy?: number;
  qz?: number;
  qw?: number;
}

/** A gameplay partition. Half-open on every axis. */
export interface Zone {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * A committed frame. The only thing a host receives. Frozen: a host cannot
 * write geometry through it, and it carries no proposal.
 */
export interface Frame {
  readonly tick: number;
  readonly hash: string;
  readonly bodies: ReadonlyArray<Readonly<Body>>;
}

/** An intent from a host. It names the hash of the frame the host drew. */
export interface Intent {
  kind: 'intent';
  verb: string;
  actor: string;
  target: { x: number; z: number } | { body: string } | { zone: string };
  frameHash: string;
}

/** One typed belief, citing the admitted episode it came from. */
export interface BeliefWrite {
  kind: 'belief';
  /** Absent on the fixture room's implicit mind. A named mind is the per-mind list. */
  mind?: string;
  subject: string | { body: string } | { zone: string };
  key: string;
  value: string | number | boolean;
  confidence: number;
  /** an episode id the log already holds */
  source: string;
  /** the belief id this write supersedes, if any */
  supersedes?: string;
  /** the episode that withdrew the superseded belief; required with supersedes */
  withdrawnBy?: string;
}

/** A spoken line. Presentation. Never hashed. Slice 2 has no gate for it. */
export interface LineProposal {
  kind: 'line';
  speaker: string;
  text: string;
}

/** A body draft. Admitted when its box overlaps no collider and no body. */
export interface BodyDraft {
  kind: 'body';
  id: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

/**
 * A verb draft. Refused during play. Admitted only by the load command,
 * between sessions, after compile and the hazard suite.
 */
export interface VerbDraft {
  kind: 'verb';
  rule: IntentRule;
}

export type Proposal = Intent | BeliefWrite | LineProposal | BodyDraft | VerbDraft;

export type Admission =
  | { admitted: true; quanta: number; hash: string }
  | { admitted: false; reason: string };

/**
 * A belief's trust (T7a pin 5), from most trusted to least: authored (the
 * world file, or the host without provenance), observed (the tick's own
 * sight), role (a role whose sources are all trusted), untrusted (a role with
 * any untrusted source), hearsay (a role that reads player text).
 */
export type TrustLabel = 'authored' | 'observed' | 'role' | 'untrusted' | 'hearsay';

/** A belief record the sim holds. Superseded beliefs are tombstoned, never deleted. */
export interface Belief {
  id: string;
  subject: string | { body: string } | { zone: string };
  key: string;
  value: string | number | boolean;
  confidence: number;
  source: string;
  supersededBy?: string;
  withdrawnBy?: string;
  /** fixed at admission; the gate sets it, never the proposer */
  label: TrustLabel;
  /** the source a hearsay label names */
  heard?: string;
}

/** An admitted event. The raw evidence a belief may cite. */
export interface Episode {
  id: string;
  tick: number;
  kind: string;
  detail: string;
}

/**
 * One admitted proposal, the tick it was admitted at, and the hash it was
 * admitted against. Resolution happens in the quanta that follow; replay
 * advances to `tick` before it submits.
 */
export interface LogEntry {
  tick: number;
  proposal: Proposal;
  hash: string;
  /** present only on a role's admission; a host's entry keeps its old form byte for byte */
  provenance?: Provenance;
}

/** The sources a role may read, closed in code (packages/tick/roles.js). */
export type RoleSource = 'dispatch' | 'access' | 'catalog' | 'feedback' | 'frame-in-sight' | 'diff' | 'player-text' | 'mind' | 'world' | 'other-minds';

/** A source's trust, fixed in code: a mind's content carries its own labels. */
export type SourceTrust = 'trusted' | 'untrusted' | 'labelled';

/**
 * Where a role's admission came from (T7a pin 4). The hashes are SHA-256:
 * the manifest's canonical JSON, the call's rendered messages, its concrete
 * schema, and its output; `model` is the model's digest and `record` the key
 * of the call's record. `builtAt` is the committed frame the proposal was
 * built from, and `inputs` each input's source and trust.
 */
export interface Provenance {
  role: string;
  instance: string;
  manifest: string;
  model: string;
  prompt: string;
  schema: string;
  record: string;
  output: string;
  builtAt: { tick: number; hash: string };
  inputs: Array<{ source: RoleSource; trust: SourceTrust }>;
}

/** The sampling options a role pins; num_predict is its outputTokens budget, and format its schema. */
export interface RoleModelOptions {
  seed: number;
  temperature: number;
  top_k: number;
  top_p: number;
  num_ctx: number;
  stop: string[];
}

/** A role's budgets and their enforcers (T7a pin 10). */
export interface RoleBudget {
  callsPerSession: number;
  outputTokens: number;
  secondsPerCall: number;
  freeSpanChars: number;
  maxProposalsPerWindow: number;
  windowQuanta: number;
  maxAgeQuanta: number;
}

/** A role, admitted like a verb (T7a pin 1). predicates/roles holds the catalog. */
export interface RoleManifest {
  role: string;
  purpose: string;
  status: 'frozen' | 'thawed';
  decision: { by: string; on: string } | null;
  adversarialRun: string | null;
  world: 'scratch' | 'live';
  inputs: Array<{ name: string; source: RoleSource }>;
  outputs: { classes: Array<'intent' | 'belief'>; verbs: 'catalog' | string[]; actors: 'world' | 'own-body' };
  model: { name: string; digest: string; quantization: string; options: RoleModelOptions } | null;
  prompt: { template: string; sha256: string };
  schema: string;
  budget: RoleBudget;
}

/** A hand-authored intent rule. Data the tick reads from predicates/intents. */
export interface IntentRule {
  verb: string;
  speed: number;
  maxDistance: number;
  requiresClearPath: boolean;
  maxQuanta: number;
  /** Absent on a file means drive. move.json and push.json omit it. */
  effect?: 'drive' | 'climb' | 'carry' | 'release' | 'episode';
  /** Absent means a point target, which is what move is. */
  targetKind?: 'point' | 'body' | 'zone';
  /** climb only. The rise above the controller's step height, 0.3. */
  maxRise?: number;
  /** carry only. */
  maxHalfExtent?: number;
}

/** The host boundary. Frames in. Nothing out but what it submits as intents. */
export interface Host {
  draw(frame: Frame): void;
}

export interface Hasher {
  /** a byte stream, bytes 0-3 of every eight to lane 0 and 4-7 to lane 1, as a double is split */
  bytes(data: Uint8Array): void;
  /** returns false, and mixes nothing, when x is NaN */
  float(x: number): boolean;
  u32(w: number): void;
  text(s: string): void;
  digest(): string;
  /** the two lanes, the hasher's whole state, for a save */
  lanes(): [number, number];
  /** puts back lanes a save took; throws, changing nothing, on anything else */
  resume(lanes: ReadonlyArray<number>): void;
}
