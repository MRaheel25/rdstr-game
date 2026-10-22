// Halcyon Bay master layout (metres). +x east, +z south (north is -z).
export const GRID_XS = [-480, -360, -240, -120, 0, 120, 240, 360, 480];
export const GRID_ZS = [-480, -360, -240, -120, 0, 120, 240, 360, 480];
export const RING = { hx: 600, hz: 600, r: 200, y: 12, width: 24 };
export const WATER_Y = -1.5;
export const LAND = { west: -680, south: 1000, canalX0: 900, canalX1: 980, east: 1320, north: -700 };
export const HARBOR_BLVD_Z = 680;
export const PROMENADE_X = -650;
export const TRAIN_Z = -120;

export const DISTRICTS = [
  { id: 'downtown', name: 'Downtown Core', test: (x, z) => Math.abs(x) <= 500 && Math.abs(z) <= 500 },
  { id: 'highway', name: 'Highway Ring', test: (x, z) => Math.abs(Math.max(Math.abs(x), Math.abs(z)) - 600) < 40 },
  { id: 'harbor', name: 'Harbor & Docks', test: (x, z) => z > 620 },
  { id: 'construction', name: 'Construction Zone', test: (x, z) => x > 620 },
  { id: 'canyon', name: 'Hillside Canyon', test: (x, z) => z < -640 },
  { id: 'waterfront', name: 'Waterfront', test: (x, z) => x < -620 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d;
  return DISTRICTS[0];
}

// V2 neighbourhoods inside the downtown grid (lot index ranges, 120 m lots from -480).
export const AREAS = [
  { id: 'citypark', name: 'City Park', i: [0, 1], j: [1, 2] },
  { id: 'shopping', name: 'Shopping District', i: [0, 3], j: [5, 7] },
  { id: 'residential', name: 'Residential Hills', i: [5, 7], j: [0, 2] },
];
export const inArea = (a, i, j) => i >= a.i[0] && i <= a.i[1] && j >= a.j[0] && j <= a.j[1];

// Name of the place at (x, z): a neighbourhood if inside one, else the district.
export function placeName(x, z) {
  if (Math.abs(x) < 480 && Math.abs(z) < 480) {
    const i = Math.floor((x + 480) / 120);
    const j = Math.floor((z + 480) / 120);
    const a = AREAS.find((ar) => inArea(ar, i, j));
    if (a) return a.name;
  }
  return districtAt(x, z).name;
}
