# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 12704 quanta and 43 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |

## sweep

Proposed 238, refused 181, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 152 x move steps it; 11 x nothing is under the point; 9 x path crosses collider wall-west; 5 x path crosses collider step; 2 x path crosses collider ledge; 2 x path crosses collider wall-south

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 27, refused 21, admitted 6; ran 27 through the ladder, 0 left unrun by the budget.

Refusals: 3 x actor is not in zone shelf; 3 x actor is not in zone yard; 3 x move steps it; 3 x path crosses collider ledge; 2 x path crosses collider wall-south; 2 x path crosses collider wall-west; 1 x actor is already carrying; 1 x nothing is carried; 1 x rise is past maxRise; 1 x target is beyond climb range 3; 1 x target is beyond move range 3

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 16, refused 16, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 13 x target must name a body or a zone; 3 x rise is past maxRise

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 16 calls, 0 quanta, 0 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 0 quanta, 0 restores. New lines: none. New differences: none. Newly caught mutants: none.

## Mutants

The mutants measure the candidates' sensitivity at the change, not the aim, which is the access map's to measure.


## What was not measured

- notAimed: none
- notSeenApproximate: none
- notReached: none
- runsAtLoad: none
- noExecutableChange: none
- removed: none
- unrun: none
- mutantsNotReached: none
- mutantsNotScored: none
- mutantsNone: none

## Environment

```
{
 "trees": {
  "head": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QuBEjO\\clean-head",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "94ef744712756e65292967365271c785299f42cce73e339151b0a451b999c89f"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QuBEjO\\clean-base",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "94ef744712756e65292967365271c785299f42cce73e339151b0a451b999c89f"
  }
 },
 "binaries": {
  "head": "9ff6d183d8c76ead2a3b37ab59df3bf1f7336f654d854d6bf186e47e98b46f3e",
  "base": "9ff6d183d8c76ead2a3b37ab59df3bf1f7336f654d854d6bf186e47e98b46f3e",
  "files": {
   "head": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "base": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf"
  }
 },
 "host": {
  "platform": "win32",
  "arch": "x64",
  "cpus": 24,
  "node": "v22.22.3"
 },
 "times": {
  "anchors": 2320,
  "product builds": 413,
  "processes": 554,
  "sweep fixtures/bench/room.json": 1916,
  "sweep ladder fixtures/bench/room.json": 1922,
  "grammar ladder fixtures/bench/room.json": 4257,
  "model fixtures/bench/room.json": 10122,
  "controls": 0,
  "mutants": 0,
  "total": 21504
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-safety\\safety-class-body",
  "work": "E:\\AI\\si-verify\\t7c-safety\\safety-class-body\\work"
 },
 "processes": {
  "head": {
   "pid": 19216,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QuBEjO\\clean-head",
   "build": "product",
   "calls": 27,
   "ms": 3498,
   "quanta": 12704
  },
  "base": {
   "pid": 36128,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QuBEjO\\clean-base",
   "build": "product",
   "calls": 27,
   "ms": 1470,
   "quanta": 12704
  },
  "sweep": {
   "pid": 13052,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QuBEjO\\clean-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 3036.7823,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 450.5680999999986,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 415.52089999999953,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 370.580899999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 451.91250000000036,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 418.7000000000007,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 429.3654999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 446.39210000000094,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 384.5059000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 395.02629999999954,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 379.17089999999916,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 412.5030999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 403.82600000000093,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 395.16949999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 401.48259999999937,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 407.1876000000011,
    "timedOut": false
   }
  ]
 }
}
```
