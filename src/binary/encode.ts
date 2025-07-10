import { concatUint8 } from "@aurellis/helpers";
import { deflate } from "@deno-library/compress";
import { crc32 } from "@deno-library/crc32";
import { type ColorFormat, colorFormatChannels, colorFormatNumbers, type EncodeOpts } from "../types.ts";

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function writeIHDR(width: number, height: number, bitDepth: number, colorFormat: ColorFormat): Uint8Array {
	const buf = new Uint8Array(13);
	const view = new DataView(buf.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	buf[8] = bitDepth;
	buf[9] = colorFormatNumbers.get(colorFormat);
	buf[10] = 0; // compression
	buf[11] = 0; // filter
	buf[12] = 0; // interlace
	return writeChunk("IHDR", buf);
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
	const length = data.length;
	const chunk = new Uint8Array(8 + length + 4); // length (4) + type (4) + data + crc (4)
	const view = new DataView(chunk.buffer);

	// Set length
	view.setUint32(0, length);

	// Set type
	for (let i = 0; i < 4; i++) {
		chunk[4 + i] = type.charCodeAt(i);
	}

	// Set data
	chunk.set(data, 8);

	// Compute CRC32
	const crcData = chunk.subarray(4, 8 + length); // type + data
	const crcHex = crc32(crcData); // returns hex string
	const crcValue = parseInt(crcHex, 16);
	view.setUint32(8 + length, crcValue);

	return chunk;
}

export function encode(opts: EncodeOpts): Uint8Array {
	const bitsPerPixel = colorFormatChannels.get(opts.colorFormat) * opts.bitDepth;
	const bytesPerRow = Math.ceil((opts.width * bitsPerPixel) / 8);
	const expectedSize = bytesPerRow * opts.height;

	// Validation, this shouldn't happen if we were smart with the typing in PNG
	if (opts.bitDepth < 8 && opts.colorFormat !== "GrayScale" && opts.colorFormat !== "Indexed") {
		throw new Error("Bit depths < 8 only allowed for grayscale or indexed color");
	}
	if (opts.raw.length !== expectedSize) {
		throw new Error("Pixel data size mismatch");
	}

	const chunks: Uint8Array[] = [];
	chunks.push(PNG_SIGNATURE);
	chunks.push(writeIHDR(opts.width, opts.height, opts.bitDepth, opts.colorFormat));

	if (opts.colorFormat === "Indexed") {
		if (!opts.palette) throw new Error("Palette required for indexed color");
		chunks.push(writeChunk("PLTE", opts.palette));
	}

	const scanlines: Uint8Array[] = [];

	for (let y = 0; y < opts.height; y++) {
		const rowStart = y * bytesPerRow;
		const rowPixels = opts.raw.subarray(rowStart, rowStart + bytesPerRow);

		const scanline = new Uint8Array(1 + rowPixels.length);
		scanline[0] = 0; // no filter
		scanline.set(rowPixels, 1);
		scanlines.push(scanline);
	}

	const rawScanlines = concatUint8(scanlines);
	const compressed = deflate(rawScanlines);
	chunks.push(writeChunk("IDAT", compressed));
	chunks.push(writeChunk("IEND", new Uint8Array()));

	return new Uint8Array(concatUint8(chunks));
}
