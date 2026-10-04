import {
  epsgResolver as fetchFromEpsgIo,
  type EpsgResolver,
  parseWkt,
  type ProjJson,
} from "@developmentseed/proj";

/**
 * EPSG:4326 as PROJJSON, trimmed from https://epsg.io/4326.json (the datum
 * ensemble members, usage and bbox are dropped). `parseWkt` yields the
 * identical definition for this and the full document.
 */
const WGS84: ProjJson & { id: { authority: string; code: number } } = {
  type: "GeographicCRS",
  name: "WGS 84",
  datum_ensemble: {
    name: "World Geodetic System 1984 ensemble",
    members: [],
    ellipsoid: {
      name: "WGS 84",
      semi_major_axis: 6378137,
      inverse_flattening: 298.257223563,
    },
  },
  coordinate_system: {
    subtype: "ellipsoidal",
    axis: [
      { name: "Geodetic latitude", abbreviation: "Lat", direction: "north", unit: "degree" },
      { name: "Geodetic longitude", abbreviation: "Lon", direction: "east", unit: "degree" },
    ],
  },
  id: { authority: "EPSG", code: 4326 },
};

/**
 * ZarrLayer's default resolver fetches PROJJSON from epsg.io before the first
 * tile request. The mosaic is EPSG:4326, so answer that one locally and only
 * fall back to the network for anything else.
 */
export const epsgResolver: EpsgResolver = async (epsg) =>
  epsg === 4326
    ? parseWkt(WGS84)
    : fetchFromEpsgIo(epsg);
