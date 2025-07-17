import { clamp, mapRange } from "@aurellis/helpers";
import type { PNG } from "./png.ts";
import { type BitDepth, formatChannelCounts, type DecodeResult } from "./types.ts";

export class PNGFormatterTo {
	/**
	 * Convert a 24-bit RGB color into a 24-bit integer for indexing in the color palette.
	 * @param color The color to convert, all values after color[2] are ignored.
	 */
	static c2n = (color: Uint8Array) => (color[0] << 16) + (color[1] << 8) + color[2];
	/**
	 * Convert a 24-bit integer into an RGB color. Inverse of {@link PNGFormatterTo.c2n}.
	 * @param n The number.
	 */
	static n2c = (n: number) => new Uint8Array([(n & (0xff << 16)) >> 16, (n & (0xff << 8)) >> 8, n & 0xff]);
	private _indexedPalette: Map<number, number> = new Map();

	/**
	 * A utility class that converts pixel arrays from RGBA to any supported format.
	 * All methods assume that the image is already in valid RGBA, so this should be checked externally with {@link isRGBA}.
	 * @param src The source image to format.
	 */
	constructor(public src: PNG) {}

	/**
	 * Check if the image is grayscale with no alpha.
	 */
	canBeGrayScale(): boolean {
		let valid = true;
		for (let i = 0; i < this.src.raw.length && valid; i += 4) {
			valid = this.src.raw[i] === this.src.raw[i + 1] && this.src.raw[i] === this.src.raw[i + 2] && this.src.raw[i + 3] === 255;
		}
		return valid;
	}

	/**
	 * Transform the pixel array into a single-channel grayscale array.
	 * Does not mutate the old raw.
	 * This does not check whether the image is eligible to be grayscale, this must be done externally.
	 */
	toGrayScale(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length / 4);
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = this.src.raw[i * 4];
		}
		return newRaw;
	}

	/**
	 * Check if the image has no transparency.
	 */
	canBeRGB(): boolean {
		let valid = true;
		for (let i = 3; i < this.src.raw.length && valid; i += 4) {
			valid = this.src.raw[i] === 255;
		}
		return valid;
	}

	/**
	 * Transform the pixel array into RGB with no alpha.
	 * Does not mutate the old raw.
	 * This does not check if the image is eligible to be RGB, this must be done externally.
	 */
	toRGB(): Uint8Array {
		const newRaw = new Uint8Array((this.src.raw.length * 3) / 4);
		for (let i = 0; i < newRaw.length / 3; i++) {
			newRaw[i * 3] = this.src.raw[i * 4];
			newRaw[i * 3 + 1] = this.src.raw[i * 4 + 1];
			newRaw[i * 3 + 2] = this.src.raw[i * 4 + 2];
		}
		return newRaw;
	}

	/**
	 * Check if the image can be represented by indexed color.
	 * This is rather slow as it has to manually perform color indexing.
	 */
	canBeIndexed(): boolean {
		// No point trying if we have alpha
		if (!this.canBeRGB()) return false;

		// Unique set of image colors.
		this._indexedPalette.clear();
		for (let i = 0; i < this.src.raw.length; i += 4) {
			const key = PNGFormatterTo.c2n(this.src.raw.subarray(i, i + 3));
			if (!this._indexedPalette.has(key)) {
				this._indexedPalette.set(key, this._indexedPalette.size);
			}
		}

		// If there are too many colors
		if (this._indexedPalette.size > 256) {
			this._indexedPalette.clear();
			return false;
		}

		return true;
	}

	/**
	 * Transform the pixel array into indexed color.
	 * This does not mutate the old pixel array.
	 * This will check that the image is eligible to be indexed, and will return two empty Uint8Arrays if the image is not.
	 * @returns [palette (RGB), raw]
	 */
	toIndexed(): [Uint8Array, Uint8Array] {
		if (!this._indexedPalette.size) {
			if (!this.canBeIndexed()) {
				return [new Uint8Array(), new Uint8Array()];
			}
		}
		const palette = new Uint8Array(this._indexedPalette.size * 3);
		this._indexedPalette.forEach((i, col) => {
			palette.set(PNGFormatterTo.n2c(col), i * 3);
		});
		const newRaw = new Uint8Array(this.src.raw.length / 4);
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = this._indexedPalette.get(PNGFormatterTo.c2n(this.src.raw.subarray(i * 4, i * 4 + 3))) ?? 0;
		}
		return [palette, newRaw];
	}

	/**
	 * Check if the image can be represented as grayscale with alpha.
	 */
	canBeGrayScaleAlpha(): boolean {
		let valid = true;
		for (let i = 0; i < this.src.raw.length && valid; i += 4) {
			valid = this.src.raw[i] === this.src.raw[i + 1] && this.src.raw[i] === this.src.raw[i + 2];
		}
		return valid;
	}

	/**
	 * Transform the pixel array into grayscale with alpha.
	 * This does not mutate the old pixel array.
	 */
	toGrayScaleAlpha(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length / 2);
		for (let i = 0; i < newRaw.length; i += 2) {
			newRaw[i] = this.src.raw[i * 2];
			newRaw[i + 1] = this.src.raw[i * 2 + 3];
		}
		return newRaw;
	}

	/**
	 * Check if an image is valid RGBA, this should be called before other validators.
	 * @param png The png to validate, this method requires width and height.
	 */
	canBeRGBA(): boolean {
		return this.src.width * this.src.height * 4 === this.src.raw.length;
	}

	/**
	 * This does nothing, it is just to be complete with the color formats.
	 */
	toRGBA(): Uint8Array {
		return this.src.raw;
	}
}

export class PNGFormatterFrom {
	/**
	 * A utility class that converts pixel arrays from any supported format to RGBA.
	 * All methods assume that the image is in the specified format, this shuold be checked externally with {@link isCorrectFormat()}.
	 * @param src The source image to format.
	 */
	constructor(public src: DecodeResult) {}

	/**
	 * Validate that the input pixel array length matches the expected length for this particular color format.
	 * Also validates color indices for indexed color.
	 */
	isCorrectFormat() {
		if (this.src.colorFormat === "Indexed") {
			let maxIndex = 0;
			for (let i = 0; i < this.src.raw.length; i++) {
				maxIndex = this.src.raw[i] > maxIndex ? this.src.raw[i] : maxIndex;
			}
			return this.src.width * this.src.height === this.src.raw.length && this.src.palette.length > maxIndex;
		}
		return this.src.width * this.src.height * formatChannelCounts.get(this.src.colorFormat) === this.src.raw.length;
	}

	/**
	 * Tranform a grayscale pixel array to RGBA.
	 * Does not mutate the original array.
	 */
	fromGrayScale(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length * 4);
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = (i + 1) % 4 ? this.src.raw[Math.floor(i / 4)] : 255;
		}
		return newRaw;
	}

	/**
	 * Tranform an RGB pixel array to RGBA.
	 * Does not mutate the original array.
	 */
	fromRGB(): Uint8Array {
		const newRaw = new Uint8Array((this.src.raw.length * 4) / 3);
		for (let i = 0, oldI = 0; i < newRaw.length; i++) {
			newRaw[i] = (i + 1) % 4 ? this.src.raw[oldI++] : 255;
		}
		return newRaw;
	}

	/**
	 * Tranform an indexed pixel array to RGBA.
	 * Does not mutate the original array.
	 */
	fromIndexed(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length * 4);
		if (this.src.colorFormat == "Indexed") {
			for (let i = 0; i < newRaw.length; i++) {
				newRaw[i] = (i + 1) % 4 ? this.src.palette[this.src.raw[Math.floor(i / 4)] * 3 + (i % 4)] : 255;
			}
		}
		return newRaw;
	}

	/**
	 * Tranform a grayscale pixel array with alpha to RGBA.
	 * Does not mutate the original array.
	 */
	fromGrayScaleAlpha(): Uint8Array {
		const newRaw = new Uint8Array(this.src.raw.length * 2);
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = i % 4 === 2 ? this.src.raw[Math.floor(i / 2) - 1] : this.src.raw[Math.floor(i / 2)];
		}
		return newRaw;
	}
}

/**
 * Take an array of bytes and return the array with the bits packed to the desired bit depth.
 * @param bytes The input bytes.
 * @param desiredBitDepth The desired bit depth.
 * @param normalise Whether to normalise the value to within the range supported by the desired bit depth. Don't use this for indexed pngs
 * @returns A new packed array, does not mutate the original array.
 */
export function packBits(bytes: Uint8Array, desiredBitDepth: BitDepth, normalise = true): Uint8Array {
	if (desiredBitDepth < 8) {
		const newRaw = new Uint8Array((bytes.length * desiredBitDepth) / 8);
		const valuesPerByte = 8 / desiredBitDepth;
		for (let i = 0; i < newRaw.length; i++) {
			for (let j = 0; j < valuesPerByte; j++) {
				const value = bytes[i * valuesPerByte + j];
				const normalisedValue = value >> (8 - desiredBitDepth);
				newRaw[i] |= ((normalise ? normalisedValue : value) & ((1 << desiredBitDepth) - 1)) << ((valuesPerByte - j - 1) * desiredBitDepth);
			}
		}
		return newRaw;
	}
	return bytes;
}

/**
 * Take an array of packed bits and return the unpacked bytes.
 * @param bits The bit-packed array.
 * @param currentBitDepth The current bit depth to unpack.
 * @param normalise Whether to normalise the unpacked bits into a byte range. Do not do this for indexed pngs.
 */
export function unpackBits(bits: Uint8Array, currentBitDepth: BitDepth, normalise = true): Uint8Array {
	if (currentBitDepth < 8) {
		const newRaw = new Uint8Array((bits.length * 8) / currentBitDepth);
		const maxOffset = 8 - currentBitDepth;
		const modulo = (1 << currentBitDepth) - 1;
		for (let i = 0; i < newRaw.length; i++) {
			newRaw[i] = (bits[Math.floor((i * currentBitDepth) / 8)] >> (maxOffset - ((i * currentBitDepth) & maxOffset))) & modulo;
			if (normalise) {
				newRaw[i] = mapRange(newRaw[i], [0, (1 << currentBitDepth) - 1], [0, 255]);
			}
		}
		return newRaw;
	}
	return bits;
}

/**
 * Gamma correct an array of pixels. Mutates the array in place.
 */
export function gammaCorrect(pixels: Uint8Array, gamma: number) {
	const invGamma = 1 / gamma;
	const length = pixels.length;
	for (let i = 0; i < length; i++) {
		let normalized = pixels[i] / 255;
		let corrected = Math.pow(normalized, invGamma);
		pixels[i] = clamp(Math.round(corrected * 255), [0, 255]);
	}
}
