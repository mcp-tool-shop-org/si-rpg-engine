# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 12185 quanta and 30 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| js:packages/tick/world.js:createWorld/segmentHitsBox:371 | js | 371 | restore, window | 1 of 1 | observable |

## sweep

Proposed 238, refused 181, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 152 x move steps it; 11 x nothing is under the point; 9 x path crosses collider wall-west; 5 x path crosses collider step; 2 x path crosses collider ledge; 2 x path crosses collider wall-south

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 20, refused 14, admitted 6; ran 20 through the ladder, 0 left unrun by the budget.

Refusals: 4 x nothing is carried; 4 x path crosses collider ledge; 1 x actor is not in zone shelf; 1 x actor is not in zone yard; 1 x move steps it; 1 x path crosses collider wall-east; 1 x path crosses collider wall-west; 1 x target is beyond move range 3

Rungs: 0 failed on the head 0, on the base 0; 1 reached 12; 2 differ 11; 3 fail 0, catches 0.

- c58: admission differs at tick 104: move refused on the base (bundle bundles/c58.bundle.json)

- c59: admission differs at tick 104: move refused on the base (bundle bundles/c59.bundle.json)

- c60: admission differs at tick 104: move refused on the base (bundle bundles/c60.bundle.json)

- c67: admission differs at tick 36: move refused on the base (bundle bundles/c67.bundle.json)

- c68: admission differs at tick 36: move refused on the base (bundle bundles/c68.bundle.json)

- c69: admission differs at tick 36: move refused on the base (bundle bundles/c69.bundle.json)

- c70: admission differs at tick 104: move refused on the base (bundle bundles/c70.bundle.json)

- c71: admission differs at tick 104: move refused on the base (bundle bundles/c71.bundle.json)

- c72: admission differs at tick 104: move refused on the base (bundle bundles/c72.bundle.json)

- c76: admission differs at tick 104: move refused on the base (bundle bundles/c76.bundle.json)

- c77: admission differs at tick 104: move refused on the base (bundle bundles/c77.bundle.json)

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 64, refused 64, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 61 x path crosses collider ledge; 1 x path crosses collider wall-east; 1 x target must name a body; 1 x target must name a body or a zone

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 64 calls, 0 quanta, 0 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 0 quanta, 0 restores. New lines: none. New differences: none. Newly caught mutants: none.

## Mutants

The mutants measure the candidates' sensitivity at the change, not the aim, which is the access map's to measure.

- marked: m1 flipped comparison at packages/tick/world.js:371

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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\comparison-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "cd76bfb997b5326c5c82b81960251de015fbddd395eeb678109a181585d19c79"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\comparison-base",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "c55ed6a7127f15730618568fa655eef08192ebfd350a3d27a988fa3ae6c95b30"
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
   "m1": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf"
  }
 },
 "host": {
  "platform": "win32",
  "arch": "x64",
  "cpus": 24,
  "node": "v22.22.3"
 },
 "times": {
  "anchors": 2327,
  "product builds": 429,
  "processes": 567,
  "sweep fixtures/bench/room.json": 1883,
  "sweep ladder fixtures/bench/room.json": 1889,
  "grammar ladder fixtures/bench/room.json": 4029,
  "model fixtures/bench/room.json": 41856,
  "controls": 0,
  "mutants": 976,
  "total": 53956
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-comparison",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-comparison\\work"
 },
 "processes": {
  "head": {
   "pid": 24440,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\comparison-head",
   "build": "product",
   "calls": 20,
   "ms": 3273,
   "quanta": 12185
  },
  "base": {
   "pid": 42692,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\comparison-base",
   "build": "product",
   "calls": 20,
   "ms": 1556,
   "quanta": 14518
  },
  "sweep": {
   "pid": 30232,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\comparison-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 1001.6963000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 535.3599999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 536.5264999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 570.1324999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 519.8642,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 448.8636000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 532.4689999999991,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 532.6119999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 459.1257999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 522.1849999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 505.96730000000025,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 542.9779999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 558.3960999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 620.4696000000004,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 507.58740000000034,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 533.9723000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 16,
    "ms": 689.6754000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 17,
    "ms": 452.64960000000065,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 18,
    "ms": 521.8647999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 19,
    "ms": 560.0992000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 20,
    "ms": 518.887200000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 21,
    "ms": 680.0913999999975,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 22,
    "ms": 581.262999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 23,
    "ms": 680.9259999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 24,
    "ms": 618.7122000000018,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 25,
    "ms": 547.1938999999984,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 26,
    "ms": 579.6211000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 27,
    "ms": 579.4781000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 28,
    "ms": 595.5593999999983,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 29,
    "ms": 577.1467000000011,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 30,
    "ms": 515.6801000000014,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 31,
    "ms": 579.7842000000019,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 32,
    "ms": 630.9793000000027,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 33,
    "ms": 571.4228000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 34,
    "ms": 572.3967999999986,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 35,
    "ms": 615.8176000000021,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 36,
    "ms": 653.1140000000014,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 37,
    "ms": 610.7807999999968,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 38,
    "ms": 716.7484000000004,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 39,
    "ms": 572.6859999999979,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 40,
    "ms": 666.773000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 41,
    "ms": 605.2101000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 42,
    "ms": 606.3354999999938,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 43,
    "ms": 662.0018999999957,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 44,
    "ms": 711.4919000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 45,
    "ms": 540.4974000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 46,
    "ms": 601.0034999999989,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 47,
    "ms": 642.8176000000021,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 48,
    "ms": 499.1984999999986,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 49,
    "ms": 755.9858999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 50,
    "ms": 665.3574999999983,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 51,
    "ms": 591.034900000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 52,
    "ms": 593.9164999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 53,
    "ms": 654.0493999999962,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 54,
    "ms": 609.741399999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 55,
    "ms": 741.2224999999962,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 56,
    "ms": 630.7511999999988,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 57,
    "ms": 585.9841000000015,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 58,
    "ms": 575.0939999999973,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 59,
    "ms": 582.4807000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 60,
    "ms": 764.0306999999957,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 61,
    "ms": 557.3726999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 62,
    "ms": 565.2180000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 63,
    "ms": 676.0386999999973,
    "timedOut": false
   }
  ]
 },
 "mutants": {
  "m1": {
   "pid": 34040,
   "ms": 203
  }
 }
}
```
