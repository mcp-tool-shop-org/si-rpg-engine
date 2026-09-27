# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 38681 quanta and 23 restores.

Binaries: solver/ differs: each tree built its own binary from its own source, in its own target directory. Coverage build: made; its product-scene trace equals the head product build's, frame for frame, over 10000 quanta.

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| law:solver/src/kcc.rs:Stride::move_shape:137 | law | 137 | restore, window | 1 of 1 | unknown |

## sweep

Proposed 194, refused 138, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 80 x move steps it; 22 x target is beyond pick-up range 3; 22 x target is beyond push range 3; 14 x nothing is under the point

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 15, refused 9, admitted 6; ran 15 through the ladder, 0 left unrun by the budget.

Refusals: 1 x actor is not in zone east; 1 x actor is not in zone west; 1 x move steps it; 1 x nothing is under the point; 1 x target is beyond climb range 3; 1 x target is beyond move range 3; 1 x target is beyond pick-up range 3; 1 x target is beyond push range 3; 1 x target is beyond use range 2

Rungs: 0 failed on the head 0, on the base 0; 1 reached 6; 2 differ 12; 3 fail 1, catches 0.

- c58: at tick 190, body climber, field x (bundle bundles/c58.bundle.json)

- c61: at tick 307, body walker, field x (bundle bundles/c61.bundle.json)

- c62: at tick 223, body walker, field x (bundle bundles/c62.bundle.json)

- c63: at tick 223, body walker, field x (bundle bundles/c63.bundle.json)

- c64: at tick 223, body walker, field x (bundle bundles/c64.bundle.json)

- c65: at tick 195, body walker, field x (bundle bundles/c65.bundle.json)

- c66: at tick 195, body walker, field x (bundle bundles/c66.bundle.json)

- c67: at tick 195, body walker, field x (bundle bundles/c67.bundle.json)

- c68: at tick 190, body climber, field x (bundle bundles/c68.bundle.json)

- c69: at tick 190, body climber, field x (bundle bundles/c69.bundle.json)

- c70: at tick 190, body climber, field x (bundle bundles/c70.bundle.json)

- c71: at tick 221, body walker, field x (bundle bundles/c71.bundle.json)

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 64, refused 64, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 49 x target is beyond push range 3; 8 x target must name a body; 5 x target is beyond move range 3; 1 x target is beyond climb range 3; 1 x target is the actor

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 2, refused 0, admitted 2; ran 2 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 2; 2 differ 2; 3 fail 0, catches 0.

Flood: every one of the 2 candidates compared differs the same way: at tick 98, body walker, field x

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

product scene: the model starts at the end of the grammar's budget.
Arm M: 64 calls, 0 quanta, 0 restores. New lines: none. New differences: none. Newly caught mutants: none.
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
- mutantsNone: law:solver/src/kcc.rs:Stride::move_shape:137 (a changed executable line no operator applies to (line 137))

## Environment

```
{
 "trees": {
  "head": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\F2-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "cd76bfb997b5326c5c82b81960251de015fbddd395eeb678109a181585d19c79"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\F2-base",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "8f49d683fc768fa95f3b7880316a83a524de1521b66f81eb28bc18f5a3665b61"
  }
 },
 "binaries": {
  "head": "9ff6d183d8c76ead2a3b37ab59df3bf1f7336f654d854d6bf186e47e98b46f3e",
  "base": "c414222444052c7e9f58821c6bba088479251d55fef8c195b4ff16e711e2c682",
  "files": {
   "head": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "base": "98c287a5670419b631af11123698e2747fa8076395a289f20d804ca7f76328ab"
  },
  "coverage": "1229b744efc2635ce9d4f7bdc0c2b8f53bd35e68c2cbb12aa31950fc0be47f03"
 },
 "host": {
  "platform": "win32",
  "arch": "x64",
  "cpus": 24,
  "node": "v22.22.3"
 },
 "times": {
  "anchors": 2117,
  "product builds": 60778,
  "coverage build": 37265,
  "processes": 743,
  "coverage check": 2506,
  "sweep product scene": 3050,
  "sweep ladder product scene": 4433,
  "grammar ladder product scene": 7238,
  "model product scene": 32158,
  "controls": 6872,
  "mutants": 4,
  "total": 157164
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-F2",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-F2\\work"
 },
 "processes": {
  "head": {
   "pid": 35296,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\F2-head",
   "build": "product",
   "calls": 15,
   "ms": 4836,
   "quanta": 12081
  },
  "base": {
   "pid": 34984,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\F2-base",
   "build": "product",
   "calls": 15,
   "ms": 2032,
   "quanta": 12101
  },
  "head coverage": {
   "pid": 46088,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\F2-head",
   "build": "coverage",
   "calls": 15,
   "ms": 2273,
   "quanta": 12081
  },
  "sweep": {
   "pid": 23616,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\F2-head",
   "build": "coverage"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "product scene",
    "call": 0,
    "ms": 848.8719999999994,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 1,
    "ms": 380.3140000000003,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 2,
    "ms": 321.83550000000105,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 3,
    "ms": 275.41049999999996,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 4,
    "ms": 407.6419999999998,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 5,
    "ms": 340.8014000000003,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 6,
    "ms": 404.20750000000044,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 7,
    "ms": 381.6421999999984,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 8,
    "ms": 551.3113000000012,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 9,
    "ms": 533.179500000002,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 10,
    "ms": 519.4519999999975,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 11,
    "ms": 526.6446999999971,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 12,
    "ms": 526.3614999999991,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 13,
    "ms": 415.83309999999983,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 14,
    "ms": 475.9147000000012,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 15,
    "ms": 436.21240000000034,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 16,
    "ms": 398.20850000000064,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 17,
    "ms": 412.02609999999913,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 18,
    "ms": 441.31760000000213,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 19,
    "ms": 423.46259999999893,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 20,
    "ms": 398.29449999999997,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 21,
    "ms": 476.5191999999988,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 22,
    "ms": 428.7957999999999,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 23,
    "ms": 407.51840000000084,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 24,
    "ms": 404.54729999999836,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 25,
    "ms": 395.71770000000106,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 26,
    "ms": 397.59969999999885,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 27,
    "ms": 389.89240000000063,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 28,
    "ms": 393.6444999999985,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 29,
    "ms": 478.9572999999982,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 30,
    "ms": 388.7331000000013,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 31,
    "ms": 420.704099999999,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 32,
    "ms": 452.1241000000009,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 33,
    "ms": 397.78939999999784,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 34,
    "ms": 422.7939000000006,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 35,
    "ms": 478.00510000000213,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 36,
    "ms": 460.7201000000023,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 37,
    "ms": 398.9974000000002,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 38,
    "ms": 514.261599999998,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 39,
    "ms": 514.7866999999969,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 40,
    "ms": 395.18560000000434,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 41,
    "ms": 483.2780999999959,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 42,
    "ms": 482.00760000000446,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 43,
    "ms": 519.6372000000047,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 44,
    "ms": 413.8081999999995,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 45,
    "ms": 516.3597000000009,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 46,
    "ms": 461.2569999999978,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 47,
    "ms": 439.8724000000002,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 48,
    "ms": 430.6030000000028,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 49,
    "ms": 449.30920000000333,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 50,
    "ms": 471.2300999999934,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 51,
    "ms": 441.61880000000383,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 52,
    "ms": 459.4699000000037,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 53,
    "ms": 473.66689999999653,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 54,
    "ms": 544.9484000000011,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 55,
    "ms": 445.83320000000094,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 56,
    "ms": 412.04879999999685,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 57,
    "ms": 404.43159999999625,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 58,
    "ms": 413.76230000000214,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 59,
    "ms": 460.20529999999417,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 60,
    "ms": 461.5023000000001,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 61,
    "ms": 503.7992000000013,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 62,
    "ms": 381.42489999999816,
    "timedOut": false
   },
   {
    "world": "product scene",
    "call": 63,
    "ms": 411.5243000000046,
    "timedOut": false
   }
  ]
 },
 "mapping": {
  "windows": 91,
  "ms": 47908
 }
}
```
