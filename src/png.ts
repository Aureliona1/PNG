import { ArrOp, clamp, type Vec2 } from "@aurellis/helpers";
import { PNGCacheBatch, PNGCacheIndividual } from "./binary/cache.ts";
import { decodePng } from "./binary/decode.ts";
import { encode } from "./binary/encode.ts";
import { PNGDraw } from "./draw.ts";
import { PNGFilter } from "./filters.ts";
import type { BitDepth, ColorFormat } from "./types.ts";
import { PNGFormatterFrom, PNGFormatterTo } from "./format.ts";

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

		const formatter = new PNGFormatterFrom(dec);
		if (formatter.isCorrectFormat()) {
			if (dec.colorFormat !== "RGBA") {
				out.raw = formatter[`from${dec.colorFormat}`]();
			}
		} else {
			throw new Error("Image format is incorrect, check that the file isn't corrupted...");
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
		const formatter = new PNGFormatterTo(this);
		// Quick validation
		if (!formatter.canBeRGBA()) throw new Error(`Image dimensions do not match pixel array length, expected ${this.width * this.height * 4}, got ${this.raw.length}...`);

		// If the user has a specified format.
		if (colorFormat) {
			colorFormat = formatter[`canBe${colorFormat}`]() ? colorFormat : undefined;
		}

		// Auto optimise format fallback
		let plte: Uint8Array = new Uint8Array();
		let outRaw: Uint8Array = new Uint8Array();
		if (!colorFormat) {
			// First we see if it is indexed
			if (formatter.canBeIndexed()) {
				[plte, outRaw] = formatter.toIndexed();
				colorFormat = "Indexed";
			}
			// Now check if it can be grayscale, and if that would be more efficient.
			// This doesn't consider the size of the plte.
			if (formatter.canBeGrayScale()) {
				if (plte.length) {
					const indexedBits = this.paletteBitDepth(plte.length);
					if (indexedBits >= grayScaleBitDepth) {
						colorFormat = "GrayScale";
					}
				} else {
					colorFormat = "GrayScale";
				}
			} else if (formatter.canBeGrayScaleAlpha() && !plte.length) {
				colorFormat = "GrayScaleAlpha";
			} else if (formatter.canBeRGB() && !plte.length) {
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
			if (colorFormat == "Indexed") {
				[plte, outRaw] = formatter.toIndexed();
				bitDepth = this.paletteBitDepth(plte.length);
			} else if (colorFormat == "GrayScale") {
				bitDepth = grayScaleBitDepth;
				outRaw = formatter.toGrayScale();
			} else {
				outRaw = formatter[`to${colorFormat!}`]();
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
