import type { RenderTileResult } from "@developmentseed/deck.gl-raster";
import type { Texture } from "@luma.gl/core";
import { SampleAefRgb } from "../gpu/sample-aef-rgb.js";
import { MixAefRgb } from "../gpu/mix-aef-rgb.js";
import type { AefTileData } from "./get-tile-data.js";

// idk, man
type LooseModule = NonNullable<RenderTileResult["renderPipeline"]>[number]["module"];

export type BasicRenderTileArgs = {
  rBandIdx: number;
  gBandIdx: number;
  bBandIdx: number;
  rescaleMin: number;
  rescaleMax: number;
};

export type AdvancedRenderTileArgs = {
  /** 64×3 r32float Texture2D — see MixAefRgbProps.weightsTex. */
  weightsTex: Texture;
  rescaleMin: number;
  rescaleMax: number;
};

/**
 * Basic mode shall be one band per RGB output via integer indices.
 */
export function makeBasicRenderTile(args: BasicRenderTileArgs) {
  const { rBandIdx, gBandIdx, bBandIdx, rescaleMin, rescaleMax } = args;
  return function renderTile(data: AefTileData): RenderTileResult {
    return {
      renderPipeline: [
        {
          module: SampleAefRgb,
          props: {
            dataTex: data.texture,
            rBandIdx,
            gBandIdx,
            bBandIdx,
            rescaleMin,
            rescaleMax,
          },
        },
      ],
    };
  };
}

/**
 * Advanced mode is more advanced, so each output channel is a weighted linear combo of
 * any subset of the 64 bands and we will hope it works.
 */
export function makeAdvancedRenderTile(args: AdvancedRenderTileArgs) {
  const { weightsTex, rescaleMin, rescaleMax } = args;
  return function renderTile(data: AefTileData): RenderTileResult {
    return {
      renderPipeline: [
        {
          module: MixAefRgb as unknown as LooseModule,
          props: {
            dataTex: data.texture,
            weightsTex,
            rescaleMin,
            rescaleMax,
          },
        },
      ],
    };
  };
}
