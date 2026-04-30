import type * as zarr from "zarrita";

export type BuildSelectionArgs = {
  /** Index into the `time` dim (0 = 2017, 8 = 2025). */
  yearIdx: number;
};

/**
 * Build the ZarrLayer `selection` prop for AEF
 */
export function buildSelection(
  args: BuildSelectionArgs,
): Record<string, number | zarr.Slice | null> {
  return {
    time: args.yearIdx,
    band: null,
  };
}
