import type { BotPersonalityId, FxEvent, PowerupType, RoundPhase } from "../data/types";

// Wire protocol shared by the Colyseus server and the client.
// Snapshots are broadcast ~20Hz; the client interpolates between them.

export interface NetInput {
  moveX: number;
  moveZ: number;
  magnet: boolean;
  dash: boolean;
  activate: boolean;
}

export interface SnapPlayer {
  id: number;
  name: string;
  c: string; // colorHex
  ci: number; // colorIndex
  tm: number; // team id
  s: number; // score
  bs: number; // bank streak count
  bt: number; // bank streak remaining seconds
  lv: number; // survival lives, 0 outside survival
  cl: number; // cluster length
  al: boolean; // alive
  bot: boolean;
  bp: BotPersonalityId | null; // bot personality, hidden for human-controlled seats
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  mag: boolean; // magnet active
  hp: PowerupType | null; // held powerup
  dc: number; // dash cooldown
  buffs: [PowerupType, number][]; // [type, remaining seconds]
}

export interface SnapMarble {
  x: number;
  z: number;
  y: number;
  c: string;
  r: number;
  j: boolean; // jumbo
  st: number; // 0 dead, 1 free, 2 carried, 3 falling
}

export interface SnapGoal {
  id: number;
  tm: number; // team id
  c: string;
  a: number; // angle
  x: number;
  z: number;
  r: number;
  bl: number; // blocked remaining seconds
}

export interface SnapPickup {
  id: number;
  x: number;
  z: number;
  t: PowerupType;
  on: boolean;
}

export interface SnapButton {
  id: number;
  x: number;
  z: number;
  tg: number; // target goal owner
  cd: number; // cooldown remaining
  fl: number; // pressed flash
}

export interface SnapRing {
  id: number;
  x: number;
  z: number;
  r: number;
  tg: number; // target goal owner
  sp: number; // spin phase
}

export interface Snapshot {
  t: number; // server sim time
  phase: RoundPhase;
  mode: string;
  round: number;
  rounds: number;
  roundTime: number;
  intro: number;
  sd: boolean; // sudden death
  win: number; // winner id
  players: SnapPlayer[];
  marbles: SnapMarble[];
  goals: SnapGoal[];
  pickups: SnapPickup[];
  buttons: SnapButton[];
  rings: SnapRing[];
  fx: FxEvent[]; // events since last snapshot
}
