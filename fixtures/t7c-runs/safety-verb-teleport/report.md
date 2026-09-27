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

Refusals: 10 x move steps it; 6 x path crosses collider step

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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-head",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "63d8cb40dac361b6b80bfbbb74b1ab1c6716fdaf3348766eeba4ea66a81fe2d7"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-base",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "63d8cb40dac361b6b80bfbbb74b1ab1c6716fdaf3348766eeba4ea66a81fe2d7"
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
  "product builds": 419,
  "processes": 563,
  "sweep fixtures/bench/room.json": 1901,
  "sweep ladder fixtures/bench/room.json": 1907,
  "grammar ladder fixtures/bench/room.json": 4291,
  "model fixtures/bench/room.json": 8022,
  "controls": 0,
  "mutants": 0,
  "total": 19185
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-safety\\safety-verb-teleport",
  "work": "E:\\AI\\si-verify\\t7c-safety\\safety-verb-teleport\\work"
 },
 "processes": {
  "head": {
   "pid": 42364,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-head",
   "build": "product",
   "calls": 27,
   "ms": 3524,
   "quanta": 12704
  },
  "base": {
   "pid": 47276,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-base",
   "build": "product",
   "calls": 27,
   "ms": 1483,
   "quanta": 12704
  },
  "sweep": {
   "pid": 37040,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 636.0061000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 450.22879999999986,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 405.4529000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 515.0960000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 396.03269999999975,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 498.679900000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 453.4243999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 391.34770000000026,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 401.1345000000001,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 399.52869999999893,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 408.6936000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 415.26840000000084,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 409.3804999999993,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 435.3711000000003,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 443.70970000000125,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 417.53139999999985,
    "timedOut": false
   }
  ]
 }
}
```
