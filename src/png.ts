import { ArrOp, clamp, ensureDir, type Vec2 } from "@aurellis/helpers";
import { decode, encode } from "./vendor/png.ts";
import { DrawPNG } from "./draw.ts";
import { FilterPNG } from "./filters.ts";
import { SIC } from "./sic.ts";
import { decodeSICI, encodeSICI } from "./sici.ts";

class PNGAlphaHandler {
	constructor(public src: PNG) {}
	/**
	 * Check if the image has just rgb values and not a.
	 */
	get hasNoAlphaValues(): boolean {
		return this.src.raw.length == this.src.dimensions[0] * this.src.dimensions[1] * 3;
	}
	/**
	 * Check if the image has alpha values that vary from 255, does not check if the alpha actually exists
	 */
	get hasVariableAlpha(): boolean {
		let variable = false;
		for (let i = 3; variable == false && i < this.src.raw.length; i += 4) {
			variable = this.src.raw[i] !== 255;
		}
		return variable;
	}
	/**
	 * Remove every 4th value from the raw. This is irrespective of whether alpha values actually exist in the raw. Make sure you confirm the presence of alpha values before running this.
	 */
	removeAlpha(): PNGAlphaHandler {
		const out = new Uint8Array(this.src.dimensions[0] * this.src.dimensions[1] * 3);
		for (let oldI = 0, newI = 0; oldI < this.src.raw.length; oldI += (oldI + 2) % 4 ? 1 : 2, newI++) {
			out[newI] = this.src.raw[oldI];
		}
		this.src.raw = out;
		return this;
	}
	/**
	 * Add a 255 value in every 4th place. This is irrespective of if the alpha is already there. Ensure that alpha is not already present before running this.
	 */
	addAlpha(): PNGAlphaHandler {
		const out = new Uint8Array(this.src.dimensions[0] * this.src.dimensions[1] * 4).fill(255);
		for (let newI = 0, oldI = 0; newI < out.length; newI += (newI + 2) % 4 ? 1 : 2, oldI++) {
			out[newI] = this.src.raw[oldI];
		}
		this.src.raw = out;
		return this;
	}
}

class PNGCacheBatch {
	constructor(private src: PNG, private path = "cache.sic", private sic: SIC = new SIC()) {
		try {
			Deno.statSync(path);
		} catch (_) {
			Deno.writeFileSync(path, new SIC().encode());
		}
		this.sic = SIC.decodeBinary(Deno.readFileSync(path));
	}
	/**
	 * Read an image from the SIC and overwrite this image's data with the read image. If there is no image with the specified name in the SIC. Then a blank image is returned and the existing image is left unmodified.
	 * @param name The name of the image in the SIC.
	 * @returns A reference to the new image.
	 */
	read(name = ""): PNG {
		const metaData = this.sic.dict.filter(x => x.name == name)[0];
		if (metaData) {
			this.src.dimensions = [metaData.height, metaData.width];
			const dataLength = metaData.height * metaData.width * (metaData.alpha ? 4 : 3);
			this.src.raw = this.sic.dataChunk.slice(metaData.byteStart, metaData.byteStart + dataLength);
			if (!metaData.alpha) {
				this.src.alphaHandler.addAlpha();
			}
			return this.src;
		} else {
			return new PNG();
		}
	}
	/**
	 * Write the image to the SIC.
	 * @param name The name of the entry in the SIC.
	 */
	write(name = "") {
		const existingImage = this.sic.dict.filter(x => x.name == name)[0];
		if (existingImage) {
			this.sic.removeEntry(existingImage.name);
		}
		this.sic.addEntry(name, this.src);
		Deno.writeFileSync(this.path, this.sic.encode());
	}
	/**
	 * Delete an entry from the SIC with a given name.
	 * @param name The name of the entry to remove.
	 */
	deleteEntry(name = "") {
		this.sic.removeEntry(name);
		console.log(`Removed ${name}.`);
	}
	/**
	 * Clear the SIC.
	 */
	clear() {
		Deno.removeSync(this.path);
	}
	/**
	 * Get the names of the images stored in the SIC.
	 */
	get entries(): string[] {
		return this.sic.dict.map(x => x.name);
	}
}

class PNGCacheIndividual {
	private validatePath() {
		this.path = /\/$/.test(this.path) ? this.path : this.path + "/";
	}
	private sicifyName(name: string): string {
		return /\.sici$/.test(name) ? name : name + ".sici";
	}
	private dir: Deno.DirEntry[];
	constructor(private src: PNG, private path = "cache") {
		this.validatePath();
		ensureDir(path);
		this.dir = Array.from(Deno.readDirSync(path));
	}
	/**
	 * Attempt to read an image from the cache. This will set all the data on the current image to teh read image. If no image with the specified name exists, then a blank image will be returned an the original image will be unmodified.
	 * @param name The name of the image in the cache.
	 */
	read(name = ""): PNG {
		this.validatePath();
		name = this.sicifyName(name);
		if (this.dir.map(x => x.name).includes(name)) {
			const decoded = decodeSICI(Deno.readFileSync(this.path + name));
			this.src.dimensions = [...decoded.dimensions];
			this.src.raw = new Uint8Array(decoded.raw);
			return this.src;
		}
		return new PNG();
	}
	/**
	 * Write the image to the cache. Will overwrite any existing images with this name.
	 * @param name The name to index in the cache.
	 */
	write(name = "") {
		name = this.sicifyName(name);
		this.validatePath();
		Deno.writeFileSync(this.path + name, encodeSICI(this.src));
	}
	/**
	 * Remove an image from the cache.
	 * @param name The name of the image to remove.
	 */
	deleteEntry(name = "") {
		name = this.sicifyName(name);
		this.validatePath();
		if (this.dir.map(x => x.name).includes(name)) {
			Deno.removeSync(this.path + name);
			console.log(`Removed ${name}.`);
		}
	}
	/**
	 * Clear the cache.
	 */
	clear() {
		Deno.removeSync(this.path, { recursive: true });
	}
	/**
	 * Get the names of all the images in the cache.
	 */
	get entries(): string[] {
		return this.dir.map(x => x.name);
	}
}

export class PNG {
	raw: Uint8Array<ArrayBuffer> = new Uint8Array();
	dimensions: Vec2 = [100, 100];
	get alphaHandler(): PNGAlphaHandler {
		return new PNGAlphaHandler(this);
	}
	get filter(): FilterPNG {
		return new FilterPNG(this);
	}
	get cache(): { batch: PNGCacheBatch; individual: PNGCacheIndividual } {
		return {
			batch: new PNGCacheBatch(this),
			individual: new PNGCacheIndividual(this)
		};
	}
	get draw(): DrawPNG {
		return new DrawPNG(this);
	}
	constructor() {
		this.draw.generateBlank();
	}
	read(name: string): PNG {
		name = /.*\.png$/.test(name) ? name : name + ".png";
		const temp = decode(Deno.readFileSync(name));
		this.dimensions = [temp.height, temp.width];
		this.raw = Uint8Array.from(temp.image);
		if (this.alphaHandler.hasNoAlphaValues) {
			this.alphaHandler.addAlpha();
		}
		return this;
	}
	/**
	 * Colors are 0-255 int, inc. alpha
	 * Uses subarray, meaning you can edit the original array with this.
	 */
	getPixel(x: number, y: number): Uint8Array<ArrayBuffer> {
		x = Math.floor(clamp(x, [0, this.dimensions[0] - 1]));
		y = Math.floor(clamp(y, [0, this.dimensions[1] - 1]));
		return this.raw.subarray((x * this.dimensions[1] + y) * 4, (x * this.dimensions[1] + y + 1) * 4);
	}
	/**
	 * Colors are 0-255 int, including alpha
	 */
	setPixel(x: number, y: number, color: ArrayLike<number>): PNG {
		if (!(x < 0 || x >= this.dimensions[0] || y < 0 || y >= this.dimensions[1])) {
			const processedCoord = Math.round(x * this.dimensions[1] + y) * 4;
			this.raw[processedCoord] = color[0] ?? 255;
			this.raw[processedCoord + 1] = color[1] ?? 255;
			this.raw[processedCoord + 2] = color[2] ?? 255;
			this.raw[processedCoord + 3] = color[3] ?? 255;
		}
		return this;
	}
	/**
	 * Scale the image either larger or smaller than the current resolution.
	 * @param type Whether to scale as a factor (0-1) of the original image dimensions. Or by absolute pixels.
	 * @param scale The [height, width] of the new image.
	 */
	scale(type: "px" | "factor", scale: Vec2 | number): PNG {
		if (typeof scale == "number") {
			scale = [scale, scale] as Vec2;
		}
		const newDims = (type == "factor" ? [scale[0] * this.dimensions[0], scale[1] * this.dimensions[1]] : scale).map(x => Math.floor(x)),
			factors = ArrOp.divide(this.dimensions, newDims),
			output = new Uint8Array(newDims[0] * newDims[1] * 4);

		for (let row = 0; row < newDims[0]; row++) {
			for (let col = 0; col < newDims[1]; col++) {
				const oldIndex = 4 * (Math.round(row * factors[0]) * this.dimensions[1] + Math.round(col * factors[1]));
				output[(row * newDims[1] + col) * 4] = this.raw[oldIndex];
				output[(row * newDims[1] + col) * 4 + 1] = this.raw[oldIndex + 1];
				output[(row * newDims[1] + col) * 4 + 2] = this.raw[oldIndex + 2];
				output[(row * newDims[1] + col) * 4 + 3] = this.raw[oldIndex + 3];
			}
		}

		this.dimensions = newDims as Vec2;
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
	write(name: string = "im"): PNG {
		name = /.*\.png$/.test(name) ? name : name + ".png";
		if (this.alphaHandler.hasNoAlphaValues) {
			this.alphaHandler.addAlpha();
		}
		Deno.writeFileSync(name, encode(this.raw, this.dimensions[1], this.dimensions[0]));
		return this;
	}
}
