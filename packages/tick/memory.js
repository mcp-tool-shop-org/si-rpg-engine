// Beliefs and episodes are records the sim holds. A memory write is one typed
// belief citing an admitted episode. Supersession is a tombstone that cites
// the withdrawing episode. Nothing here is deleted, and nothing here is free
// text the hash would have to trust.

/**
 * @typedef {import('../frame/types.js').Belief} Belief
 * @typedef {import('../frame/types.js').Episode} Episode
 * @typedef {import('../frame/types.js').BeliefWrite} BeliefWrite
 */

export function createMemory() {
  /** @type {Belief[]} */
  const beliefs = [];
  /** @type {Episode[]} */
  const episodes = [];

  /** @param {string} id */
  function episode(id) {
    for (let i = 0; i < episodes.length; i = i + 1) {
      if (episodes[i].id === id) {
        return episodes[i];
      }
    }
    return undefined;
  }

  /** @param {string} id */
  function belief(id) {
    for (let i = 0; i < beliefs.length; i = i + 1) {
      if (beliefs[i].id === id) {
        return beliefs[i];
      }
    }
    return undefined;
  }

  /**
   * Records an admitted event. Only the tick calls this, after admission.
   * @param {number} tick @param {string} kind @param {string} detail
   */
  function recordEpisode(tick, kind, detail) {
    const e = { id: 'e' + (episodes.length + 1), tick, kind, detail };
    episodes.push(e);
    return e;
  }

  /**
   * The provenance predicate. Hand-authored. No model.
   * @param {BeliefWrite} w
   * @returns {{ ok: true; belief: Belief } | { ok: false; reason: string }}
   */
  function admitBeliefWrite(w) {
    if (typeof w.subject !== 'string' || typeof w.key !== 'string' || typeof w.value !== 'string') {
      return { ok: false, reason: 'a belief is subject, key, value as strings' };
    }
    if (typeof w.confidence !== 'number' || !(w.confidence >= 0 && w.confidence <= 1)) {
      return { ok: false, reason: 'confidence must be a number in [0, 1]' };
    }
    if (typeof w.source !== 'string' || !episode(w.source)) {
      return { ok: false, reason: 'source must cite an admitted episode; ' + String(w.source) + ' is not in the log' };
    }
    /** @type {Belief | undefined} */
    let old;
    if (w.supersedes !== undefined) {
      old = belief(w.supersedes);
      if (!old) {
        return { ok: false, reason: 'supersedes names no belief: ' + w.supersedes };
      }
      if (old.supersededBy) {
        return { ok: false, reason: 'belief ' + old.id + ' is already superseded by ' + old.supersededBy };
      }
      if (typeof w.withdrawnBy !== 'string' || !episode(w.withdrawnBy)) {
        return { ok: false, reason: 'supersession must cite the withdrawing episode' };
      }
      const older = episode(old.source);
      const newer = episode(w.source);
      if (older && newer && newer.tick < older.tick) {
        return { ok: false, reason: 'stale: ' + w.source + ' is older than ' + old.source };
      }
    }
    const b = {
      id: 'b' + (beliefs.length + 1),
      subject: w.subject,
      key: w.key,
      value: w.value,
      confidence: w.confidence,
      source: w.source,
    };
    beliefs.push(b);
    if (old) {
      old.supersededBy = b.id;
      old.withdrawnBy = w.withdrawnBy;
    }
    return { ok: true, belief: b };
  }

  /** @type {Map<string, Belief[]>} */
  const byMind = new Map();

  /**
   * @param {string} mind
   */
  function mindBeliefs(mind) {
    const found = byMind.get(mind);
    if (found) {
      return found;
    }
    /** @type {Belief[]} */
    const list = [];
    byMind.set(mind, list);
    return list;
  }

  /**
   * A mind-scoped write. The key table is checked by the caller.
   * @param {string} mind
   * @param {BeliefWrite} w
   * @returns {{ ok: true, belief: Belief } | { ok: false, reason: string }}
   */
  function admitMindBelief(mind, w) {
    const list = mindBeliefs(mind);
    const source = episode(w.source);
    if (!source) {
      return { ok: false, reason: 'source must cite an admitted episode; ' + String(w.source) + ' is not in the log' };
    }
    /** @type {Belief | undefined} */
    let old;
    if (w.supersedes !== undefined) {
      old = list.find((item) => item.id === w.supersedes);
      if (!old) {
        return { ok: false, reason: 'supersedes names no belief: ' + w.supersedes };
      }
      if (old.supersededBy) {
        return { ok: false, reason: 'belief ' + old.id + ' is already superseded by ' + old.supersededBy };
      }
      if (typeof w.withdrawnBy !== 'string' || !episode(w.withdrawnBy)) {
        return { ok: false, reason: 'supersession must cite the withdrawing episode' };
      }
      const older = episode(old.source);
      if (older && source.tick < older.tick) {
        return { ok: false, reason: 'stale: ' + w.source + ' is older than ' + old.source };
      }
    }
    const b = {
      id: 'b' + (list.length + 1),
      subject: /** @type {Belief['subject']} */ (/** @type {unknown} */ (w.subject)),
      key: w.key,
      value: /** @type {Belief['value']} */ (/** @type {unknown} */ (w.value)),
      confidence: w.confidence,
      source: w.source,
    };
    list.push(b);
    if (old) {
      old.supersededBy = b.id;
      old.withdrawnBy = w.withdrawnBy;
    }
    return { ok: true, belief: b };
  }

  /**
   * A copy of every record, for a tick's save (T6 pin 1). Each belief is
   * copied, not shared, because a supersession writes into the belief it
   * withdraws; a save that shared them would change when the run goes on.
   * @returns {MemorySave}
   */
  function save() {
    return {
      beliefs: beliefs.map((item) => ({ ...item })),
      episodes: episodes.map((item) => ({ ...item })),
      minds: Array.from(byMind, ([mind, list]) => /** @type {[string, Belief[]]} */ ([mind, list.map((item) => ({ ...item }))])),
    };
  }

  /**
   * Puts a save back. The two exposed arrays keep their identity, so a
   * holder of `beliefs` or `episodes` sees the restored records, and every
   * record is copied again, so one save can be restored any number of times.
   * @param {MemorySave} saved
   */
  function restore(saved) {
    beliefs.length = 0;
    for (const item of saved.beliefs) {
      beliefs.push({ ...item });
    }
    episodes.length = 0;
    for (const item of saved.episodes) {
      episodes.push({ ...item });
    }
    byMind.clear();
    for (const [mind, list] of saved.minds) {
      byMind.set(mind, list.map((item) => ({ ...item })));
    }
  }

  return { beliefs, episodes, episode, belief, recordEpisode, admitBeliefWrite, mindBeliefs, admitMindBelief, save, restore };
}

/**
 * @typedef {{ beliefs: Belief[], episodes: Episode[], minds: Array<[string, Belief[]]> }} MemorySave
 */

/**
 * Whether a value is an episode record.
 * @param {any} item
 */
function isEpisode(item) {
  return Boolean(item) && typeof item === 'object' && typeof item.id === 'string' && Number.isInteger(item.tick) && item.tick >= 0
    && typeof item.kind === 'string' && typeof item.detail === 'string';
}

/**
 * Whether a value is a belief record: the fixture room's, whose subject is a
 * string, or a mind's, whose subject names a body or a zone.
 * @param {any} item
 */
function isBelief(item) {
  if (!item || typeof item !== 'object') {
    return false;
  }
  const subject = item.subject;
  const named = typeof subject === 'string' || (Boolean(subject) && typeof subject === 'object' && (typeof subject.body === 'string' || typeof subject.zone === 'string'));
  const value = typeof item.value === 'string' || typeof item.value === 'number' || typeof item.value === 'boolean';
  return typeof item.id === 'string' && named && typeof item.key === 'string' && value
    && typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1 && typeof item.source === 'string'
    && (item.supersededBy === undefined || typeof item.supersededBy === 'string')
    && (item.withdrawnBy === undefined || typeof item.withdrawnBy === 'string');
}

/**
 * Why a value is not a memory save, or null. It checks every record, not
 * only the lists, so a restore checks the whole save before it changes
 * anything.
 * @param {any} saved
 * @returns {string | null}
 */
export function memorySaveProblem(saved) {
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.beliefs) || !Array.isArray(saved.episodes) || !Array.isArray(saved.minds)) {
    return 'the memory is beliefs, episodes, and each mind\'s beliefs';
  }
  if (!saved.episodes.every(isEpisode)) {
    return 'the memory\'s episodes are each an id, a whole-numbered tick, a kind, and a detail';
  }
  const beliefs = 'the memory\'s beliefs are each an id, a subject, a key, a value, a confidence from 0 through 1, a source, and what superseded it, if anything';
  if (!saved.beliefs.every(isBelief)) {
    return beliefs;
  }
  for (const entry of saved.minds) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
      return 'each mind\'s beliefs are a body id and a list';
    }
    if (!entry[1].every(isBelief)) {
      return beliefs;
    }
  }
  return null;
}
