import { compare, concatUint8 } from "@aurellis/helpers";
import { type BitDepth, type ColorFormat, colorFormatChannels, colorFormatNumbers, type DecodeResult } from "../types.ts";

export async function decode(image: Uint8Array): Promise<DecodeResult> {
	const data = new DataView(image.buffer, image.byteOffset, image.byteLength);

	const readChunk = (offset: number) => {
		const length = data.getUint32(offset);
		const type = String.fromCharCode(...image.subarray(offset + 4, offset + 8));
		const chunkData = image.subarray(offset + 8, offset + 8 + length);
		const nextOffset = offset + 8 + length + 4; // skip CRC
		return { type, chunkData, nextOffset };
	};

	// Verify PNG signature
	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	if (!compare(sig, image.subarray(0, 8))) {
		throw new Error("PNG signature is invalid...");
	}

	let offset = 8;
	let width = 0,
		height = 0;
	let bitDepth: BitDepth = 8,
		colorFormat: ColorFormat = "RGBA";
	let palette: Uint8Array | undefined;
	let trns: Uint8Array | undefined;
	let gamma: number | undefined;
	const idatChunks: Uint8Array[] = [];

	while (offset < image.length) {
		const { type, chunkData, nextOffset } = readChunk(offset);

		if (type === "IHDR") {
			width = data.getUint32(offset + 8);
			height = data.getUint32(offset + 12);
			bitDepth = image[offset + 16] as BitDepth;
			colorFormat = colorFormatNumbers.revGet(image[offset + 17] as keyof typeof colorFormatNumbers.reverseMap);

			const compression = image[offset + 18];
			const filterMethod = image[offset + 19];
			const interlace = image[offset + 20];

			if (compression !== 0) throw new Error("Unsupported compression method");
			if (filterMethod !== 0) throw new Error("Unsupported filter method");
			if (interlace !== 0) throw new Error("Interlaced PNG not supported");
		} else if (type === "PLTE") {
			palette = chunkData;
		} else if (type === "tRNS") {
			trns = chunkData;
		} else if (type === "IDAT") {
			idatChunks.push(chunkData);
		} else if (type === "gAMA") {
			// gAMA chunk data is 4 bytes big endian unsigned int
			gamma = (chunkData[0] << 24) | (chunkData[1] << 16) | (chunkData[2] << 8) | chunkData[3];
			gamma = gamma / 100000; // normalize to float gamma
		} else if (type === "IEND") {
			break;
		}

		offset = nextOffset;
	}

	// Join IDAT data
	const compressedData = concatUint8(idatChunks);

	// Decompress with DecompressionStream
	const stream = new DecompressionStream("deflate");
	const writer = stream.writable.getWriter();
	writer.write(compressedData);
	writer.close();
	const decompressedBuffer = await new Response(stream.readable).arrayBuffer();
	const decompressed = new Uint8Array(decompressedBuffer);

	const bitsPerPixel = bitDepth * colorFormatChannels.get(colorFormat);
	const bitsPerRow = bitsPerPixel * width;
	const rowLength = Math.ceil(bitsPerRow / 8);

	const expectedLength = height * (1 + rowLength); // +1 for filter byte per row
	if (decompressed.length !== expectedLength) {
		throw new Error(`Unexpected decompressed length. Expected ${expectedLength}, got ${decompressed.length}`);
	}

	const raw = new Uint8Array(height * rowLength);
	const prev = new Uint8Array(rowLength);
	const curr = new Uint8Array(rowLength);
	const bpp = Math.ceil((bitDepth * colorFormatChannels.get(colorFormat)) / 8);

	let inOffset = 0;
	let outOffset = 0;

	function paethPredictor(a: number, b: number, c: number): number {
		const p = a + b - c;
		const pa = Math.abs(p - a);
		const pb = Math.abs(p - b);
		const pc = Math.abs(p - c);
		if (pa <= pb && pa <= pc) return a;
		if (pb <= pc) return b;
		return c;
	}

	for (let y = 0; y < height; y++) {
		const filter = decompressed[inOffset++];
		const scanline = decompressed.subarray(inOffset, inOffset + rowLength);

		inOffset += rowLength;

		for (let x = 0; x < rowLength; x++) {
			const rawByte = scanline[x];
			const left = x >= bpp ? curr[x - bpp] : 0;
			const up = prev[x] ?? 0;
			const upLeft = x >= bpp ? prev[x - bpp] : 0;

			switch (filter) {
				case 0: // None
					curr[x] = rawByte;
					break;
				case 1: // Sub
					curr[x] = (rawByte + left) & 0xff;
					break;
				case 2: // Up
					curr[x] = (rawByte + up) & 0xff;
					break;
				case 3: // Average
					curr[x] = (rawByte + Math.floor((left + up) / 2)) & 0xff;
					break;
				case 4: // Paeth
					curr[x] = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
					break;
				default:
					throw new Error(`Unknown filter type: ${filter}`);
			}
		}

		raw.set(curr, outOffset);
		outOffset += rowLength;

		// Prepare prev row for next iteration
		prev.set(curr);
	}

	if (colorFormat === "Indexed") {
		return {
			raw,
			palette: palette ?? new Uint8Array(),
			width,
			height,
			colorFormat,
			bitDepth,
			trns,
			gamma
		};
	}

	return {
		raw,
		width,
		height,
		colorFormat,
		bitDepth,
		trns,
		gamma
	};
}
