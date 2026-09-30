# Host binding

The socket a host binds to. `packages/host` speaks it. `harness/binding.test.js` plays the fixture through it and holds these field lists against the records a session writes. Version 1. A host that reads a version it does not know refuses to bind.

## The socket

- The stream: `GET /frames` answers newline-delimited JSON — the world record once, then the current frame record, then one line per committed frame. A slow client misses lines and loses nothing: every frame was hashed and frozen before a host saw it.
- The world record: `kind: "world"`, `version`, `dt`, `colliders`, `zones`, and `goal` when the world names a goal whose zone exists. A collider is an `id` and the six bounds `minX`, `maxX`, `minY`, `maxY`, `minZ`, `maxZ`. The quaternion `qx`, `qy`, `qz`, `qw` is written only when the collider names one; the fixture's three colliders name none. A zone is an `id` and those six bounds. The world file stores a goal as an actor and a zone id; the record's `goal` is that zone.
- The frame record: `kind: "frame"`, `tick`, `hash`, `bodies`, `door`, `zone`, and `minds` when the world has minds. A body is an `id` plus sixteen numbers: `x`, `y`, `z`, `vx`, `vy`, `vz`, `qx`, `qy`, `qz`, `qw`, `wx`, `wy`, `wz`, `hx`, `hy`, `hz`. `door` is the sim's tick at which the goal was first reached, or null, and it stays that tick. `zone` is the driven actor's zone id, or null. A mind is `body`, `sight`, `x`, `y`, `z`, `beliefs`, and `goals`. A live belief keeps `subject` as text, `key`, and `value`. A goal on the wire is `index`, `kind`, `met`, `metTick`, and either `zone` or `target`.
- The intent door: `POST /intent`. A body over 4096 bytes answers 413 with an empty body and the connection is destroyed. A body that is not JSON answers 400 `{ admitted: false, reason: "not json" }`. A parsed body answers 200 with the admission — `admitted: true, quanta, hash`, or `admitted: false` with the reason. An intent is `actor` and `verb` (the actor defaults to the world file's goal actor, and to `walker` when the session has no scene; the verb defaults to `move`), and one of `direction` or `target` (a point `{ x, z }`, a body, or a zone). `up` and `down` are refused with `move has no vertical; click a point`. Neither a direction nor a usable target is refused with `an intent needs a target or a direction`. A parsed value that is not an object is refused with `an intent is an object`. A `push` names the nearest other body within the rule's range. A hash the client sends is ignored: the adapter stamps the newest committed hash, which is what the admission returns.
- The host-side rules. Keep the last two committed frames received and blend them by body `id` over wall-clock `dt`; a position step larger than the body's speed times `dt`, plus `1e-6`, is a cut; a body present in one frame of the pair is drawn where it is committed; the first frame draws as committed. A host keeps no second collider, and a computation whose result becomes a field of an intent reads committed frame fields only. The law keeps the physics step.
- The tick-side guarantees. `submit` refuses an intent whose `frameHash` is not the newest (`stale frame: …`). A host that throws is detached and the quantum completes. The pump fires once per timer fire at 16 ms, about two percent slow, and the tick's step does not change. A restore does not draw; hosts see the next committed frame.

## Refusals

The door and the tick answer these reasons:

- `not json`
- `an intent is an object`
- `move has no vertical; click a point`
- `an intent needs a target or a direction`
- `no body named `
- `no body in range to push`
- `stale frame: intent names `

## Field lists

A line is a field. `?` marks a field that is written only when the source names it. `a|b` marks two fields of which the record carries one.

```contract world
kind
version
dt
colliders
colliders.id
colliders.minX
colliders.maxX
colliders.minY
colliders.maxY
colliders.minZ
colliders.maxZ
colliders.qx?
colliders.qy?
colliders.qz?
colliders.qw?
zones
zones.id
zones.minX
zones.maxX
zones.minY
zones.maxY
zones.minZ
zones.maxZ
goal?
goal.id
goal.minX
goal.maxX
goal.minY
goal.maxY
goal.minZ
goal.maxZ
```

```contract frame
kind
tick
hash
bodies
bodies.id
bodies.x
bodies.y
bodies.z
bodies.vx
bodies.vy
bodies.vz
bodies.qx
bodies.qy
bodies.qz
bodies.qw
bodies.wx
bodies.wy
bodies.wz
bodies.hx
bodies.hy
bodies.hz
door
zone
minds?
minds.body
minds.sight
minds.x
minds.y
minds.z
minds.beliefs
minds.beliefs.subject
minds.beliefs.key
minds.beliefs.value
minds.goals
minds.goals.index
minds.goals.kind
minds.goals.met
minds.goals.metTick
minds.goals.zone|target
```
