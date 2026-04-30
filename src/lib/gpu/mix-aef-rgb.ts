import type { Texture } from "@luma.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

export type MixAefRgbProps = {
  /** r8sint Texture2DArray; one layer per AEF band (depth = 64). */
  dataTex: Texture;
  /**
   * 64×3 r32float Texture2D holding the per-(band, channel) weights. Row 0 = R,
   * row 1 = G, row 2 = B; column = band index. Sampled via texelFetch.
   */
  weightsTex: Texture;
  rescaleMin: number;
  rescaleMax: number;
};

const MODULE_NAME = "mixAefRgb";
const NUM_BANDS = 64;

/**
 * Advanced-mode shader: each output channel is a weighted linear combination
 * of all 64 AEF embedding bands. Weights are passed via a tiny 64×3 r32float
 * data texture. 
 *
 * Pixels whose contributing bands include the -128 nodata sentinel are
 * discarded.
 */
export const MixAefRgb = {
  name: MODULE_NAME,
  fs: `\
uniform ${MODULE_NAME}Uniforms {
  float rescaleMin;
  float rescaleMax;
} ${MODULE_NAME};
`,
  inject: {
    "fs:#decl": `
precision highp isampler2DArray;
uniform highp isampler2DArray dataTex;
uniform highp sampler2D weightsTex;

float mixAefRgb_dequant(int v) {
  float f = float(v) / 127.5;
  return f * f * sign(f);
}

float mixAefRgb_accumulate(vec2 uv, int channelRow, inout bool nodata) {
  float acc = 0.0;
  for (int i = 0; i < ${NUM_BANDS}; ++i) {
    float wi = texelFetch(weightsTex, ivec2(i, channelRow), 0).r;
    if (wi == 0.0) continue;
    int raw = texture(dataTex, vec3(uv, float(i))).r;
    if (raw == -128) { nodata = true; return 0.0; }
    acc += wi * mixAefRgb_dequant(raw);
  }
  return acc;
}
`,
    "fs:DECKGL_FILTER_COLOR": /* glsl */ `
      bool nodata = false;
      float r = mixAefRgb_accumulate(geometry.uv, 0, nodata);
      float g = mixAefRgb_accumulate(geometry.uv, 1, nodata);
      float b = mixAefRgb_accumulate(geometry.uv, 2, nodata);
      if (nodata) discard;
      vec3 rgb = vec3(r, g, b);
      float invSpan = 1.0 / (${MODULE_NAME}.rescaleMax - ${MODULE_NAME}.rescaleMin);
      rgb = clamp((rgb - ${MODULE_NAME}.rescaleMin) * invSpan, 0.0, 1.0);
      color = vec4(rgb, 1.0);
    `,
  },
  uniformTypes: {
    rescaleMin: "f32",
    rescaleMax: "f32",
  },
  getUniforms: (props: Partial<MixAefRgbProps>) => {
    return {
      rescaleMin: props.rescaleMin ?? -0.3,
      rescaleMax: props.rescaleMax ?? 0.3,
      dataTex: props.dataTex,
      weightsTex: props.weightsTex,
    };
  },
} as ShaderModule<MixAefRgbProps>;
