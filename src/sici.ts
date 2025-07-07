import type { Vec2 } from "@aurellis/helpers";
import { PNG } from "./png.ts";

/**
 * Encode an image into a SICI binary.
 * @param image The image to encode.
 * @returns The encoded bytes.
 */
export function encodeSICI(image: PNG) {
	let hasAlpha = !image.alphaHandler.hasNoAlphaValues;
	if (hasAlpha && !image.alphaHandler.hasVariableAlpha) {
		image.alphaHandler.removeAlpha();
		hasAlpha = false;
	}
	const buffer = new ArrayBuffer(17 + image.raw.length);
	const view = new DataView(buffer);
	view.setFloat64(0, image.dimensions[0]);
	view.setFloat64(8, image.dimensions[1]);
	view.setUint8(16, hasAlpha ? 1 : 0);
	const output = new Uint8Array(buffer);
	output.set(image.raw, 17);
	return output;
}

/**
 * Decode a SICI binary into a PNG.
 * @param input The SICI binary.
 */
export function decodeSICI(input: Uint8Array) {
	const view = new DataView(input.buffer);
	const dimensions: Vec2 = [view.getFloat64(0), view.getFloat64(8)];
	const hasAlpha = view.getUint8(16) == 1;
	const im = new PNG();
	im.dimensions = dimensions;
	im.raw = input.slice(17);
	if (!hasAlpha) {
		im.alphaHandler.addAlpha();
	}
	return im;
}
