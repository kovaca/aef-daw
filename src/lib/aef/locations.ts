export type Location = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  zoom: number;
};

export const LOCATIONS: readonly Location[] = [
  {
    id: "sf-bay",
    label: "SFTMC (Buchla Modular System)",
    longitude: -122.4376,
    latitude: 37.7713,
    zoom: 13,
  },
  {
    id: "kraft",
    label: "Kraftwerk's Kling Klang Studio",
    longitude: 6.7943,
    latitude: 51.2194,
    zoom: 13,
  },
  {
    id: "korg",
    label: "Korg HQ",
    longitude: 139.6415,
    latitude: 35.6687,
    zoom: 13,
  },
  {
    id: "iowa-corn",
    label: "Iowa corn belt (seasonal agriculture)",
    longitude: -93.5,
    latitude: 42.0,
    zoom: 13,
  },
  {
    id: "amazon-frontier",
    label: "Amazon deforestation frontier (Rondônia)",
    longitude: -62.2,
    latitude: -9.5,
    zoom: 13,
  },
  {
    id: "nile-delta",
    label: "Nile delta (irrigation mosaic)",
    longitude: 31.2,
    latitude: 30.8,
    zoom: 13,
  },
  {
    id: "alaska-north-slope",
    label: "Alaska North Slope (tundra)",
    longitude: -150.0,
    latitude: 69.5,
    zoom: 13,
  },
];

export function locationById(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}
