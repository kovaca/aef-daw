/**
 * URL for the AlphaEarth Foundations GeoZarr Mosaic.
 *
 * See https://source.coop/tge-labs/aef-mosaic.
 */
export const ZARR_URL = "https://data.source.coop/tge-labs/aef-mosaic";

/** Path to the embeddings array within the root group. */
export const VARIABLE = "embeddings";

/** Number of embedding dimensions. */
export const NUM_BANDS = 64;

/** Number of annual snapshots (2017 through 2025 inclusive). */
export const NUM_YEARS = 9;

/** Calendar year corresponding to time index 0. */
export const YEAR_ORIGIN = 2017;

/** int8 sentinel written by the producer for missing pixels. */
export const NODATA_INT8 = -128;

/** Dequantization divisor: `(v / 127.5)² · sign(v)`. */
export const DEQUANT_DIVISOR = 127.5;

export const MIN_ZOOM = 10;

/**
 * Budget for the compressed chunk-byte LRU in front of the store. Inner
 * chunks are ~1–3 MB zstd, so this holds on the order of 100 tiles.
 */
export const CHUNK_CACHE_BYTES = 256 * 1024 * 1024;
