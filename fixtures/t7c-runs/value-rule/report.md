# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 12474 quanta and 20 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| rule:predicates/intents/move.json:move | rule | 4 | restore, window | 1 of 1 | observable |

## sweep

Proposed 378, refused 330, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 192 x move steps it; 72 x target is beyond move range 0.0001; 18 x nothing is under the point; 17 x path crosses collider wall-east; 12 x standing volume is blocked; 11 x path crosses collider wall-south; 6 x path crosses collider wall-north; 2 x path crosses collider ledge

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 13, refused 9, admitted 4; ran 13 through the ladder, 0 left unrun by the budget.

Refusals: 3 x move steps it; 2 x target is beyond move range 0.0001; 1 x actor is not in zone shelf; 1 x actor is not in zone yard; 1 x nothing is carried; 1 x path crosses collider ledge

Rungs: 0 failed on the head 0, on the base 0; 1 reached 2; 2 differ 2; 3 fail 0, catches 0.

Flood: admissions of move differ throughout: refused on the head in each of the 2 candidates where either tree admits it

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 64, refused 61, admitted 3; ran 3 through the ladder, 0 left unrun by the budget.

Refusals: 61 x target is beyond move range 0.0001

Rungs: 0 failed on the head 0, on the base 0; 1 reached 3; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 64 calls, 286 quanta, 3 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 471 quanta, 2 restores, extended past the grammar's budget. New lines: none. New differences: none. Newly caught mutants: none.

## Mutants

The mutants measure the candidates' sensitivity at the change, not the aim, which is the access map's to measure.

- survived: m1 numeric constant at predicates/intents/move.json:4; m2 numeric constant at predicates/intents/move.json:4; m3 numeric constant at predicates/intents/move.json:4; m4 numeric constant at predicates/intents/move.json:4

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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\rule-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "14121e63b8d9bb5128ddc8a9e375e0a0ff43b3036c546b69cc0a21e738f07e49"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\rule-base",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "cd76bfb997b5326c5c82b81960251de015fbddd395eeb678109a181585d19c79"
  }
 },
 "binaries": {
  "head": "9ff6d183d8c76ead2a3b37ab59df3bf1f7336f654d854d6bf186e47e98b46f3e",
  "base": "9ff6d183d8c76ead2a3b37ab59df3bf1f7336f654d854d6bf186e47e98b46f3e",
  "files": {
   "head": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "base": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf"
  },
  "jsMutants": {
   "m1": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "m2": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "m3": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "m4": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf"
  }
 },
 "host": {
  "platform": "win32",
  "arch": "x64",
  "cpus": 24,
  "node": "v22.22.3"
 },
 "times": {
  "anchors": 2504,
  "product builds": 391,
  "processes": 561,
  "sweep fixtures/bench/room.json": 1993,
  "sweep ladder fixtures/bench/room.json": 1999,
  "grammar ladder fixtures/bench/room.json": 3114,
  "model fixtures/bench/room.json": 45319,
  "controls": 0,
  "mutants": 7608,
  "total": 63489
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-rule",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-rule\\work"
 },
 "processes": {
  "head": {
   "pid": 3756,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\rule-head",
   "build": "product",
   "calls": 17,
   "ms": 2885,
   "quanta": 12945
  },
  "base": {
   "pid": 33468,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\rule-base",
   "build": "product",
   "calls": 17,
   "ms": 1280,
   "quanta": 13132
  },
  "sweep": {
   "pid": 39208,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\rule-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 11000.705699999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 448.97710000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 484.0681000000004,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 463.7247000000025,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 542.3878999999979,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 521.7265000000007,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 501.5233999999982,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 498.636599999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 523.1097000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 538.6117000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 513.2538999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 570.7890999999981,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 501.71190000000206,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 543.4483,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 502.7368999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 457.5877999999975,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 16,
    "ms": 417.58539999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 17,
    "ms": 427.9369999999981,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 18,
    "ms": 423.7387999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 19,
    "ms": 430.8025999999991,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 20,
    "ms": 438.4366999999984,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 21,
    "ms": 443.66709999999875,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 22,
    "ms": 427.4994999999981,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 23,
    "ms": 401.21399999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 24,
    "ms": 403.14240000000063,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 25,
    "ms": 470.6167999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 26,
    "ms": 489.6324999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 27,
    "ms": 485.9108000000015,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 28,
    "ms": 595.8477000000021,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 29,
    "ms": 460.1381000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 30,
    "ms": 482.0538000000015,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 31,
    "ms": 468.9059999999954,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 32,
    "ms": 603.325499999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 33,
    "ms": 585.5339999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 34,
    "ms": 520.2175000000061,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 35,
    "ms": 436.7201999999961,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 36,
    "ms": 654.6146999999983,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 37,
    "ms": 407.4067000000068,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 38,
    "ms": 432.1915000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 39,
    "ms": 444.12889999999607,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 40,
    "ms": 426.62600000000384,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 41,
    "ms": 404.9547999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 42,
    "ms": 456.9672999999966,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 43,
    "ms": 442.06609999999637,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 44,
    "ms": 463.30159999999887,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 45,
    "ms": 544.9668999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 46,
    "ms": 452.90899999999965,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 47,
    "ms": 427.2940000000017,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 48,
    "ms": 498.0544000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 49,
    "ms": 529.3539999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 50,
    "ms": 455.55920000000333,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 51,
    "ms": 453.2497000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 52,
    "ms": 457.9225000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 53,
    "ms": 467.03770000000077,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 54,
    "ms": 454.72909999999683,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 55,
    "ms": 452.933100000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 56,
    "ms": 455.95060000000376,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 57,
    "ms": 459.47810000000027,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 58,
    "ms": 455.9573999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 59,
    "ms": 453.92809999999736,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 60,
    "ms": 440.5368000000017,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 61,
    "ms": 522.4572000000044,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 62,
    "ms": 585.2684000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 63,
    "ms": 524.9910000000018,
    "timedOut": false
   }
  ]
 },
 "mutants": {
  "m1": {
   "pid": 45664,
   "ms": 1199
  },
  "m2": {
   "pid": 5504,
   "ms": 1174
  },
  "m3": {
   "pid": 39536,
   "ms": 1180
  },
  "m4": {
   "pid": 36608,
   "ms": 1169
  }
 }
}
```
