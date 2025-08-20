import { compare, concatTypedArrays, random } from "@aurellis/helpers";
import { packBits, PNGFormatterFrom, PNGFormatterTo, unpackBits } from "../src/format.ts";
import { PNG } from "../src/png.ts";
import { DecodeResult } from "../src/types.ts";
import { assert } from "../src/vendor/assert.ts";

// Validators

Deno.test({
	name: "Can be GrayScale",
	fn: () => {
		const raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255, 0, 0, 0, 255]);
		const im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeGrayScale());
	}
});

Deno.test({
	name: "Can't be GrayScale",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 3, 4, 255]);
		let im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScale());
		raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 254, 3, 3, 3, 255, 4, 4, 4, 255, 0, 0, 0, 255]);
		im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScale());
	}
});

Deno.test({
	name: "Can be RGB",
	fn: () => {
		const raw = new Uint8Array([1, 2, 3, 255, 2, 3, 1, 255, 3, 2, 3, 255, 4, 1, 4, 255, 1, 2, 5, 255]);
		const im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeRGB());
	}
});

Deno.test({
	name: "Can't be RGB",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 254]);
		let im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScale());
	}
});

Deno.test({
	name: "Can be Indexed",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]);
		let im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeIndexed());
		raw = new Uint8Array([0, 0, 0, 255]);
		im = new PNG(raw, 1, 1);
		assert(new PNGFormatterTo(im).canBeIndexed());
		// Max limit of colors
		raw = new Uint8Array(new Array(16 * 16 * 4).fill(255).map((_, i) => ((i + 1) % 4 ? random(0, 255, i, 0) : 255)));
		im = new PNG(raw, 16, 16);
		assert(new PNGFormatterTo(im).canBeIndexed());
	}
});

Deno.test({
	name: "Can't be Indexed",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 254]);
		let im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeIndexed());
		raw = new Uint8Array(17 * 17 * 4).fill(255);
		for (let i = 0; i < raw.length; i += 4) {
			const color = PNGFormatterTo.n2c(i);
			raw[i] = color[0];
			raw[i + 1] = color[1];
			raw[i + 2] = color[2];
			raw[i + 3] = 255;
		}
		im = new PNG(raw, 17, 17);
		assert(!new PNGFormatterTo(im).canBeIndexed());
	}
});

Deno.test({
	name: "Can be GrayScaleAlpha",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 205, 0, 0, 0, 25]);
		let im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeGrayScaleAlpha());
		raw = new Uint8Array([0, 0, 0, 0]);
		im = new PNG(raw, 1, 1);
		assert(new PNGFormatterTo(im).canBeGrayScaleAlpha());
	}
});

Deno.test({
	name: "Can't be GrayScaleAlpha",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 2, 3, 255, 4, 4, 4, 255]);
		let im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScaleAlpha());
	}
});

Deno.test({
	name: "Can be RGBA",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]);
		let im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeRGBA());
		raw = new Uint8Array([0, 0, 0, 0]);
		im = new PNG(raw, 1, 1);
		assert(new PNGFormatterTo(im).canBeRGBA());
	}
});

Deno.test({
	name: "Can't be RGBA",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]);
		let im = new PNG(raw, 2, 2);
		im.raw = concatTypedArrays(im.raw, new Uint8Array([1, 0, 1]));
		assert(!new PNGFormatterTo(im).canBeRGBA());
		im = new PNG(undefined, 1, 1);
		im.raw = new Uint8Array([0, 0, 0]);
		assert(!new PNGFormatterTo(im).canBeRGBA());
	}
});

// Converters

Deno.test({
	name: "To GrayScale",
	fn: () => {
		const im = new PNG(new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255]), 2, 1);
		const transformed = new PNGFormatterTo(im).toGrayScale();
		assert(compare(transformed, new Uint8Array([1, 2])));
	}
});

Deno.test({
	name: "To RGB",
	fn: () => {
		const im = new PNG(new Uint8Array([1, 2, 3, 255, 3, 2, 1, 255]), 2, 1);
		const transformed = new PNGFormatterTo(im).toRGB();
		assert(compare(transformed, new Uint8Array([1, 2, 3, 3, 2, 1])));
	}
});

Deno.test({
	name: "To Indexed",
	fn: () => {
		const im = new PNG(new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 1, 1, 1, 255, 4, 4, 4, 255]), 2, 2);
		const transformed = new PNGFormatterTo(im).toIndexed();
		assert(compare(transformed[1], new Uint8Array([0, 1, 0, 2])));
		assert(compare(transformed[0], new Uint8Array([1, 1, 1, 2, 2, 2, 4, 4, 4])));
	}
});

Deno.test({
	name: "To GrayScaleAlpha",
	fn: () => {
		const im = new PNG(new Uint8Array([1, 1, 1, 25, 2, 2, 2, 215]), 2, 1);
		const transformed = new PNGFormatterTo(im).toGrayScaleAlpha();
		assert(compare(transformed, new Uint8Array([1, 25, 2, 215])));
	}
});

// Formatter From tests -> validators

Deno.test({
	name: "Is GrayScale",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
			width: 2,
			height: 4,
			bitDepth: 8,
			colorFormat: "GrayScale"
		};
		assert(new PNGFormatterFrom(dec).isCorrectFormat());
	}
});

Deno.test({
	name: "Is RGB",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
			width: 2,
			height: 2,
			bitDepth: 8,
			colorFormat: "RGB"
		};
		assert(new PNGFormatterFrom(dec).isCorrectFormat());
	}
});

Deno.test({
	name: "Is Indexed",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 0, 1, 0]),
			width: 2,
			height: 2,
			bitDepth: 8,
			colorFormat: "Indexed",
			palette: new Uint8Array([10, 10, 10, 20, 20, 20])
		};
		assert(new PNGFormatterFrom(dec).isCorrectFormat());
	}
});

Deno.test({
	name: "Is GrayScaleAlpha",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
			width: 2,
			height: 2,
			bitDepth: 8,
			colorFormat: "GrayScaleAlpha"
		};
		assert(new PNGFormatterFrom(dec).isCorrectFormat());
	}
});

// Converters

Deno.test({
	name: "From GrayScale",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
			width: 2,
			height: 4,
			bitDepth: 8,
			colorFormat: "GrayScale"
		};
		const transformed = new PNGFormatterFrom(dec).fromGrayScale();
		assert(compare(transformed, new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255, 5, 5, 5, 255, 6, 6, 6, 255, 7, 7, 7, 255, 8, 8, 8, 255])));
	}
});

Deno.test({
	name: "From RGB",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
			width: 2,
			height: 2,
			bitDepth: 8,
			colorFormat: "RGB"
		};
		const transformed = new PNGFormatterFrom(dec).fromRGB();
		assert(compare(transformed, new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255])));
	}
});

Deno.test({
	name: "From Indexed",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 0, 1, 0]),
			width: 2,
			height: 2,
			bitDepth: 8,
			colorFormat: "Indexed",
			palette: new Uint8Array([10, 10, 10, 20, 20, 20])
		};
		const transformed = new PNGFormatterFrom(dec).fromIndexed();
		assert(compare(transformed, new Uint8Array([20, 20, 20, 255, 10, 10, 10, 255, 20, 20, 20, 255, 10, 10, 10, 255])));
	}
});

Deno.test({
	name: "From GrayScaleAlpha",
	fn: () => {
		const dec: DecodeResult = {
			raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
			width: 2,
			height: 2,
			bitDepth: 8,
			colorFormat: "GrayScaleAlpha"
		};
		const transformed = new PNGFormatterFrom(dec).fromGrayScaleAlpha();
		assert(compare(transformed, new Uint8Array([1, 1, 1, 2, 3, 3, 3, 4, 5, 5, 5, 6, 7, 7, 7, 8])));
	}
});

// Bit manipulation

Deno.test({
	name: "Pack to 1 bit",
	fn: () => {
		const raw = new Uint8Array([1, 0, 1, 0, 0, 1, 0, 1]);
		// Alrady normalised
		let packed = packBits(raw, 8, 1, false);
		assert(compare(packed, new Uint8Array([165])));
		// With normalisation
		const denorm = raw.map(x => x << 7);
		packed = packBits(denorm, 8, 1);
		assert(compare(packed, new Uint8Array([165])));
	}
});

Deno.test({
	name: "Pack to 2 bits",
	fn: () => {
		const raw = new Uint8Array([0, 1, 2, 3, 3, 2, 1, 0]);
		// Alrady normalised
		let packed = packBits(raw, 8, 2, false);
		assert(compare(packed, new Uint8Array([27, 228])));
		// With normalisation
		const denorm = raw.map(x => x << 6);
		packed = packBits(denorm, 8, 2);
		assert(compare(packed, new Uint8Array([27, 228])));
	}
});

Deno.test({
	name: "Pack to 4 bits",
	fn: () => {
		const raw = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
		// Alrady normalised
		let packed = packBits(raw, 8, 4, false);
		assert(compare(packed, new Uint8Array([1, 35, 69, 103])));
		// With normalisation
		const denorm = raw.map(x => x << 4);
		packed = packBits(denorm, 8, 4);
		assert(compare(packed, new Uint8Array([1, 35, 69, 103])));
	}
});

Deno.test({
	name: "Unpack 1 bit",
	fn: () => {
		const raw = new Uint8Array([165]);
		const unpacked = unpackBits(raw, 8, 1, false);
		const normalised = unpackBits(raw, 8, 1);
		assert(compare(unpacked, new Uint8Array([1, 0, 1, 0, 0, 1, 0, 1])));
		assert(compare(normalised, new Uint8Array([255, 0, 255, 0, 0, 255, 0, 255])));
	}
});

Deno.test({
	name: "Unpack 2 bits",
	fn: () => {
		const raw = new Uint8Array([165]);
		const unpacked = unpackBits(raw, 8, 2, false);
		const normalised = unpackBits(raw, 8, 2);
		assert(compare(unpacked, new Uint8Array([2, 2, 1, 1])));
		assert(compare(normalised, new Uint8Array([170, 170, 85, 85])));
	}
});

Deno.test({
	name: "Unpack 4 bits",
	fn: () => {
		const raw = new Uint8Array([165]);
		const unpacked = unpackBits(raw, 8, 4, false);
		const normalised = unpackBits(raw, 8, 4);
		assert(compare(unpacked, new Uint8Array([10, 5])));
		assert(compare(normalised, new Uint8Array([170, 85])));
	}
});
