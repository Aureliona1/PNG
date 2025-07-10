import { ArrOp, clamp, type Vec2 } from "@aurellis/helpers";
import { PNGCacheBatch, PNGCacheIndividual } from "./binary/cache.ts";
import { decodePng } from "./binary/decode.ts";
import { encode } from "./binary/encode.ts";
import { PNGDraw } from "./draw.ts";
import { PNGFilter } from "./filters.ts";
import type { BitDepth, ColorFormat } from "./types.ts";

class PNGFormatter {
	// Helper functions to convert a 24-bit color to a number
	private static c2n = (color: Uint8Array) => (color[0] << 16) + (color[1] << 8) + color[2];
	private static n2c = (n: number) => new Uint8Array([(n & (0xff << 16)) >> 16, (n & (0xff << 8)) >> 8, n & 0xff]);
	private _indexedPalette: Map<number, number> = new Map();
	/**
	 * A utility class for validating and converting the image into supported PNG formats.
	 * @param src The source image to format.
	 */
	constructor(public src: PNG) {}
	/**
	 * Check if the image is gray scale with no alpha.
	 */
	isGrayScale(): boolean {
		let valid = true;
		for (let i = 0; i < this.src.raw.length && valid; i += 4) {
			valid = this.src.raw[i] === this.src.raw[i + 1] && this.src.raw[i] === this.src.raw[i + 2] && this.src.raw[i + 3] === 255;
		}
		return valid;
	}
	/**
	 * Transform the pixel array into a single-channel grayscale array.
	 * Does not mutate the old raw.
	 * This does not check whether the image is eligible to be grayscale, this must be done externally.
	 */
	toGrayScale(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length / 4);
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = this.src.raw[Math.floor(i / 4)];
		}
		return newRaw;
	}
	/**
	 * Check if the image has no transparency.
	 */
	isRGB(): boolean {
		let valid = true;
		for (let i = 3; i < this.src.raw.length && valid; i += 4) {
			valid = this.src.raw[i] === 255;
		}
		return valid;
	}
	/**
	 * Transform the pixel array into RGB with no alpha.
	 * Does not mutate the old raw.
	 * This does not check if the image is eligible to be RGB, this must be done externally.
	 */
	toRGB(): Uint8Array {
		const newRaw = new Uint8Array((this.src.raw.length * 3) / 4);
		for (let i = 0; i < newRaw.length / 3; i++) {
			newRaw[i * 3] = this.src.raw[i * 4];
			newRaw[i * 3 + 1] = this.src.raw[i * 4 + 1];
			newRaw[i * 3 + 2] = this.src.raw[i * 4 + 2];
		}
		return newRaw;
	}
	/**
	 * Check if the image can be represented by indexed color. This is rather slow as it has to manually perform color indexing.
	 */
	isIndexed(): boolean {
		// Gotta comment ts bc there's a lot going on here

		// No point trying if we have alpha
		if (!this.isRGB()) return false;

		// Unique set of image colors.
		this._indexedPalette.clear();
		for (let i = 0; i < this.src.raw.length; i += 4) {
			const key = PNGFormatter.c2n(this.src.raw.subarray(i, i + 3));
			if (!this._indexedPalette.has(key)) {
				this._indexedPalette.set(key, this._indexedPalette.size);
			}
		}

		// If there are too many colors
		if (this._indexedPalette.size > 256) {
			this._indexedPalette.clear();
			return false;
		}

		return true;
	}
	/**
	 * Transform the pixel array into indexed color.
	 * This does not mutate the old pixel array.
	 * This will check that the image is eligible to be indexed, and will return two empty Uint8Arrays if the image is not.
	 */
	toIndexed(): [Uint8Array, Uint8Array] {
		if (!this._indexedPalette.size) {
			if (!this.isIndexed()) {
				return [new Uint8Array(), new Uint8Array()];
			}
		}
		const palette = new Uint8Array(this._indexedPalette.size * 3);
		this._indexedPalette.forEach((i, col) => {
			palette.set(PNGFormatter.n2c(col), i * 3);
		});
		const newRaw = new Uint8Array(this.src.raw.length / 4);
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = this._indexedPalette.get(PNGFormatter.c2n(this.src.raw.subarray(i * 4, i * 4 + 3))) ?? 0;
		}
		return [palette, newRaw];
	}
	/**
	 * Check if the image can be represented as grayscale with alpha.
	 */
	isGrayScaleAlpha(): boolean {
		if (this.isGrayScale()) {
			let consistentAlpha = true;
			for (let i = 3; i < this.src.raw.length && consistentAlpha; i += 4) {
				consistentAlpha = this.src.raw[i] === 255;
			}
			return !consistentAlpha;
		}
		return false;
	}
	toGrayScaleAlpha(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length / 2);
		for (let i = 0; i < newRaw.length; i += 2) {
			newRaw[i] = this.src.raw[i * 4];
			newRaw[i + 1] = this.src.raw[i * 4 + 3];
		}
		return newRaw;
	}
	/**
	 * Check if an image is valid RGBA, this should be called before other validators.
	 * @param png The png to validate, this method requires width and height.
	 */
	isRGBA(): boolean {
		return this.src.width * this.src.height * 4 === this.src.raw.length;
	}
}

export class PNG {
	/**
	 * Utility class for adding filters to the image.
	 */
	get filter(): PNGFilter {
		return new PNGFilter(this);
	}
	/**
	 * Utility classes for caching the image in different ways.
	 */
	get cache(): { batch: PNGCacheBatch; individual: PNGCacheIndividual } {
		return {
			batch: new PNGCacheBatch(this),
			individual: new PNGCacheIndividual(this)
		};
	}
	/**
	 * Utility class for drawing shapes, lines, and patterns on the image.
	 */
	get draw(): PNGDraw {
		return new PNGDraw(this);
	}

	/**
	 * A class that handles many operations regarding PNG files.
	 * @param raw The raw pixel values, of the PNG.
	 * @param width The width of the PNG.
	 * @param height The height of the PNG.
	 * @param _colorFormat The color format of the PNG.
	 * @param _bitDepth The bit depth of the pixel values.
	 */
	constructor(public raw: Uint8Array = new Uint8Array(), public width = 100, public height = 100) {
		if (!raw.length) {
			this.draw.generateBlank();
		}
	}
	/**
	 * Read and import an image file. If the image file uses transparency with a trns chunk, this will not be imported.
	 * @param path The relative filepath of the image. ".png" is optional.
	 */
	async read(path: string): Promise<PNG> {
		path = /.*\.png$/.test(path) ? path : path + ".png";
		const dec = await decodePng(await Deno.readFile(path));
		const out = new PNG(dec.raw, dec.width, dec.height);

		// Unpack bits
		if (dec.bitDepth < 8) {
			const newRaw = new Uint8Array((out.raw.length * 8) / dec.bitDepth);
			const maxOffset = 8 / dec.bitDepth - 1;
			const modulo = (1 << dec.bitDepth) - 1;
			for (let i = 0; i < newRaw.length; i++) {
				newRaw[i] = (out.raw[Math.floor((i * 8) / dec.bitDepth)] >> (maxOffset - (i & maxOffset))) & modulo;
			}
			out.raw = newRaw;
		}

		// Reformat
		switch (dec.colorFormat) {
			case "GrayScale": {
				const newRaw = new Uint8Array(out.raw.length * 4);
				for (let i = 0; i < newRaw.length; i++) {
					newRaw[i] = (i + 1) % 4 ? out.raw[Math.floor(i / 4)] : 255;
				}
				out.raw = newRaw;
				break;
			}
			case "RGB": {
				const newRaw = new Uint8Array((out.raw.length * 4) / 3);
				for (let i = 0, oldI = 0; i < newRaw.length; i++) {
					newRaw[i] = (i + 1) % 4 ? out.raw[oldI++] : 255;
				}
				out.raw = newRaw;
				break;
			}
			case "Indexed": {
				const newRaw = new Uint8Array(out.raw.length * 4);
				for (let i = 0; i < newRaw.length; i++) {
					newRaw[i] = (i + 1) % 4 ? dec.palette[out.raw[Math.floor(i / 4)] * 3 + (i % 4)] : 255;
				}
				out.raw = newRaw;
				break;
			}
			case "GrayScaleAlpha": {
				const newRaw = new Uint8Array(out.raw.length * 2);
				for (let i = 0; i < newRaw.length; i++) {
					newRaw[i] = i % 4 === 2 ? out.raw[Math.floor(i / 2) - 1] : out.raw[Math.floor(i / 2)];
				}
				out.raw = newRaw;
				break;
			}
			default:
				break;
		}
		return out;
	}
	/**
	 * Get the value of a pixel on the image.
	 * @param x The col (from the left) of the pixel.
	 * @param y The row (from the top) of the pixel.
	 * @returns A view of the raw pixel array at the specified coord.
	 */
	getPixel(x: number, y: number): Uint8Array {
		const index = (clamp(y, [0, this.height]) * this.width + clamp(x, [0, this.width])) * 4;
		return this.raw.subarray(index, index + 4);
	}
	/**
	 * Set the value of a pixel on the image.
	 * @param x The col (from the left) of the pixel.
	 * @param y The row (from the top) of the pixel.
	 * @param color The [red, green, blue, alpha?] to set the pixel to (0 - 255). This can also stretch over multiple colors to modify multiple pixels.
	 */
	setPixel(x: number, y: number, color: ArrayLike<number>): PNG {
		const index = (clamp(y, [0, this.height]) * this.width + clamp(x, [0, this.width])) * 4;
		for (let i = 0; i < color.length && index + i < this.raw.length; i++) {
			this.raw[index + i] = color[i];
		}
		return this;
	}
	/**
	 * Scale the image either larger or smaller than the current resolution.
	 * @param type Whether to scale as a factor (0-1) of the original image dimensions. Or by absolute pixels.
	 * @param scale The [width, height] of the new image.
	 */
	scale(type: "px" | "factor", scale: Vec2 | number): PNG {
		if (typeof scale === "number") {
			scale = [scale, scale] as Vec2;
		}
		const newDims = (type === "factor" ? [scale[0] * this.height, scale[1] * this.width] : scale).map(x => Math.floor(x)),
			factors = ArrOp.divide([this.width, this.height], newDims),
			output = new Uint8Array(newDims[0] * newDims[1] * 4);

		for (let row = 0; row < newDims[0]; row++) {
			for (let col = 0; col < newDims[1]; col++) {
				const oldIndex = 4 * (Math.round(row * factors[0]) * this.width + Math.round(col * factors[1]));
				output[(row * newDims[1] + col) * 4] = this.raw[oldIndex];
				output[(row * newDims[1] + col) * 4 + 1] = this.raw[oldIndex + 1];
				output[(row * newDims[1] + col) * 4 + 2] = this.raw[oldIndex + 2];
				output[(row * newDims[1] + col) * 4 + 3] = this.raw[oldIndex + 3];
			}
		}

		this.width = newDims[0];
		this.height = newDims[1];
		this.raw = output;
		return this;
	}
	/**
	 * Runs a function on all image values.
	 * @param affectAlpha Whether or not to affect alpha values.
	 * @param x The function.
	 */
	function(affectAlpha: boolean, func: (index: number, array: Uint8Array) => number): PNG {
		if (!affectAlpha) {
			for (let i = 0; i < this.raw.length; i += (i + 2) % 4 ? 1 : 2) {
				this.raw[i] = func(i, this.raw);
			}
		} else {
			for (let i = 0; i < this.raw.length; i++) {
				this.raw[i] = func(i, this.raw);
			}
		}
		return this;
	}

	private paletteBitDepth(len: number): BitDepth {
		if (len <= 2) {
			return 1;
		}
		if (len <= 4) {
			return 2;
		}
		if (len <= 16) {
			return 4;
		}
		return 8;
	}

	/**
	 * Write the PNG to a png file.
	 * @param path The relative path of the image, ".png" is optional.
	 * @param colorFormat Optional color format. If this is left blank, the image will automatically be reduced to the most optimal color format for filesize.
	 * @param grayScaleBitDepth The bitdepth of the image if it able to be represented as grayscale, this does nothing if the resulting image is not grayscale.
	 */
	async write(path: string = "im", colorFormat?: ColorFormat, grayScaleBitDepth: BitDepth = 8): Promise<PNG> {
		path = /.*\.png$/.test(path) ? path : path + ".png";
		const formatter = new PNGFormatter(this);
		// Quick validation
		if (!formatter.isRGBA()) throw new Error(`Image dimensions do not match pixel array length, expected ${this.width * this.height * 4}, got ${this.raw.length}...`);

		// If the user has a specified format.
		switch (colorFormat) {
			case "GrayScale":
				colorFormat = formatter.isGrayScale() ? colorFormat : undefined;
				break;
			case "RGB":
				colorFormat = formatter.isRGB() ? colorFormat : undefined;
				break;
			case "Indexed":
				colorFormat = formatter.isIndexed() ? colorFormat : undefined;
				break;
			case "GrayScaleAlpha":
				colorFormat = formatter.isGrayScaleAlpha() ? colorFormat : undefined;
				break;
			case "RGBA":
				colorFormat = formatter.isRGBA() ? colorFormat : undefined;
				break;
			default:
				break;
		}

		// Auto optimise format fallback
		let plte: Uint8Array = new Uint8Array();
		let outRaw: Uint8Array = new Uint8Array();
		if (!colorFormat) {
			// First we see if it is indexed
			if (formatter.isIndexed()) {
				[plte, outRaw] = formatter.toIndexed();
				colorFormat = "Indexed";
			}
			// Now check if it can be grayscale, and if that would be more efficient.
			// This doesn't consider the size of the plte.
			if (formatter.isGrayScale()) {
				if (plte.length) {
					const indexedBits = this.paletteBitDepth(plte.length);
					if (indexedBits >= grayScaleBitDepth) {
						colorFormat = "GrayScale";
					}
				} else {
					colorFormat = "GrayScale";
				}
			} else if (formatter.isGrayScaleAlpha() && !plte.length) {
				colorFormat = "GrayScaleAlpha";
			} else if (formatter.isRGB() && !plte.length) {
				colorFormat = "RGB";
			} else if (!plte.length) {
				colorFormat = "RGBA";
			}
		}

		// Actually do formatting and bitdepth assignment.
		let bitDepth: BitDepth = 8;
		if (colorFormat == "Indexed" && plte.length) {
			bitDepth = this.paletteBitDepth(plte.length);
		} else {
			switch (colorFormat) {
				case "GrayScale": {
					bitDepth = grayScaleBitDepth;
					outRaw = formatter.toGrayScale();
					break;
				}
				case "GrayScaleAlpha": {
					outRaw = formatter.toGrayScaleAlpha();
					bitDepth = 8;
					break;
				}
				case "Indexed": {
					[plte, outRaw] = formatter.toIndexed();
					bitDepth = this.paletteBitDepth(plte.length);
					break;
				}
				case "RGB": {
					outRaw = formatter.toRGB();
					bitDepth = 8;
					break;
				}
				default:
					break;
			}
		}

		// Pack bits if needed.
		if (bitDepth < 8) {
			const newRaw = new Uint8Array((outRaw.length * bitDepth) / 8);
			const valuesPerByte = 8 / bitDepth;
			for (let i = 0; i < newRaw.length; i++) {
				for (let j = 0; j < valuesPerByte; j++) {
					newRaw[i] += (this.raw[(i * 8) / bitDepth + j] >> (8 - bitDepth)) << (valuesPerByte - j - 1);
				}
			}
			outRaw = newRaw;
		}

		let bin: Uint8Array;
		if (colorFormat == "Indexed") {
			bin = encode({ raw: outRaw, width: this.width, height: this.height, colorFormat: colorFormat, palette: plte, bitDepth: bitDepth });
		} else if (colorFormat == "GrayScale") {
			bin = encode({ raw: outRaw, width: this.width, height: this.height, colorFormat: colorFormat!, bitDepth: bitDepth });
		} else {
			bin = encode({ raw: outRaw, width: this.width, height: this.height, colorFormat: colorFormat!, bitDepth: 8 });
		}

		await Deno.writeFile(path, bin);

		return this;
	}
}
