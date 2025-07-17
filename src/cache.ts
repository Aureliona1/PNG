import { clog, pathCanBeAccessed } from "@aurellis/helpers";
import type { PNG } from "./png.ts";
import type { BitDepth, DecodeResult } from "./types.ts";
import { TIC } from "./binary/tic.ts";

export class PNGCache {
	private readFile() {
		try {
			this.tic = TIC.from(Deno.readFileSync(this.fileName));
		} catch (_) {
			clog("Error reading TIC cache file, check your read permissions...", "Error", "Cache");
		}
	}
	private tic!: TIC;
	/**
	 * Abstract wrapper for TIC cache files.
	 * @param fileName The name of the TIC cache.
	 */
	constructor(public readonly fileName = "cache.tic") {
		if (pathCanBeAccessed(fileName)) {
			this.readFile();
		} else {
			this.tic = new TIC();
		}
	}

	/**
	 * Read an entry from the cache.
	 * @param entryName The name of the entry in the cache.
	 * @returns The specified entry, or a blank PNG if the name is invalid.
	 */
	read(entryName = ""): DecodeResult {
		this.readFile();
		return this.tic.readEntry(entryName);
	}

	/**
	 * Update or add an entry to the cache.
	 * @param entryName The name of the entry, this must be 255 characters or less in ASCII.
	 * @param im The image to add, leave blank to remove the image with the specified name from the cache.
	 * @param bitDepth The desired bit depth of the image, lower values reduce quality and file size.
	 */
	write(entryName = "", im?: PNG, bitDepth: BitDepth = 8) {
		if (!im) {
			this.tic.removeEntry(entryName);
		} else {
			this.tic.writeEntry(entryName, im, bitDepth);
		}
		try {
			Deno.writeFileSync(this.fileName, this.tic.encode());
		} catch (_) {
			clog("Error writing cache file, cache is still updated in memory but not on disk...", "Error", "Cache");
		}
	}

	/**
	 * readonly list of addressable entries in the cache.
	 */
	get entries(): string[] {
		this.readFile();
		return Array.from(this.tic.dict.keys());
	}

	/**
	 * Delete the cache file, or clear its contents if deletion fails.
	 */
	clear() {
		try {
			Deno.removeSync(this.fileName);
		} catch (_) {
			clog("Couldn't delete cache file, it will still be cleared...", "Error", "Cache");
		}
		this.tic.dict.clear();
		this.tic.dataChunk = new Uint8Array();
		this.tic.dictLength = 0;
	}
}
