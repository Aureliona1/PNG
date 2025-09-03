import { clog, concatTypedArrays } from "@aurellis/helpers";
import { PNGFormatterTo, packBits } from "../format.ts";
import type { PNG } from "../png.ts";
import { ticColorFormats, type BitDepth, type DecodeResult, type TicColorFormat, type TicDictEntry } from "../types.ts";

/**
Terrible Image Cache

This format begins with a dictionary which references the metadata of all contained images.
Then it has the datachunk which contains all image values with optimal color formatting and bit packing.

This cache format allows multiple images to be stored and accessed very quickly, but results in a larger file size.

TIC format:
dict length: Uint32
dict entry[]

dict entry:
	byteStart: Uint32
	width: Uint32
	height: Uint32
	colorFormat + bitDepth byte:
		bits 0 and 1: color format
			0: GrayScale
			1: GrayScaleAlpha
			2: RGB
			3: RGBA
		bits 2 and 3: bit depth
			0: 1 bit
			1: 2 bit
			2: 4 bit
			3: 8 bit
	nameLength: Uint8
	name: Uint8Array up to 255 length

The end of each image's section in the datachunk will be calculated as byteStart + ceil(width * height * (colorFormat + 1) * bitDepth / 8).

Each dictionary entry takes 14 + nameLength bytes.

datachunk: Uint8Array
*/
export class TIC {
	/**
	 * Base length of a dict entry with a 0-length name.
	 */
	private static DICT_ENTRY_BASE_LENGTH = 14;
	/**
	 * Maximum name length supported by the dict.
	 */
	private static DICT_NAME_MAX_LENGTH = 256;
	/**
	 * Get the length of an entry in the datachunk.
	 */
	private static entryDataLength(entry: TicDictEntry): number {
		return Math.ceil((entry.width * entry.height * ticColorFormats.get(entry.colorFormat) * entry.bitDepth) / 8);
	}

	/**
	 * Decode a binary TIC file.
	 * @param raw The raw TIC binary.
	 * @returns Decoded tic data.
	 */
	static from(raw: Uint8Array): TIC {
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
		const dictLength = raw.length >= 4 ? view.getUint32(0) : 0;
		const output = new TIC(dictLength, new Map(), raw.subarray(dictLength + 4));

		try {
			for (let cursor = 4; cursor < dictLength + 4; ) {
				const thisEntry: Partial<TicDictEntry> = {};
				thisEntry.byteOffset = view.getUint32(cursor);
				cursor += 4;
				thisEntry.width = view.getUint32(cursor);
				cursor += 4;
				thisEntry.height = view.getUint32(cursor);
				cursor += 4;
				thisEntry.colorFormat = ticColorFormats.revGet(((view.getUint8(cursor) >> 6) + 1) as 1 | 2 | 3 | 4);
				thisEntry.bitDepth = (1 << ((view.getUint8(cursor++) >> 4) & 3)) as BitDepth;
				thisEntry.nameLength = view.getUint8(cursor++);
				thisEntry.name = new TextDecoder().decode(raw.subarray(cursor, cursor + thisEntry.nameLength));
				cursor += thisEntry.nameLength;
				output.dict.set(thisEntry.name, thisEntry as TicDictEntry);
			}
		} catch (_) {
			clog("Input TIC file either has an invalid dict length, or is missing bytes, resulting TIC may be corrupted...", "Warning", "TIC");
		}
		return output;
	}

	/**
	 * An interface to TIC cache files. Never construct this class by itself. Use the {@link PNG.cache} member on PNG.
	 */
	constructor(public dictLength = 0, public dict: Map<string, TicDictEntry> = new Map(), public dataChunk: Uint8Array = new Uint8Array()) {}
	/**
	 * Validates TIC dictionary values, and makes corrections when needed and possible.
	 *
	 * **Checked Properties:**
	 *
	 * - All encoded names have a length <= 256
	 * - All name length values match encoded name length.
	 * - Dict length is correct.
	 * - Byte offset values are within the limits of the datachunk
	 * - Image data doesn't extend the length of the datachunk
	 */
	validate(alreadyValidated = false) {
		let dictLength = 0;
		// [name, size in dict, size in datachunk]
		const invalidEntries: string[] = [];
		this.dict.forEach(entry => {
			let valid = true;
			// Base entry length
			dictLength += TIC.DICT_ENTRY_BASE_LENGTH;

			// Validate name length
			const encodedName = new TextEncoder().encode(entry.name);
			entry.nameLength = encodedName.length;
			if (entry.nameLength > TIC.DICT_NAME_MAX_LENGTH) {
				clog(`The image name ${entry.name} exceeds the maximum length (${TIC.DICT_NAME_MAX_LENGTH}), it will be shortened...`, "Warning", "TIC");
				entry.name = new TextDecoder().decode(encodedName.slice(0, TIC.DICT_NAME_MAX_LENGTH));
				clog(`The image has been renamed to ${entry.name}...`, "Log", "TIC");
				entry.nameLength = TIC.DICT_NAME_MAX_LENGTH;
			}
			dictLength += entry.nameLength;

			const dataLength = TIC.entryDataLength(entry);
			if (entry.byteOffset >= this.dataChunk.length) {
				clog(`Cached image ${entry.name} has an invalid byte offset, it will be removed form the cache...`, "Warning", "TIC");
				valid = false;
			}
			if (entry.byteOffset + dataLength > this.dataChunk.length) {
				clog(`Cached image ${entry.name} has invalid data length, it will be removed from the cache...`, "Warning", "TIC");
				valid = false;
			}
			if (!valid) {
				invalidEntries.push(entry.name);
			}
		});
		if (invalidEntries.length) {
			invalidEntries.forEach(e => {
				this.removeEntry(e);
			});
			if (!alreadyValidated) {
				this.validate(true);
			}
		}
	}
	/**
	 * Remove a named entry from the TIC.
	 * @param entryName The name of the entry.
	 */
	removeEntry(entryName: string) {
		if (this.dict.has(entryName)) {
			const entry = this.dict.get(entryName)!;
			const nameLength = new TextEncoder().encode(entry.name).length;
			this.dictLength -= TIC.DICT_ENTRY_BASE_LENGTH + nameLength;
			const dataLength = TIC.entryDataLength(entry);
			this.dataChunk = concatTypedArrays(this.dataChunk.subarray(0, entry.byteOffset), this.dataChunk.subarray(entry.byteOffset + dataLength));
			this.dict.forEach(e => {
				if (e.byteOffset > entry.byteOffset) {
					e.byteOffset -= dataLength;
				}
			});
			this.dict.delete(entryName);
		} else {
			clog(`${entryName} could not be found in the dictionary, it may not exist...`, "Warning", "TIC");
		}
	}
	/**
	 * Add an entry to the TIC. Or overwrite an existing entry.
	 * @param entryName The name of the entry, this must be 255 characters or less in ASCII.
	 * @param im The image to add.
	 * @param bitDepth The desired bit depth of the image, lower values reduce quality and file size.
	 */
	writeEntry(entryName: string, im: PNG, bitDepth: BitDepth = 8) {
		if (this.dict.has(entryName)) {
			this.dict.delete(entryName);
		}
		const formatter = new PNGFormatterTo(im);
		if (!formatter.canBeRGBA()) clog(`The image to be cached as ${entryName} is not valid RGBA. Expected raw length of ${im.width * im.height * 4}, got ${im.raw.length}...`, "Warning", "TIC");
		let colorFormat: TicColorFormat = "GrayScale";
		let encodedRaw: Uint8Array = im.raw;
		if (formatter.canBeGrayScale()) {
			encodedRaw = formatter.toGrayScale();
		} else if (formatter.canBeGrayScaleAlpha()) {
			encodedRaw = formatter.toGrayScaleAlpha();
			colorFormat = "GrayScaleAlpha";
		} else if (formatter.canBeRGB()) {
			encodedRaw = formatter.toRGB();
			colorFormat = "RGB";
		} else {
			colorFormat = "RGBA";
		}
		encodedRaw = packBits(encodedRaw, im.width, bitDepth);
		const thisEntry: TicDictEntry = {
			byteOffset: this.dataChunk.length,
			width: im.width,
			height: im.height,
			colorFormat: colorFormat,
			bitDepth: bitDepth,
			nameLength: new TextEncoder().encode(entryName).length,
			name: entryName
		};
		this.dictLength += TIC.DICT_ENTRY_BASE_LENGTH + thisEntry.nameLength;
		this.dict.set(entryName, thisEntry);
		this.dataChunk = concatTypedArrays(this.dataChunk, encodedRaw);
	}

	/**
	 * Read and decode a TIC entry.
	 * @param entryName The name of the entry in the TIC.
	 */
	readEntry(entryName = ""): DecodeResult {
		if (!this.dict.has(entryName)) {
			return { raw: new Uint8Array(), width: 0, height: 0, colorFormat: "RGBA", bitDepth: 8 };
		}
		const entry = this.dict.get(entryName)!;
		const dec: DecodeResult = {
			raw: this.dataChunk.subarray(entry.byteOffset, entry.byteOffset + TIC.entryDataLength(entry)),
			width: entry.width,
			height: entry.height,
			colorFormat: entry.colorFormat,
			bitDepth: entry.bitDepth
		};

		return dec;
	}

	/**
	 * Encode the TIC to binary.
	 */
	encode(): Uint8Array {
		// Validate dict entries and chunk length.
		this.validate();

		// Create output buffers.
		const buffer = new ArrayBuffer(this.dictLength + this.dataChunk.length + 4);
		const view = new DataView(buffer);

		// Encode dict entries.
		view.setUint32(0, this.dictLength);
		let cursor = 4;
		this.dict.forEach(x => {
			view.setUint32(cursor, x.byteOffset);
			cursor += 4;
			view.setUint32(cursor, x.width);
			cursor += 4;
			view.setUint32(cursor, x.height);
			cursor += 4;
			view.setUint8(cursor++, ((ticColorFormats.get(x.colorFormat) - 1) << 6) + (Math.log2(x.bitDepth) << 4));
			view.setUint8(cursor++, x.nameLength);
			const encodedString = new TextEncoder().encode(x.name);
			for (let i = 0; i < encodedString.length; i++) {
				view.setUint8(cursor++, encodedString[i]);
			}
		});

		// Convert to byteArray and add dataChunk.
		const output = new Uint8Array(buffer);
		output.set(this.dataChunk, this.dictLength + 4);
		return output;
	}
}
