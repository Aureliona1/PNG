import { PNG } from "../png.ts";
import init, { source, decode as wasmDecode } from "../vendor/png_wasm.js";

await init(source);

/**
 * Decode a PNG binary.
 * @param image The binary to decode.
 */
export function decodePng(image: Uint8Array): PNG {
	const res = wasmDecode(image);
	return new PNG(new Uint8Array(res.image), res.width, res.height, res.colorType, res.bitDepth);
}
