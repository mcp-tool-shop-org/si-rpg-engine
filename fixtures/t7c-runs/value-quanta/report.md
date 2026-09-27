# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 12444 quanta and 23 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| js:packages/tick/predicates.js:quantaFor:106 | js | 106 | restore, window | 1 of 1 | observable |

## sweep

Proposed 213, refused 157, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 133 x move steps it; 9 x path crosses collider wall-west; 6 x nothing is under the point; 5 x path crosses collider step; 2 x path crosses collider ledge; 2 x path crosses collider wall-south

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 17, refused 10, admitted 7; ran 17 through the ladder, 0 left unrun by the budget.

Refusals: 3 x nothing is carried; 3 x path crosses collider ledge; 1 x actor is not in zone shelf; 1 x actor is not in zone yard; 1 x move steps it; 1 x path crosses collider wall-east

Rungs: 0 failed on the head 0, on the base 0; 1 reached 5; 2 differ 17; 3 fail 0, catches 0.

- c57: at tick 70, body walker, field x (bundle bundles/c57.bundle.json)

- c58: at tick 70, body walker, field x (bundle bundles/c58.bundle.json)

- c59: at tick 70, body walker, field x (bundle bundles/c59.bundle.json)

- c60: at tick 70, body walker, field x (bundle bundles/c60.bundle.json)

- c61: at tick 70, body walker, field x (bundle bundles/c61.bundle.json)

- c62: at tick 70, body walker, field x (bundle bundles/c62.bundle.json)

- c63: at tick 229, body walker, field x (bundle bundles/c63.bundle.json)

- c64: at tick 229, body walker, field x (bundle bundles/c64.bundle.json)

- c65: at tick 229, body walker, field x (bundle bundles/c65.bundle.json)

- c66: at tick 83, body walker, field x (bundle bundles/c66.bundle.json)

- c67: at tick 83, body walker, field x (bundle bundles/c67.bundle.json)

- c68: at tick 83, body walker, field x (bundle bundles/c68.bundle.json)

- c69: at tick 70, body walker, field x (bundle bundles/c69.bundle.json)

- c70: at tick 70, body walker, field x (bundle bundles/c70.bundle.json)

- c71: at tick 70, body walker, field x (bundle bundles/c71.bundle.json)

- c72: at tick 229, body walker, field x (bundle bundles/c72.bundle.json)

- c73: at tick 229, body walker, field x (bundle bundles/c73.bundle.json)

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 64, refused 64, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 62 x path crosses collider ledge; 2 x target must name a body

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

- caught: m1 + and - swapped at packages/tick/predicates.js:106
- survived: m2 numeric constant at packages/tick/predicates.js:106; m3 numeric constant at packages/tick/predicates.js:106
- not scored: m4 numeric constant at packages/tick/predicates.js:106; m5 numeric constant at packages/tick/predicates.js:106

## What was not measured

- notAimed: none
- notSeenApproximate: none
- notReached: none
- runsAtLoad: none
- noExecutableChange: none
- removed: none
- unrun: none
- mutantsNotReached: none
- mutantsNotScored: m4 (its run throws on c57: mutant m4 candidate: restore refused: the actions are actor ids, each with an action and its quanta still to run); m5 (its run throws on c57: mutant m5 candidate: restore refused: the actions are actor ids, each with an action and its quanta still to run)
- mutantsNone: none

## Environment

```
{
 "trees": {
  "head": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\quanta-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "a4dbfa52541428f65351c3ce9bc30369e58762dec0c1c0ddd8dc5566298b4bf0"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\quanta-base",
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
   "m4": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf",
   "m5": "625cd59cd718b654b637a1084a8bb25ee045889e144455ac3a3c5057621d1faf"
  }
 },
 "host": {
  "platform": "win32",
  "arch": "x64",
  "cpus": 24,
  "node": "v22.22.3"
 },
 "times": {
  "anchors": 1936,
  "product builds": 412,
  "processes": 562,
  "sweep fixtures/bench/room.json": 1784,
  "sweep ladder fixtures/bench/room.json": 1788,
  "grammar ladder fixtures/bench/room.json": 3868,
  "model fixtures/bench/room.json": 36224,
  "controls": 0,
  "mutants": 6772,
  "total": 53346
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-quanta",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-quanta\\work"
 },
 "processes": {
  "head": {
   "pid": 5504,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\quanta-head",
   "build": "product",
   "calls": 17,
   "ms": 3059,
   "quanta": 12444
  },
  "base": {
   "pid": 33844,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\quanta-base",
   "build": "product",
   "calls": 17,
   "ms": 1342,
   "quanta": 12434
  },
  "sweep": {
   "pid": 22416,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\quanta-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 687.7613000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 474.6961000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 466.1842999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 392.6279000000004,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 406.8264999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 448.42239999999947,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 463.3686999999991,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 550.1455999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 551.2931999999983,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 442.8114999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 484.85030000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 499.28210000000036,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 486.84090000000106,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 420.34039999999914,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 389.79779999999846,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 390.0605000000014,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 16,
    "ms": 389.1746000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 17,
    "ms": 372.52360000000044,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 18,
    "ms": 421.77760000000126,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 19,
    "ms": 393.28389999999854,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 20,
    "ms": 434.8664000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 21,
    "ms": 441.9298999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 22,
    "ms": 395.9448000000011,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 23,
    "ms": 596.4940999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 24,
    "ms": 735.8053,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 25,
    "ms": 607.8601000000017,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 26,
    "ms": 416.0060000000012,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 27,
    "ms": 514.1934000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 28,
    "ms": 470.6730000000025,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 29,
    "ms": 437.4730000000018,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 30,
    "ms": 536.4940999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 31,
    "ms": 592.226200000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 32,
    "ms": 474.66400000000067,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 33,
    "ms": 530.4488000000019,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 34,
    "ms": 442.8788999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 35,
    "ms": 453.97499999999854,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 36,
    "ms": 476.3084000000017,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 37,
    "ms": 432.79459999999744,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 38,
    "ms": 473.1794000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 39,
    "ms": 467.61699999999837,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 40,
    "ms": 510.1794000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 41,
    "ms": 500.83550000000105,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 42,
    "ms": 473.9259999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 43,
    "ms": 443.23149999999805,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 44,
    "ms": 818.6434999999983,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 45,
    "ms": 826.2252000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 46,
    "ms": 840.8594000000012,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 47,
    "ms": 742.0502000000015,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 48,
    "ms": 482.9881999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 49,
    "ms": 467.9143999999942,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 50,
    "ms": 882.6733999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 51,
    "ms": 492.1834999999992,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 52,
    "ms": 507.2179000000033,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 53,
    "ms": 481.3608000000022,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 54,
    "ms": 473.86909999999625,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 55,
    "ms": 473.0978000000032,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 56,
    "ms": 421.5397000000012,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 57,
    "ms": 529.7520999999979,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 58,
    "ms": 547.6851000000024,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 59,
    "ms": 444.02679999999964,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 60,
    "ms": 444.946100000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 61,
    "ms": 427.7598999999973,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 62,
    "ms": 496.4030999999959,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 63,
    "ms": 823.5757999999987,
    "timedOut": false
   }
  ]
 },
 "mutants": {
  "m1": {
   "pid": 44480,
   "ms": 190
  },
  "m2": {
   "pid": 31268,
   "ms": 1338
  },
  "m3": {
   "pid": 33920,
   "ms": 1378
  },
  "m4": {
   "pid": 46320,
   "ms": 154
  },
  "m5": {
   "pid": 6576,
   "ms": 157
  }
 }
}
```
