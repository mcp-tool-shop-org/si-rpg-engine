# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 17305 quanta and 34 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| top-level:packages/tick/predicates.js:STEP_HEIGHT:10 | top-level | 10 | restore, window | 0 of 1 | observable |

## sweep

Proposed 189, refused 132, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 116 x move steps it; 6 x path crosses collider wall-west; 5 x path crosses collider step; 3 x nothing is under the point; 2 x path crosses collider ledge

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 19, refused 11, admitted 8; ran 19 through the ladder, 0 left unrun by the budget.

Refusals: 3 x move steps it; 2 x path crosses collider ledge; 1 x actor is already carrying; 1 x nothing is under the point; 1 x path crosses collider wall-east; 1 x path crosses collider wall-south; 1 x rise is past maxRise; 1 x target is beyond climb range 3

Rungs: 0 failed on the head 0, on the base 0; 1 reached 7; 2 differ 3; 3 fail 0, catches 0.

- c70: admission differs at tick 36: climb refused on the base (bundle bundles/c70.bundle.json)

- c71: admission differs at tick 36: climb refused on the base (bundle bundles/c71.bundle.json)

- c72: admission differs at tick 36: climb refused on the base (bundle bundles/c72.bundle.json)

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 64, refused 57, admitted 7; ran 7 through the ladder, 0 left unrun by the budget.

Refusals: 42 x over budget: 4 admissions in the last 64 quanta, and role instrument-copy allows 4; 15 x move steps it

Rungs: 0 failed on the head 0, on the base 0; 1 reached 4; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 64 calls, 4837 quanta, 7 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 2905 quanta, 8 restores, extended past the grammar's budget. New lines: none. New differences: none. Newly caught mutants: none.

## Mutants

The mutants measure the candidates' sensitivity at the change, not the aim, which is the access map's to measure.

- survived: m1 numeric constant at packages/tick/predicates.js:10; m2 numeric constant at packages/tick/predicates.js:10; m3 numeric constant at packages/tick/predicates.js:10; m4 numeric constant at packages/tick/predicates.js:10

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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\stepHeight-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "7e945ddfa08417a523b43c1f6f80c77721da3e50996c013b5ee2d81486981fcc"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\stepHeight-base",
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
  "anchors": 2140,
  "product builds": 391,
  "processes": 582,
  "sweep fixtures/bench/room.json": 1895,
  "sweep ladder fixtures/bench/room.json": 1900,
  "grammar ladder fixtures/bench/room.json": 4052,
  "model fixtures/bench/room.json": 39916,
  "controls": 0,
  "mutants": 10379,
  "total": 61255
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-stepHeight",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-stepHeight\\work"
 },
 "processes": {
  "head": {
   "pid": 44452,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\stepHeight-head",
   "build": "product",
   "calls": 31,
   "ms": 5348,
   "quanta": 20210
  },
  "base": {
   "pid": 3772,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\stepHeight-base",
   "build": "product",
   "calls": 31,
   "ms": 2140,
   "quanta": 20780
  },
  "sweep": {
   "pid": 34676,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\stepHeight-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 882.1055999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 557.4060999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 514.8850999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 720.2343000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 505.7641000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 394.9899000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 482.3172000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 605.9920000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 777.4922000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 495.6327000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 565.1923999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 501.91449999999895,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 621.2207000000017,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 607.949099999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 550.497800000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 514.9923999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 16,
    "ms": 577.6929999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 17,
    "ms": 575.1706000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 18,
    "ms": 591.5446000000011,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 19,
    "ms": 584.7687000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 20,
    "ms": 537.0514000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 21,
    "ms": 495.5115000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 22,
    "ms": 608.5427999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 23,
    "ms": 465.08710000000065,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 24,
    "ms": 484.377800000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 25,
    "ms": 558.5561999999991,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 26,
    "ms": 495.7474000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 27,
    "ms": 536.1668000000027,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 28,
    "ms": 593.112299999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 29,
    "ms": 509.90789999999834,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 30,
    "ms": 500.8634999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 31,
    "ms": 504.34200000000055,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 32,
    "ms": 485.490600000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 33,
    "ms": 476.78640000000087,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 34,
    "ms": 580.9061000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 35,
    "ms": 616.8575999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 36,
    "ms": 495.8035000000018,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 37,
    "ms": 465.1974000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 38,
    "ms": 470.6909000000014,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 39,
    "ms": 564.417599999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 40,
    "ms": 414.12749999999505,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 41,
    "ms": 555.4565999999977,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 42,
    "ms": 359.6484999999957,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 43,
    "ms": 455.95000000000437,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 44,
    "ms": 455.49810000000434,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 45,
    "ms": 464.24489999999787,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 46,
    "ms": 448.0673999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 47,
    "ms": 446.83550000000105,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 48,
    "ms": 438.06129999999393,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 49,
    "ms": 430.0587999999989,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 50,
    "ms": 441.00309999999445,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 51,
    "ms": 448.92959999999584,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 52,
    "ms": 442.27100000000064,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 53,
    "ms": 448.93419999999605,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 54,
    "ms": 447.0601000000024,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 55,
    "ms": 446.5448000000033,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 56,
    "ms": 435.5561000000016,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 57,
    "ms": 445.3523000000059,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 58,
    "ms": 456.3824999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 59,
    "ms": 442.4259999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 60,
    "ms": 434.39820000000327,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 61,
    "ms": 436.4714000000022,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 62,
    "ms": 443.9835000000021,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 63,
    "ms": 479.9270000000033,
    "timedOut": false
   }
  ]
 },
 "mutants": {
  "m1": {
   "pid": 39004,
   "ms": 1598
  },
  "m2": {
   "pid": 5796,
   "ms": 1604
  },
  "m3": {
   "pid": 10312,
   "ms": 1579
  },
  "m4": {
   "pid": 43580,
   "ms": 1570
  }
 }
}
```
