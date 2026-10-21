import type { SimObject, ZoneId } from '../types/robotProgram';

/** Schematic tabletop scene used by the browser simulator. Units: millimetres. Origin: front-left table corner. */
export interface SceneZone {
  id: ZoneId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const sceneZones: SceneZone[] = [
{ id: 'A', label: 'Bin A', x: 60, y: 280, w: 120, h: 90 },
{ id: 'B', label: 'Handoff B', x: 240, y: 150, w: 120, h: 100 },
{ id: 'C', label: 'Bin C', x: 420, y: 280, w: 120, h: 90 }];


export const sceneObjects: SimObject[] = [
{ id: 'red', label: 'Red cube', color: '#C2412D', x: 120, y: 150, z: 0, heldBy: null },
{ id: 'blue', label: 'Blue cube', color: '#2F5DA8', x: 480, y: 150, z: 0, heldBy: null },
{ id: 'green', label: 'Green cylinder', color: '#3C8A55', x: 300, y: 330, z: 0, heldBy: null }];