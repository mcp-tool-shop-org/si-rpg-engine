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

## control

Proposed 0, refused 0, admitted 0; ran 0 through the ladder, 0 left unrun by the budget.

Rungs: 0 failed on the head 0, on the base 0; 1 reached 0; 2 differ 0; 3 fail 0, catches 0.

Late gain: n=8 no stall; n=16 no stall; n=32 no stall; n=64 no stall; n=128 no stall.

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
  "anchors": 438,
  "product builds": 429,
  "processes": 559,
  "sweep fixtures/bench/room.json": 1871,
  "sweep ladder fixtures/bench/room.json": 1876,
  "grammar ladder fixtures/bench/room.json": 4321,
  "controls": 0,
  "mutants": 0,
  "total": 9494
 },
 "paths": {
  "out": "E:\\AI\\si-verify\\t7c-safety\\safety-verb-teleport-off",
  "work": "E:\\AI\\si-verify\\t7c-safety\\safety-verb-teleport-off\\work"
 },
 "processes": {
  "head": {
   "pid": 31616,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-head",
   "build": "product",
   "calls": 27,
   "ms": 3565,
   "quanta": 12704
  },
  "base": {
   "pid": 18396,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-base",
   "build": "product",
   "calls": 27,
   "ms": 1490,
   "quanta": 12704
  },
  "sweep": {
   "pid": 47376,
   "tree": "<home>\\AppData\\Local\\Temp\\si-rpg-bench-t7c-Retjc1\\clean-head",
   "build": "product"
  }
 }
}
```
