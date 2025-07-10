/*
SIC format:

dict length: Uint32

nameLength: Uint32
name: Uint8Array
width: Uint32
height: Uint32
alpha: Uint8 - a byte boolean for if the image data will have alpha.
bytestart: Uint32 - defines the byte offset in the datachunk of the start of the image.

the end of the image data chunk will be calculated from the width * height * (alpha ? 4 : 3).

dict entry length is defined as namelength + 17 bytes each

datachunk: Uint8Array

*/

import { concatUint8 } from "@aurellis/helpers";
import type { PNG } from "../png.ts";

/**
 * The format of a dictionary entry to a SIC.
 */
export type SicDictEntry = {
	nameLength: number;
	name: string;
	width: number;
	height: number;
	alpha: boolean;
	byteStart: number;
};

/**
 * An interface to SIC cache files. Never construct this class by itself. Use the `cache.batch` member on PNG.
 */
export class SIC {
	private static isASCII(str: string) {
		for (let i = 0; i < str.length; i++) {
			if (str.charCodeAt(i) > 127) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Decode a binary SIC file.
	 * @param raw The raw SIC binary.
	 * @returns Decoded sic data.
	 */
	static decodeBinary(raw: Uint8Array): SIC {
		const view = new DataView(raw.buffer);
		const dictLength = view.getUint32(0);
		const output = new SIC(dictLength, [], raw.slice(dictLength + 4));

		for (let byteOffsetCursor = 4; byteOffsetCursor < dictLength + 4; ) {
			const nameLength = view.getUint32(byteOffsetCursor);
			byteOffsetCursor += 4;
			const name = new TextDecoder().decode(raw.slice(byteOffsetCursor, byteOffsetCursor + nameLength), {});
			byteOffsetCursor += nameLength;
			const width = view.getUint32(byteOffsetCursor);
			byteOffsetCursor += 4;
			const height = view.getUint32(byteOffsetCursor);
			byteOffsetCursor += 4;
			const alpha = view.getUint8(byteOffsetCursor) ? true : false;
			byteOffsetCursor++;
			const byteStart = view.getUint32(byteOffsetCursor);
			byteOffsetCursor += 4;
			output.dict.push({ nameLength, name, width, height, alpha, byteStart });
		}
		return output;
	}

	constructor(public dictLength = 0, public dict: SicDictEntry[] = [], public dataChunk: Uint8Array = new Uint8Array()) {}
	/**
	 * Validates data entries on a sic object.
	 */
	validate() {
		// Accumulate dict length.
		let dictLength = 0;
		this.dict = this.dict.map(x => {
			// Get the name length.
			const encodedName = new TextEncoder().encode(x.name);
			dictLength += encodedName.length + 17;

			// Confirm datachunk length, this won't check if the chunk is too long since we don't know if we are on the furthest image.
			const expectedImageDataLength = x.width * x.height * (x.alpha ? 4 : 3);
			if (this.dataChunk.length < x.byteStart + expectedImageDataLength) {
				console.log("Input datachunk is too small, adding zeros to account for missing values...");
				const missingValueCount = x.byteStart + expectedImageDataLength - this.dataChunk.length;
				this.dataChunk = concatUint8([this.dataChunk, new Uint8Array(missingValueCount)]);
			}

			return {
				nameLength: encodedName.length,
				name: x.name,
				width: x.width,
				height: x.height,
				alpha: x.alpha,
				byteStart: x.byteStart
			};
		});
		if (dictLength != this.dictLength) {
			console.log("Actual dict length differs from input dict length, updating length...");
			this.dictLength = dictLength;
		}
	}
	/**
	 * Remove a named entry from the SIC.
	 * @param entryName The name of the entry.
	 */
	removeEntry(entryName: string) {
		const nameFilter = (x: SicDictEntry) => x.name === entryName;
		const metaData = this.dict.filter(nameFilter)[0];
		if (metaData) {
			// Modify the datachunk
			const dataLength = metaData.height * metaData.width * (metaData.alpha ? 4 : 3);
			const oldChunk = new Uint8Array(this.dataChunk);
			this.dataChunk = new Uint8Array(oldChunk.length - dataLength);
			this.dataChunk.set(oldChunk.subarray(0, metaData.byteStart));
			this.dataChunk.set(oldChunk.subarray(metaData.byteStart + dataLength), metaData.byteStart);

			// Modify byteoffsets
			for (let i = 0; i < this.dict.length; i++) {
				if (this.dict[i].byteStart > metaData.byteStart) {
					this.dict[i].byteStart -= dataLength;
				}
			}

			// Delete dict entry
			this.dictLength -= 17 + metaData.nameLength;
			this.dict.splice(this.dict.findIndex(nameFilter), 1);
		}
	}
	/**
	 * Add an entry to the SIC.
	 * @param name The name of the entry
	 * @param im The image to add.
	 * @param rmAlpha Whether to check for alpha and remove if possible.
	 */
	addEntry(name: string = "", im: PNG, rmAlpha = true) {
		let alpha = false;
		if (!im.alphaHandler.hasNoAlphaValues) {
			if (im.alphaHandler.hasVariableAlpha) {
				alpha = true;
			} else if (rmAlpha) {
				im.alphaHandler.removeAlpha();
			} else {
				alpha = true;
			}
		}
		this.dict.push({
			nameLength: new TextEncoder().encode(name).length,
			name: name,
			width: im.width,
			height: im.height,
			alpha: alpha,
			byteStart: this.dataChunk.length
		});
		this.dataChunk = concatUint8([this.dataChunk, im.raw]);
		this.dictLength += 17 + name.length;
	}

	/**
	 * Encode the SIC to binary.
	 */
	encode(): Uint8Array<ArrayBuffer> {
		// Validate dict entries and chunk length.
		this.validate();

		// Create output buffers.
		const buffer = new ArrayBuffer(this.dictLength + this.dataChunk.length + 4);
		const view = new DataView(buffer);

		// Encode dict entries.
		view.setUint32(0, this.dictLength);
		let byteOffsetCursor = 4;
		this.dict.forEach(x => {
			view.setUint32(byteOffsetCursor, x.nameLength);
			byteOffsetCursor += 4;
			new TextEncoder().encode(x.name).forEach(char => {
				view.setUint8(byteOffsetCursor, char);
				byteOffsetCursor++;
			});
			view.setUint32(byteOffsetCursor, x.width);
			byteOffsetCursor += 4;
			view.setUint32(byteOffsetCursor, x.height);
			byteOffsetCursor += 4;
			view.setUint8(byteOffsetCursor, x.alpha ? 1 : 0);
			byteOffsetCursor++;
			view.setUint32(byteOffsetCursor, x.byteStart);
		});

		// Convert to byteArray and add dataChunk.
		const output = new Uint8Array(buffer);
		output.set(this.dataChunk, this.dictLength + 4);
		return output;
	}
}
