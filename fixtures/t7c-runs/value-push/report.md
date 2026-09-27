# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 24820 quanta and 20 restores.

Binaries: solver/ has no diff: every tree runs the head's product binary file, copied byte for byte. Coverage build: not made (no law anchor).

## Anchors

| anchor | kind | lines | reached by | changed lines reached | observable |
| --- | --- | --- | --- | --- | --- |
| rule:predicates/intents/push.json:push | rule | 3 | restore, window | 1 of 1 | observable |

## sweep

Proposed 208, refused 149, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Refusals: 130 x move steps it; 6 x nothing is under the point; 5 x path crosses collider step; 3 x path crosses collider wall-south; 3 x path crosses collider wall-west; 2 x path crosses collider ledge

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## grammar

Proposed 11, refused 2, admitted 9; ran 11 through the ladder, 0 left unrun by the budget.

Refusals: 1 x actor is not in zone yard; 1 x nothing is carried

Rungs: 0 failed on the head 0, on the base 0; 1 reached 8; 2 differ 11; 3 fail 0, catches 0.

- c60: at tick 37, body walker, field x (bundle bundles/c60.bundle.json)

- c61: at tick 37, body walker, field x (bundle bundles/c61.bundle.json)

- c62: at tick 37, body walker, field x (bundle bundles/c62.bundle.json)

- c63: at tick 105, body walker, field x (bundle bundles/c63.bundle.json)

- c64: at tick 105, body walker, field x (bundle bundles/c64.bundle.json)

- c65: at tick 105, body walker, field x (bundle bundles/c65.bundle.json)

- c66: at tick 37, body walker, field x (bundle bundles/c66.bundle.json)

- c67: at tick 37, body walker, field x (bundle bundles/c67.bundle.json)

- c68: at tick 37, body walker, field x (bundle bundles/c68.bundle.json)

- c69: at tick 105, body walker, field x (bundle bundles/c69.bundle.json)

- c70: at tick 105, body walker, field x (bundle bundles/c70.bundle.json)

Late gain: n=8 stalled at c70, then 0 lines and 0 differences; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## model

Proposed 8, refused 0, admitted 8; ran 8 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 8; 2 differ 8; 3 fail 0, catches 0.

Flood: every one of the 8 candidates compared differs the same way: at tick 1, body walker, field x

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 8 calls, 12240 quanta, 8 restores. New lines: none. New differences: none. Newly caught mutants: none.
Arm G: 2965 quanta, 8 restores, extended past the grammar's budget. New lines: none. New differences: none. Newly caught mutants: none.

## Mutants

The mutants measure the candidates' sensitivity at the change, not the aim, which is the access map's to measure.

- caught: m1 numeric constant at predicates/intents/push.json:3; m2 numeric constant at predicates/intents/push.json:3; m3 numeric constant at predicates/intents/push.json:3; m4 numeric constant at predicates/intents/push.json:3

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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\push-head",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "638fa11135c4efc692e4b05fd855e2d63a7a0f8ac14558ef5ffe9fb774e4d891"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\push-base",
   "commit": "df24f4d82b6e60c31abb66d98db0ac5f0d270b2d",
   "digest": "05438b1a465967367f2345eb640e4383fb414304d75a62cd5aacdba306d5919f"
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
  "anchors": 1753,
  "product builds": 385,
  "processes": 548,
  "sweep fixtures/bench/room.json": 1851,
  "sweep ladder fixtures/bench/room.json": 1856,
  "grammar ladder fixtures/bench/room.json": 3554,
  "model fixtures/bench/room.json": 8102,
  "controls": 0,
  "mutants": 4322,
  "total": 22371
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-runs\\value-push",
  "work": "E:\\AI\\si-verify\\t7c-runs\\value-push\\work"
 },
 "processes": {
  "head": {
   "pid": 12176,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\push-head",
   "build": "product",
   "calls": 25,
   "ms": 6135,
   "quanta": 27785
  },
  "base": {
   "pid": 30220,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\push-base",
   "build": "product",
   "calls": 25,
   "ms": 2585,
   "quanta": 27413
  },
  "sweep": {
   "pid": 32784,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Z6wEJ7\\push-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 741.9391000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 359.08549999999923,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 459.48119999999926,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 411.09630000000016,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 400.52509999999893,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 487.2566999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 418.17029999999977,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 430.29269999999997,
    "timedOut": false
   }
  ]
 },
 "mutants": {
  "m1": {
   "pid": 12076,
   "ms": 212
  },
  "m2": {
   "pid": 24528,
   "ms": 218
  },
  "m3": {
   "pid": 24536,
   "ms": 210
  },
  "m4": {
   "pid": 9572,
   "ms": 211
  }
 }
}
```
