# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 12881 quanta and 23 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| rule:predicates/intents/climb.json:climb | rule | 5 | restore, window | 1 of 1 | observable |
| catalog:predicates/intents/index.json:retire use | catalog | 10 | not reached | 0 of 1 | observable |

## sweep

Proposed 238, refused 181, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 152 x move steps it; 11 x nothing is under the point; 9 x path crosses collider wall-west; 5 x path crosses collider step; 2 x path crosses collider ledge; 2 x path crosses collider wall-south

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 16, refused 9, admitted 7; ran 16 through the ladder, 0 left unrun by the budget.

Refusals: 4 x move steps it; 2 x rise is past maxRise; 1 x path crosses collider ledge; 1 x path crosses collider wall-east; 1 x path crosses collider wall-south

Rungs: 0 failed on the head 0, on the base 0; 1 reached 6; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 64, refused 63, admitted 1; ran 1 through the ladder, 0 left unrun by the budget.

Refusals: 45 x move steps it; 17 x target must be a point; 1 x nothing is carried

Rungs: 0 failed on the head 0, on the base 0; 1 reached 1; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 64 calls, 528 quanta, 1 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 635 quanta, 1 restores, extended past the grammar's budget. New lines: none. New differences: none. Newly caught mutants: none.

## Mutants

The mutants measure the candidates' sensitivity at the change, not the aim, which is the access map's to measure.


## What was not measured

- notAimed: none
- notSeenApproximate: none
- notReached: catalog:predicates/intents/index.json:retire use
- runsAtLoad: none
- noExecutableChange: none
- removed: none
- unrun: none
- mutantsNotReached: none
- mutantsNotScored: none
- mutantsNone: rule:predicates/intents/climb.json:climb (a rule change that is not a number (line 5)); catalog:predicates/intents/index.json:retire use (a catalog line is not a number)

## Environment

```
{
 "trees": {
  "head": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\ruleFlag-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "f8c18211ab4f53a9347f6b394da0187b0371146a0d95a2db7737a181c70e32a2"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\ruleFlag-base",
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
  }
 },
 "host": {
  "platform": "win32",
  "arch": "x64",
  "cpus": 24,
  "node": "v22.22.3"
 },
 "times": {
  "anchors": 2082,
  "product builds": 415,
  "processes": 547,
  "sweep fixtures/bench/room.json": 1871,
  "sweep ladder fixtures/bench/room.json": 1876,
  "grammar ladder fixtures/bench/room.json": 3882,
  "model fixtures/bench/room.json": 34265,
  "controls": 0,
  "mutants": 2,
  "total": 44940
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-ruleFlag",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-ruleFlag\\work"
 },
 "processes": {
  "head": {
   "pid": 22520,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\ruleFlag-head",
   "build": "product",
   "calls": 18,
   "ms": 3329,
   "quanta": 13516
  },
  "base": {
   "pid": 19136,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\ruleFlag-base",
   "build": "product",
   "calls": 18,
   "ms": 1448,
   "quanta": 13516
  },
  "sweep": {
   "pid": 40388,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\ruleFlag-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 756.5707000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 475.28269999999975,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 417.65380000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 462.8616000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 535.6347999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 492.9997999999996,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 492.64780000000064,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 517.1778000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 533.5535999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 510.64969999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 504.7687999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 432.28130000000056,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 509.0061999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 508.6448999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 508.84670000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 524.6671000000006,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 16,
    "ms": 519.7181999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 17,
    "ms": 422.4573999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 18,
    "ms": 428.5068999999985,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 19,
    "ms": 509.0829999999987,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 20,
    "ms": 400.310300000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 21,
    "ms": 538.1640000000007,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 22,
    "ms": 421.0481,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 23,
    "ms": 397.66170000000056,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 24,
    "ms": 399.5650999999998,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 25,
    "ms": 420.76940000000104,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 26,
    "ms": 402.5064999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 27,
    "ms": 486.72999999999956,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 28,
    "ms": 500.869200000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 29,
    "ms": 483.0074999999997,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 30,
    "ms": 467.46229999999923,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 31,
    "ms": 484.204099999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 32,
    "ms": 401.1730000000025,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 33,
    "ms": 423.14370000000054,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 34,
    "ms": 435.3172000000013,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 35,
    "ms": 472.8525000000009,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 36,
    "ms": 386.880799999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 37,
    "ms": 494.7289000000019,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 38,
    "ms": 492.6810000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 39,
    "ms": 415.4314999999988,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 40,
    "ms": 523.5010000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 41,
    "ms": 478.9422999999988,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 42,
    "ms": 494.09159999999974,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 43,
    "ms": 413.58740000000034,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 44,
    "ms": 409.7403999999988,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 45,
    "ms": 531.186700000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 46,
    "ms": 403.6106,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 47,
    "ms": 432.72320000000036,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 48,
    "ms": 422.3063000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 49,
    "ms": 498.34950000000026,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 50,
    "ms": 421.7758000000031,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 51,
    "ms": 523.9852000000028,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 52,
    "ms": 512.2972999999984,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 53,
    "ms": 415.05219999999827,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 54,
    "ms": 549.4628999999986,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 55,
    "ms": 424.39370000000054,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 56,
    "ms": 430.88840000000346,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 57,
    "ms": 539.6766999999963,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 58,
    "ms": 434.8970000000045,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 59,
    "ms": 516.4683999999979,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 60,
    "ms": 535.4896999999983,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 61,
    "ms": 417.73219999999856,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 62,
    "ms": 481.3992999999973,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 63,
    "ms": 557.1508000000031,
    "timedOut": false
   }
  ]
 }
}
```
