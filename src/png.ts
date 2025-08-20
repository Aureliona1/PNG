import { ArrOp, clamp, clog, type Vec2 } from "@aurellis/helpers";
import { decode } from "./binary/decode.ts";
import { encode } from "./binary/encode.ts";
import { PNGCache } from "./cache.ts";
import { PNGDraw } from "./draw.ts";
import { PNGFilter } from "./filters.ts";
import { gammaCorrect, packBits, PNGFormatterFrom, PNGFormatterTo, unpackBits } from "./format.ts";
import type { BitDepth, ColorFormat, DecodeResult } from "./types.ts";

/**
 * A class that handles many operations regarding PNG files.
 */
export class PNG {
	/**
	 * Read and import an image file. If the image file uses transparency with a trns chunk, this will not be imported.
	 * @param path The relative filepath of the image. ".png" is optional.
	 */
	static async fromFile(path: string): Promise<PNG> {
		path = /.*\.png$/.test(path) ? path : path + ".png";
		let bin = new Uint8Array();
		try {
			bin = await Deno.readFile(path);
		} catch (_) {
			clog(`Unable to open ${path}, image will be blank...`, "Error", "PNG");
			return new PNG();
		}

		const dec = await decode(bin);
		return PNG.fromDecode(dec, path);
	}

	/**
	 * Construct a PNG from the cache.
	 * @param entryName The name of the image in the cache.
	 * @returns The cached image, or a blank image if the image isn't in the cache.
	 */
	static async fromCache(entryName: string): Promise<PNG> {
		const dec = await PNG.cache.read(entryName);
		return this.fromDecode(dec, entryName);
	}

	/**
	 * Create a PNG from a decoded result, this handles formatting and bit packing.
	 */
	private static fromDecode(dec: DecodeResult, imageName: string): PNG {
		dec.raw = unpackBits(dec.raw, dec.width, dec.bitDepth, dec.colorFormat !== "Indexed");
		const formatter = new PNGFormatterFrom(dec);
		if (formatter.isCorrectFormat()) {
			if (dec.colorFormat !== "RGBA") {
				dec.raw = formatter[`from${dec.colorFormat}`]();
			}
		} else {
			clog(`Image ${imageName} does not contain a supported format, image will be blank...`, "Error", "PNG");
			return new PNG();
		}

		// Gamma correction
		if (dec.gamma && dec.gamma !== 0) {
			gammaCorrect(dec.raw, dec.gamma);
		}

		return new PNG(dec.raw, dec.width, dec.height);
	}

	/**
	 * Global PNG cache wrapper.
	 */
	static get cache(): PNGCache {
		return PNG._cache;
	}
	private static _cache = new PNGCache();

	/**
	 * Utility class for adding filters to the image.
	 */
	get filter(): PNGFilter {
		return new PNGFilter(this);
	}

	/**
	 * Utility class for drawing shapes, lines, and patterns on the image.
	 */
	get draw(): PNGDraw {
		return new PNGDraw(this);
	}

	/**
	 * The raw RGBA pixel values.
	 */
	raw: Uint8Array = new Uint8Array();
	/**
	 * The width (in pixels) of the image.
	 */
	width = 100;
	/**
	 * The height (in pixels) of the image.
	 */
	height = 100;
	/**
	 * A class that handles many operations regarding PNG files.
	 * @param raw The raw pixel values of the PNG, this may be left blank to create a white image.
	 * If the length of these pixel values is less than what is required,
	 * then the first 4 entries will be used as a color to apply to the entire image (missing values will be interpreted as 255).
	 * @param width The width of the PNG. (Default - 100)
	 * @param height The height of the PNG. (Default - 100)
	 */
	constructor(raw?: Uint8Array, width?: number, height?: number) {
		this.width = width ?? this.width;
		this.height = height ?? this.height;
		this.raw = (raw ?? this.raw).subarray(0, this.width * this.height * 4);
		if (this.raw.length < this.width * this.height * 4) {
			const color = new Uint8Array(4).fill(255);
			color.set(this.raw.slice(0, 4));
			this.draw.generateBlank(this.width, this.height, color);
		}
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
	setPixel(x: number, y: number, color: ArrayLike<number>): this {
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
	scale(type: "px" | "factor", scale: Vec2 | number): this {
		if (typeof scale === "number") {
			scale = [scale, scale] as Vec2;
		}
		const newDims = (type === "factor" ? [scale[0] * this.width, scale[1] * this.height] : scale).map(x => Math.floor(x)),
			factors = ArrOp.divide([this.width, this.height], newDims),
			output = new Uint8Array(newDims[0] * newDims[1] * 4);

		for (let row = 0; row < newDims[0]; row++) {
			for (let col = 0; col < newDims[1]; col++) {
				const nearest = this.getPixel(Math.floor(col * factors[0]), Math.floor(row * factors[1]));
				output.set(nearest, (row * newDims[0] + col) * 4);
			}
		}

		this.width = newDims[0];
		this.height = newDims[1];
		this.raw = output;
		return this;
	}

	/**
	 * Crop the image based on a start point and dimensions.
	 * @param x The pixel column from the left, this will be the top left of the resulting image.
	 * @param y The pixel row from the top, the will be the top left of the resulting image.
	 * @param width The width of the resulting image.
	 * @param height The height of the resulting image.
	 */
	crop(x = 0, y = 0, width = this.width, height = this.height): this {
		x = clamp(x, [0, this.width - 1]);
		y = clamp(y, [0, this.height - 1]);
		width = clamp(width, [1, this.width - x]);
		height = clamp(height, [1, this.height - y]);
		const newRaw = new Uint8Array(width * height * 4);
		for (let row = 0; row < height; row++) {
			for (let col = 0; col < width; col++) {
				newRaw.subarray((row * width + col) * 4, (row * width + col + 1) * 4).set(this.getPixel(col + x, row + y));
			}
		}
		this.raw = newRaw;
		this.width = width;
		this.height = height;
		return this;
	}

	/**
	 * Runs a function on all image values.
	 * @param affectAlpha Whether or not to affect alpha values.
	 * @param x The function.
	 */
	function(affectAlpha: boolean, func: (index: number, array: Uint8Array) => number): this {
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

	/**
	 * Determine the minimum valid bitdepth for indexed color.
	 * This is based off the length of the palette.
	 */
	private paletteBitDepth(len: number): BitDepth {
		len /= 3;
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
	async writeFile(path: string = "im", colorFormat?: ColorFormat, grayScaleBitDepth: BitDepth = 8): Promise<this> {
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
		if (colorFormat === "Indexed" && plte.length) {
			bitDepth = this.paletteBitDepth(plte.length);
		} else {
			if (colorFormat === "Indexed") {
				[plte, outRaw] = formatter.toIndexed();
				bitDepth = this.paletteBitDepth(plte.length);
			} else if (colorFormat === "GrayScale") {
				bitDepth = grayScaleBitDepth;
				outRaw = formatter.toGrayScale();
			} else {
				outRaw = formatter[`to${colorFormat!}`]();
			}
		}

		// Pack bits if needed.
		outRaw = packBits(outRaw, this.width, bitDepth, colorFormat !== "Indexed");

		let bin: Uint8Array;
		if (colorFormat === "Indexed") {
			bin = encode({ raw: outRaw, width: this.width, height: this.height, colorFormat: colorFormat, palette: plte, bitDepth: bitDepth });
		} else {
			bin = encode({ raw: outRaw, width: this.width, height: this.height, colorFormat: colorFormat!, bitDepth: bitDepth });
		}

		await Deno.writeFile(path, bin);

		return this;
	}

	/**
	 * Write the image to the PNG cache. This is the same as the static call {@link PNG.cache.write}.
	 * @param entryName The name that this image will have in the cache.
	 * @param bitDepth The bit depth of the image, lower values will reduce the size of the cache file but also reduce image quality.
	 */
	async writeCache(entryName = "", bitDepth: BitDepth = 8): Promise<this> {
		await PNG.cache.write(entryName, this, bitDepth);
		return this;
	}
}
