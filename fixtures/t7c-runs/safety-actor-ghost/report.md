# Bench report

Seed 1. Budgets: sweep 6000 quanta and 60 restores per world; ladder 12000 quanta and 120 restores per proposer per world. Spent: 14380 quanta and 48 restores.

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

Proposed 16, refused 11, admitted 5; ran 5 through the ladder, 0 left unrun by the budget.

Refusals: 11 x over budget: 4 admissions in the last 64 quanta, and role instrument-copy allows 4

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

## Arms

fixtures/bench/room.json: the model starts at the end of the grammar's budget.
Arm M: 16 calls, 1676 quanta, 5 restores. New lines: none. New differences: none. Newly caught mutants: none.
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
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-aGudIU\\clean-head",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "91aaf6bf9be61c468f3126e6cc04b9c74c89243f63fa0881ad319cc7ad3202e5"
  },
  "base": {
   "path": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-aGudIU\\clean-base",
   "commit": "06c18dbc5432aaed2a747d7dee07223a3f1e42ad",
   "digest": "91aaf6bf9be61c468f3126e6cc04b9c74c89243f63fa0881ad319cc7ad3202e5"
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
  "anchors": 2191,
  "product builds": 431,
  "processes": 562,
  "sweep fixtures/bench/room.json": 1899,
  "sweep ladder fixtures/bench/room.json": 1905,
  "grammar ladder fixtures/bench/room.json": 4365,
  "model fixtures/bench/room.json": 8739,
  "controls": 0,
  "mutants": 1,
  "total": 20093
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-safety\\safety-actor-ghost",
  "work": "E:\\AI\\si-verify\\t7c-safety\\safety-actor-ghost\\work"
 },
 "processes": {
  "head": {
   "pid": 28596,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-aGudIU\\clean-head",
   "build": "product",
   "calls": 34,
   "ms": 4613,
   "quanta": 17006
  },
  "base": {
   "pid": 40140,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-aGudIU\\clean-base",
   "build": "product",
   "calls": 34,
   "ms": 1893,
   "quanta": 17006
  },
  "sweep": {
   "pid": 39308,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-aGudIU\\clean-head",
   "build": "product"
  }
 },
 "model": {
  "timeouts": 0,
  "calls": [
   {
    "world": "fixtures/bench/room.json",
    "call": 0,
    "ms": 641.7249000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 1,
    "ms": 398.7593999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 2,
    "ms": 397.3000000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 3,
    "ms": 381.4897999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 4,
    "ms": 394.15949999999975,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 5,
    "ms": 418.04979999999887,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 6,
    "ms": 265.4470999999994,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 7,
    "ms": 349.1214,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 8,
    "ms": 368.21810000000005,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 9,
    "ms": 379.8906999999999,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 10,
    "ms": 464.9968000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 11,
    "ms": 465.6074000000008,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 12,
    "ms": 470.2654999999995,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 13,
    "ms": 467.5653000000002,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 14,
    "ms": 381.34319999999934,
    "timedOut": false
   },
   {
    "world": "fixtures/bench/room.json",
    "call": 15,
    "ms": 352.6098000000002,
    "timedOut": false
   }
  ]
 }
}
```
