// The kernel contract. These types are what the harness had to serialize,
// plus the proposal classes phase 0 names. Runtime code is JavaScript checked
// against this file by `tsc --noEmit`; nothing here is built or emitted.

/** A rigid body: an axis-aligned box with a pose and a velocity. */
export interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** half width */
  hw: number;
  /** half height */
  hh: number;
}

/** A static collider the tick can query. It never moves. */
export interface StaticCollider {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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
  target: { x: number; y: number };
  frameHash: string;
}

/** One typed belief, citing the admitted episode it came from. */
export interface BeliefWrite {
  kind: 'belief';
  subject: string;
  key: string;
  value: string;
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
  hw: number;
  hh: number;
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

/** A belief record the sim holds. Superseded beliefs are tombstoned, never deleted. */
export interface Belief {
  id: string;
  subject: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  supersededBy?: string;
  withdrawnBy?: string;
}

/** An admitted event. The raw evidence a belief may cite. */
export interface Episode {
  id: string;
  tick: number;
  kind: string;
  detail: string;
}

/** One admitted proposal and the hash the tick reached after it. */
export interface LogEntry {
  tick: number;
  proposal: Proposal;
  hash: string;
}

/** A hand-authored intent rule. Data the tick reads from predicates/intents. */
export interface IntentRule {
  verb: string;
  speed: number;
  maxDistance: number;
  requiresClearPath: boolean;
  maxQuanta: number;
}

/** The host boundary. Frames in. Nothing out but what it submits as intents. */
export interface Host {
  draw(frame: Frame): void;
}

export interface Hasher {
  /** returns false, and mixes nothing, when x is NaN */
  float(x: number): boolean;
  u32(w: number): void;
  text(s: string): void;
  digest(): string;
}
