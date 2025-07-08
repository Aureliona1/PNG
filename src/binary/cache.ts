import { ensureDir } from "@aurellis/helpers";
import { PNG } from "../png.ts";
import { SIC } from "./sic.ts";
import { decodeSICI, encodeSICI } from "./sici.ts";

export class PNGCacheIndividual {
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
			return decodeSICI(Deno.readFileSync(this.path + name));
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

export class PNGCacheBatch {
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
			this.src.width = metaData.width;
			this.src.height = metaData.height;
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
