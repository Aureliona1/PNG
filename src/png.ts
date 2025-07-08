import { ArrOp, clamp, type Vec2 } from "@aurellis/helpers";
import { PNGAlphaHandler } from "./alpha.ts";
import { PNGCacheBatch, PNGCacheIndividual } from "./binary/cache.ts";
import { decodePng } from "./binary/decode.ts";
import { encodePng } from "./binary/encode.ts";
import { PNGDrawUtility } from "./draw.ts";
import { PNGFilterUtility } from "./filters.ts";
import { ColorFormats, type BitDepth, type ColorFormat } from "./types.ts";

export class PNG {
	private _palette?: Uint8Array = new Uint8Array();

	get colorFormat() {
		return this._colorFormat;
	}

	set colorFormat(x: ColorFormat) {
		// TODO: implement raw transforms on format
	}

	get bitDepth() {
		return this._bitDepth;
	}

	set bitDepth(depth: BitDepth) {
		// This is such a stupid type assertation.
		// TypeScript has noticed that the depth might be invalid, so it cries.
		// EVEN THOUGH WE ARE LITERALLY DOING THE VALIDATION HERE!
		if (!ColorFormats[this.colorFormat][depth as 8]) {
			throw new Error(`Color format: ${this.colorFormat} cannot have a bit depth of ${depth}...`);
		}
		this._bitDepth = depth;
	}

	/**
	 * The raw bytes of the pixel values, do not use this unless you know what you are doing.
	 * These values will represent different things depending on the format of the image.
	 */
	get bytes() {
		return this._raw;
	}

	/**
	 * The palette of the indexed colors. This will be undefined if the colorFormat is not Indexed.
	 */
	get palette() {
		return this._palette;
	}

	/**
	 * Utility class for manipulating alpha values.
	 */
	get alphaHandler(): PNGAlphaHandler {
		return new PNGAlphaHandler(this);
	}
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
	 * @param _raw The raw pixel values, of the PNG.
	 * @param width The width of the PNG.
	 * @param height The height of the PNG.
	 * @param _colorFormat The color format of the PNG.
	 * @param _bitDepth The bit depth of the pixel values.
	 */
	constructor(private _raw = new Uint8Array(), public width = 100, public height = 100, private _colorFormat: ColorFormat = "RGBA", private _bitDepth: BitDepth = 8) {
		if (!_raw.length) {
			this.draw.generateBlank();
		}
	}
	/**
	 * Read and import an image file.
	 * @param name The relative filepath of the image. ".png" is optional.
	 */
	read(name: string): PNG {
		name = /.*\.png$/.test(name) ? name : name + ".png";
		return decodePng(Deno.readFileSync(name));
	}
	/**
	 * Get the value of a pixel on the image.
	 * @param x The col (from the left) of the pixel.
	 * @param y The row (from the top) of the pixel.
	 * @returns A Uint8Array(4) of the pixel color. The pixel will always be transformed into RGBA 8888.
	 */
	getPixel(x: number, y: number): Uint8Array {
		return new Uint8Array();
	}
	/**
	 * Set the value of a pixel on the image.
	 * @param x The col (from the left) of the pixel.
	 * @param y The row (from the top) of the pixel.
	 * @param color The [red, green, blue, alpha?] to se the pixel to (0 - 255).
	 */
	setPixel(x: number, y: number, color: ArrayLike<number>): PNG {
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
				output[(row * newDims[1] + col) * 4] = this._raw[oldIndex];
				output[(row * newDims[1] + col) * 4 + 1] = this._raw[oldIndex + 1];
				output[(row * newDims[1] + col) * 4 + 2] = this._raw[oldIndex + 2];
				output[(row * newDims[1] + col) * 4 + 3] = this._raw[oldIndex + 3];
			}
		}

		this.width = newDims[0];
		this.height = newDims[1];
		this._raw = output;
		return this;
	}
	/**
	 * Runs a function on all image values.
	 * @param affectAlpha Whether or not to affect alpha values.
	 * @param x The function.
	 */
	function(affectAlpha: boolean, func: (index: number, array: Uint8Array) => number): PNG {
		if (!affectAlpha) {
			for (let i = 0; i < this._raw.length; i += (i + 2) % 4 ? 1 : 2) {
				this._raw[i] = func(i, this._raw);
			}
		} else {
			for (let i = 0; i < this._raw.length; i++) {
				this._raw[i] = func(i, this._raw);
			}
		}
		return this;
	}
	/**
	 * Write the image to a file.
	 * @param name The filepath to write to. ".png" is optional.
	 */
	write(name: string = "im"): PNG {
		name = /.*\.png$/.test(name) ? name : name + ".png";
		Deno.writeFileSync(name, encodePng(this));
		return this;
	}
}
