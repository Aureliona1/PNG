import { clog, pathAccessible, pathAccessibleSync } from "@aurellis/helpers";
import type { PNG } from "./png.ts";
import type { BitDepth, DecodeResult } from "./types.ts";
import { TIC } from "./binary/tic.ts";

/**
 * Abstract wrapper for TIC cache files, this class should only be constructed for a single TIC file.
 */
export class PNGCache {
	/**
	 * Read the TIC cache file and store it in memory.
	 */
	private async readFile() {
		if (await pathAccessible(this.fileName)) {
			try {
				this.tic = TIC.from(await Deno.readFile(this.fileName));
			} catch (_) {
				clog("Error reading TIC cache file, check your read permissions...", "Warning", "PNG Cache");
				clog("Loaded image cache is not synced with the disk...", "Warning", "PNG Cache");
			}
		}
	}
	/**
	 * Read the TIC cache file and store it in memory.
	 */
	private readFileSync() {
		if (pathAccessibleSync(this.fileName)) {
			try {
				this.tic = TIC.from(Deno.readFileSync(this.fileName));
			} catch (_) {
				clog("Error reading TIC cache file, check your read permissions...", "Warning", "PNG Cache");
				clog("Loaded image cache is not synced with the disk...", "Warning", "PNG Cache");
			}
		}
	}
	private tic!: TIC;
	/**
	 * Abstract wrapper for TIC cache files.
	 * @param fileName The name of the TIC cache.
	 */
	constructor(public readonly fileName = "cache.tic") {
		if (pathAccessibleSync(fileName)) {
			this.readFileSync();
		} else {
			this.tic = new TIC();
		}
	}

	/**
	 * Read an entry from the cache.
	 * @param entryName The name of the entry in the cache.
	 * @returns The specified entry, or a blank PNG if the name is invalid.
	 */
	async read(entryName = ""): Promise<DecodeResult> {
		await this.readFile();
		return this.tic.readEntry(entryName);
	}

	/**
	 * Read an entry from the cache.
	 * @param entryName The name of the entry in the cache.
	 * @returns The specified entry, or a blank PNG if the name is invalid.
	 */
	readSync(entryName = ""): DecodeResult {
		this.readFileSync();
		return this.tic.readEntry(entryName);
	}

	/**
	 * Update or add an entry to the cache.
	 * @param entryName The name of the entry, this must be 255 characters or less in ASCII.
	 * @param im The image to add, leave blank to remove the image with the specified name from the cache.
	 * @param bitDepth The desired bit depth of the image, lower values reduce quality and file size.
	 */
	async write(entryName = "", im?: PNG, bitDepth: BitDepth = 8) {
		if (!im) {
			this.tic.removeEntry(entryName);
		} else {
			this.tic.writeEntry(entryName, im, bitDepth);
		}
		try {
			await Deno.writeFile(this.fileName, this.tic.encode());
		} catch (_) {
			clog("Error writing cache file, cache is still updated in memory but not on disk...", "Warning", "PNG Cache");
			clog("Check your write permisions...", "Warning", "PNG Cache");
		}
	}

	/**
	 * Update or add an entry to the cache.
	 * @param entryName The name of the entry, this must be 255 characters or less in ASCII.
	 * @param im The image to add, leave blank to remove the image with the specified name from the cache.
	 * @param bitDepth The desired bit depth of the image, lower values reduce quality and file size.
	 */
	writeSync(entryName = "", im?: PNG, bitDepth: BitDepth = 8) {
		if (!im) {
			this.tic.removeEntry(entryName);
		} else {
			this.tic.writeEntry(entryName, im, bitDepth);
		}
		try {
			Deno.writeFileSync(this.fileName, this.tic.encode());
		} catch (_) {
			clog("Error writing cache file, cache is still updated in memory but not on disk...", "Warning", "PNG Cache");
			clog("Check your write permisions...", "Warning", "PNG Cache");
		}
	}

	/**
	 * Get a readonly list of addressable entries in the cache.
	 */
	async entriesAsync(): Promise<string[]> {
		await this.readFile();
		return Array.from(this.tic.dict.keys());
	}

	/**
	 * readonly list of addressable entries in the cache.
	 */
	get entries(): string[] {
		this.readFileSync();
		return Array.from(this.tic.dict.keys());
	}

	/**
	 * Delete the cache file, or clear its contents if deletion fails.
	 */
	async clear() {
		try {
			await Deno.remove(this.fileName);
		} catch (_) {
			clog("Couldn't delete cache file, cache will be cleared in memory but file may still exist on disk...", "Warning", "PNG Cache");
		} finally {
			this.tic.dict.clear();
			this.tic.dataChunk = new Uint8Array();
			this.tic.dictLength = 0;
		}
	}

	/**
	 * Delete the cache file, or clear its contents if deletion fails.
	 */
	clearSync() {
		try {
			Deno.removeSync(this.fileName);
		} catch (_) {
			clog("Couldn't delete cache file, cache will be cleared in memory but file may still exist on disk...", "Warning", "PNG Cache");
		} finally {
			this.tic.dict.clear();
			this.tic.dataChunk = new Uint8Array();
			this.tic.dictLength = 0;
		}
	}
}
