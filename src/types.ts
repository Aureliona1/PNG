import { TwoWayMap } from "@aurellis/helpers";

/**
 * The available options for bit depths on PNGs. Not all color formats support the full range of bit depths.
 */
export type BitDepth = 1 | 2 | 4 | 8;

/**
 * A map of the number of channels for each PNG color format.
 */
export const formatChannelCounts = new TwoWayMap({
	Indexed: 1,
	GrayScale: 1,
	GrayScaleAlpha: 2,
	RGB: 3,
	RGBA: 4
});

/**
 * A map of the available color formats for PNG files, and their respective numeric ID.
 */
export const pngColorFormats = new TwoWayMap({
	GrayScale: 0,
	RGB: 2,
	Indexed: 3,
	GrayScaleAlpha: 4,
	RGBA: 6
});

/**
 * PNG color format names.
 */
export type ColorFormat = keyof typeof pngColorFormats.map;

/**
 * The output format of decoding a PNG file or a TIC entry.
 */
export type DecodeResult = {
	raw: Uint8Array;
	width: number;
	height: number;
	bitDepth: BitDepth;
	gamma?: number;
} & (
	| {
			colorFormat: "GrayScale" | "RGB";
			trns?: Uint8Array;
	  }
	| {
			colorFormat: "Indexed";
			trns?: Uint8Array;
			palette: Uint8Array;
	  }
	| {
			colorFormat: "GrayScaleAlpha" | "RGBA";
	  }
);

/**
 * Input options for PNG encoding.
 */
export type EncodeOpts = {
	raw: Uint8Array;
	width: number;
	height: number;
	bitDepth: BitDepth;
} & (
	| {
			colorFormat: Exclude<ColorFormat, "Indexed">;
	  }
	| {
			colorFormat: "Indexed";
			palette: Uint8Array;
	  }
);

/**
 * A map of the available color formats for TIC files, and their respective numeric ID.
 * Doubles as a channel count map.
 */
export const ticColorFormats = new TwoWayMap({
	GrayScale: 1,
	GrayScaleAlpha: 2,
	RGB: 3,
	RGBA: 4
});

/**
 * TIC color format names.
 */
export type TicColorFormat = keyof typeof ticColorFormats.map;

/**
 * The decoded values of a TIC dictionary entry.
 */
export type TicDictEntry = {
	byteOffset: number;
	width: number;
	height: number;
	colorFormat: TicColorFormat;
	bitDepth: BitDepth;
	nameLength: number;
	name: string;
};
