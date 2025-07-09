import { TwoWayMap } from "@aurellis/helpers";

export const ColorFormats = {
	GrayScale: { 1: true, 2: true, 4: true, 8: true },
	RGB: { 8: true },
	Indexed: { 1: true, 2: true, 4: true, 8: true },
	GrayScaleAlpha: { 8: true },
	RGBA: { 8: true }
};

// There is probably a better way of formatting this, but it works :/
type ColorFormatsType = typeof ColorFormats;
export type ColorFormat = keyof ColorFormatsType;
export type BitDepth = {
	[K in keyof ColorFormatsType]: keyof ColorFormatsType[K];
}[keyof ColorFormatsType];

export const colorFormatChannels = new TwoWayMap({
	GrayScale: 1,
	RGB: 3,
	Indexed: 1,
	GrayScaleAlpha: 2,
	RGBA: 4
});

export const colorFormatNumbers = new TwoWayMap({
	GrayScale: 0,
	RGB: 2,
	Indexed: 3,
	GrayScaleAlpha: 4,
	RGBA: 6
});

export type DecodeResult = {
	raw: Uint8Array;
	width: number;
	height: number;
	bitDepth: BitDepth;
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

export type EncodeOpts = {
	raw: Uint8Array;
	width: number;
	height: number;
} & (
	| {
			colorFormat: "RGB" | "GrayScaleAlpha" | "RGBA";
			bitDepth: 8;
	  }
	| ({
			bitDepth: 1 | 2 | 4 | 8;
	  } & (
			| {
					colorFormat: "GrayScale";
			  }
			| {
					colorFormat: "Indexed";
					palette: Uint8Array;
			  }
	  ))
);
