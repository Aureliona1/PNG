import { ArrOp, clamp, type Vec2 } from "@aurellis/helpers";
import { PNGCacheBatch, PNGCacheIndividual } from "./binary/cache.ts";
import { decodePng } from "./binary/decode.ts";
import { PNGDrawUtility } from "./draw.ts";
import { PNGFilterUtility } from "./filters.ts";
import type { BitDepth, ColorFormat } from "./types.ts";

class PNGFormatter {
	private _indexedPalette?: Uint8Array;
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
			valid = this.src.raw[i] == this.src.raw[i + 1] && this.src.raw[i] == this.src.raw[i + 2] && this.src.raw[i + 3] == 255;
		}
		return valid;
	}
	/**
	 * Check if the image has no transparency.
	 */
	isRGB(): boolean {
		let valid = true;
		for (let i = 3; i < this.src.raw.length && valid; i += 4) {
			valid = this.src.raw[i] == 255;
		}
		return valid;
	}
	/**
	 * Check if the image can be represented by indexed color. This is rather slow as it has to manually perform color indexing.
	 */
	isIndexed(): boolean {
		const dynamicPalette: Set<string> = new Set();
		if(!this.isRGB()){
			return false;
		}
		for (let i = 0; i < this.src.raw.length; i+=4) {
			dynamicPalette.add(this.src.raw.subarray(i,i+3).toString());
		}
		if(dynamicPalette.size < 256)
	}
	/**
	 * Check if the image can be represented as grayscale with alpha.
	 */
	isGrayScaleAlpha(): boolean {}
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
	get filter(): PNGFilterUtility {
		return new PNGFilterUtility(this);
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
	get draw(): PNGDrawUtility {
		return new PNGDrawUtility(this);
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
	 * @param name The relative filepath of the image. ".png" is optional.
	 */
	async read(name: string): Promise<PNG> {
		name = /.*\.png$/.test(name) ? name : name + ".png";
		const dec = await decodePng(await Deno.readFile(name));
		const out = new PNG(dec.raw, dec.width, dec.height);

		// Unpack bits
		switch (dec.bitDepth) {
			case 1: {
				const newRaw = new Uint8Array(out.raw.length * 8);
				for (let i = 0; i < newRaw.length; i++) {
					newRaw[i] = (out.raw[Math.floor(i / 8)] >> (7 - (i & 7))) & 1;
				}
				out.raw = newRaw;
				break;
			}
			case 2: {
				const newRaw = new Uint8Array(out.raw.length * 4);
				for (let i = 0; i < newRaw.length; i++) {
					newRaw[i] = (out.raw[Math.floor(i / 4)] >> (3 - (i & 3))) & 3;
				}
				out.raw = newRaw;
				break;
			}
			case 4: {
				const newRaw = new Uint8Array(out.raw.length * 2);
				for (let i = 0; i < newRaw.length; i++) {
					newRaw[i] = (out.raw[Math.floor(i / 2)] >> (1 - (i & 1))) & 15;
				}
				break;
			}
			default:
				break;
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
					newRaw[i] = i % 4 == 2 ? out.raw[Math.floor(i / 2) - 1] : out.raw[Math.floor(i / 2)];
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
		if (typeof scale == "number") {
			scale = [scale, scale] as Vec2;
		}
		const newDims = (type == "factor" ? [scale[0] * this.height, scale[1] * this.width] : scale).map(x => Math.floor(x)),
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

	/**
	 * Write the PNG to a png file.
	 * @param name The relative path of the image, ".png" is optional.
	 * @param colorFormat Optional color format. If this is left blank, the image will automatically be reduced to the most optimal color format for filesize.
	 * @param idealBitDepth The ideal number of bits per pixel, if this can't be attained, a higher number will be used.
	 */
	write(name: string = "im", colorFormat?: ColorFormat, idealBitDepth: BitDepth = 1): PNG {
		name = /.*\.png$/.test(name) ? name : name + ".png";

		return this;
	}
}
