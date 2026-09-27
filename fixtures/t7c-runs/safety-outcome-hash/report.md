# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 14840 quanta and 47 restores.

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

Proposed 16, refused 12, admitted 4; ran 4 through the ladder, 0 left unrun by the budget.

Refusals: 12 x path crosses collider wall-east

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 16 calls, 2136 quanta, 4 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 2626 quanta, 2 restores, extended past the grammar's budget. New lines: none. New differences: none. Newly caught mutants: none.

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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QzdiOn\\clean-head",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "a41d9206849609bc3d5e4bb7b044e60ec5b377d1bc21515bf385887b78482452"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QzdiOn\\clean-base",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "a41d9206849609bc3d5e4bb7b044e60ec5b377d1bc21515bf385887b78482452"
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
  "anchors": 2223,
  "product builds": 421,
  "processes": 556,
  "sweep fixtures/bench/room.json": 1849,
  "sweep ladder fixtures/bench/room.json": 1854,
  "grammar ladder fixtures/bench/room.json": 4310,
  "model fixtures/bench/room.json": 10386,
  "controls": 0,
  "mutants": 0,
  "total": 21599
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-safety\\safety-outcome-hash",
  "work": "E:\\AI\\si-verify\\t7c-safety\\safety-outcome-hash\\work"
 },
 "processes": {
  "head": {
   "pid": 16996,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QzdiOn\\clean-head",
   "build": "product",
   "calls": 33,
   "ms": 4606,
   "quanta": 17466
  },
  "base": {
   "pid": 24368,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QzdiOn\\clean-base",
   "build": "product",
   "calls": 33,
   "ms": 1914,
   "quanta": 17466
  },
  "sweep": {
   "pid": 23488,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-QzdiOn\\clean-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 610.5437000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 452.0607,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 582.2221,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 497.0727000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 477.6175999999996,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 527.0364000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 486.8318999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 506.70600000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 489.34820000000036,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 494.0865999999987,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 476.3083999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 450.0743000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 590.3653999999988,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 495.1725000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 493.73179999999957,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 511.256800000001,
    "timedOut": false
   }
  ]
 }
}
```
