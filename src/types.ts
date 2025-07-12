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
	Indexed: 1,
	GrayScale: 1,
	GrayScaleAlpha: 2,
	RGB: 3,
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

export const ticColorFormats = new TwoWayMap({
	GrayScale: 1,
	GrayScaleAlpha: 2,
	RGB: 3,
	RGBA: 4
});

export type TicColorFormat = keyof typeof ticColorFormats.map;

export type TicDictEntry = {
	byteOffset: number;
	width: number;
	height: number;
	colorFormat: TicColorFormat;
	bitDepth: BitDepth;
	nameLength: number;
	name: string;
};
