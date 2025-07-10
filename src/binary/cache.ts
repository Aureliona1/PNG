import { PNG } from "../png.ts";
import { SIC } from "./tic.ts";

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
		const metaData = this.sic.dict.filter(x => x.name === name)[0];
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
		const existingImage = this.sic.dict.filter(x => x.name === name)[0];
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
