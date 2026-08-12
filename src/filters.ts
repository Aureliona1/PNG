import { ArrOp, byteHsvToRgb, byteRgbToHsv, clamp, compare, deepCopy, distance2, type Easing, lerp, type Vec3, type Vec4 } from "@aurellis/helpers";
import type { PNG } from "./png.ts";

/**
 * This is a utility class that can add filters to an image. Never construct this class by itself. Use the `filter` member on PNG.
 */
export class PNGFilter {
	/**
	 * This is a utility class that can add filters to an image. Never construct this class by itself. Use the `filter` member on PNG.
	 */
	constructor(private src: PNG) {}

	/**
	 * Over or under expose the image.
	 * @param factor The multiplier to expose the image to (1 - no effect).
	 */
	exposure(factor: number): this {
		this.src.function(false, (i, a) => clamp(a[i] * factor, 0, 255));
		return this;
	}

	/**
	 * Adjust the image hue saturation and value.
	 * @param hueShift 0 - no effect (values should be 0-1).
	 * @param satFac Saturation multiplier. (Default - 1, no effect).
	 * @param valFac Value multiplier. (Default - 1, no effect).
	 */
	hsv(hueShift: number, satFac = 1, valFac = 1): this {
		for (let i = 0; i < this.src.raw.length / 4; i++) {
			const hsv = byteRgbToHsv(this.src.raw.subarray(i * 4, i * 4 + 4));
			hsv[0] = (hsv[0] + hueShift * 255) % 255;
			hsv[1] = clamp(hsv[1] * satFac, 0, 255);
			hsv[2] = clamp(hsv[2] * valFac, 0, 255);
			byteHsvToRgb(hsv);
		}
		return this;
	}
	private cf = (val: number, fac: number, thresh = 0.5) => clamp(fac * (val - thresh) + thresh, 0, 1);

	/**
	 * Apply contrasting to image.
	 * @param factor The contrast multiplier, 1 has no effect on the image.
	 * @param thresh Value from 0 to 1 (inclusive). Pixels darker than this will become darker when factor > 1, pixels lighter than this will get lighter with factor > 1.
	 */
	contrast(factor: number, thresh = 0.5): this {
		this.src.function(false, (i, a) => this.cf(a[i] / 255, factor, thresh) * 255);
		return this;
	}

	/**
	 * Blur the image by averaging neighbouring pixels.
	 * @param iterations The number of averages to take, the more you blur the image, the longer it takes to run.
	 * @param alpha Whether to also blur the alpha values. (Default - false).
	 * @param neighbourhood Determines the neighbourhood to use for blurring. (Default - Von-Neumann)
	 *
	 * - Horizontal - blurs based on the average of the pixels left and right. (Fast)
	 * - Vertical - blurs based on the average of the pixels above and below. (Fast)
	 * - Von-Neumann - Combines horizontal and vertical. (Medium)
	 * - Moore - Also averages the diagonals on top of the Von-Neumann neighbourhood. (Slow)
	 */
	blurNeighbours(iterations: number, alpha = false, neighbourhood: "Moore" | "Von-Neumann" | "Horizontal" | "Vertical" = "Von-Neumann"): this {
		const stride = this.src.width * 4;

		for (let iteration = 0; iteration < iterations; iteration++) {
			const src = this.src.raw;
			const out = new Uint8Array(src);

			for (let y = 0; y < this.src.height; y++) {
				const rowStart = y * stride;

				for (let x = 0; x < this.src.width; x++) {
					const i = rowStart + x * 4;

					let r = 0;
					let g = 0;
					let b = 0;
					let a = 0;
					let count = 0;

					const add = (index: number) => {
						r += src[index];
						g += src[index + 1];
						b += src[index + 2];

						if (alpha) {
							a += src[index + 3];
						}

						count++;
					};

					switch (neighbourhood) {
						case "Horizontal":
							if (x > 0) {
								add(i - 4);
							}

							if (x < this.src.width - 1) {
								add(i + 4);
							}

							break;

						case "Vertical":
							if (y > 0) {
								add(i - stride);
							}

							if (y < this.src.height - 1) {
								add(i + stride);
							}

							break;

						case "Von-Neumann":
							if (x > 0) {
								add(i - 4);
							}

							if (x < this.src.width - 1) {
								add(i + 4);
							}

							if (y > 0) {
								add(i - stride);
							}

							if (y < this.src.height - 1) {
								add(i + stride);
							}

							break;

						case "Moore":
							for (let dy = -1; dy <= 1; dy++) {
								for (let dx = -1; dx <= 1; dx++) {
									if (dx === 0 && dy === 0) {
										continue;
									}

									const nx = x + dx;
									const ny = y + dy;

									if (nx >= 0 && nx < this.src.width && ny >= 0 && ny < this.src.height) {
										add(ny * stride + nx * 4);
									}
								}
							}

							break;
					}

					if (count > 0) {
						out[i] = r / count;
						out[i + 1] = g / count;
						out[i + 2] = b / count;

						if (alpha) {
							out[i + 3] = a / count;
						}
					}
				}
			}

			this.src.raw = out;
		}

		return this;
	}

	/**
	 * Quantise the image by reducing the number of available colors.
	 * @param colors The number of available colors to use.
	 * @param dither Whether to apply dithering to the quantised image (Default - false).
	 */
	quantise(colors: number, dither = false): this {
		const q = (i: number) => Math.round(i * colors) / colors;
		if (dither) {
			this.src.raw = new Uint8Array(
				Array.from(this.src.raw).map((x, i, a) => {
					const out = q(x / 255) * 255;
					// Right Pix
					if (!(i % this.src.width >= this.src.width * 4 - 4)) {
						a[i + 4] += ((x - out) * 7) / 16;
						if (!(i > this.src.width * 4 * (this.src.height - 1))) {
							a[i + this.src.width * 4 + 4] += (x - out) / 16;
						}
					}
					// Down Pix
					if (!(i > this.src.width * 4 * (this.src.height - 1))) {
						a[i + this.src.width * 4] += ((x - out) * 5) / 16;
						if (!(i % this.src.width < 4)) {
							a[i + this.src.width * 4 - 4] += ((x - out) * 3) / 16;
						}
					}
					return out;
				})
			);
		} else {
			this.src.raw = this.src.raw.map(x => q(x / 255) * 255);
		}
		return this;
	}

	/**
	 * Return the difference between pixels at a determined width.
	 * @param radius The radius to check difference over (Default - 1).
	 * @param contrast The contrast factor to add over the image (Default - 10).
	 * @param contrastThresh The threshold to apply contrast to (Default - 0.02).
	 */
	edgeDetect(radius = 1, contrast = 5, contrastThresh = 0.02): this {
		this.src.filter.hsv(0, 0, 1);
		const newRaw = deepCopy(this.src.raw);
		for (let row = 0; row < this.src.height; row++) {
			for (let col = 0; col < this.src.width; col++) {
				const p = this.src.getPixel(col, row)[0];
				let totalDiff = 0;
				let diffCount = 0;
				for (let y = Math.max(0, row - radius); y < Math.min(this.src.height, row + radius); y++) {
					for (let x = Math.max(0, col - radius); x < Math.min(this.src.width, col + radius); x++) {
						const d2 = distance2([col, row], [x, y]);
						if (d2 >= radius * radius) continue;
						if (compare([x, y], [col, row])) continue;
						totalDiff += Math.abs(p - this.src.getPixel(x, y)[0]);
						diffCount++;
					}
				}
				const avg = this.cf(totalDiff / (diffCount * 255), contrast, contrastThresh) * 255;
				const index = (row * this.src.width + col) * 4;
				newRaw[index] = avg;
				newRaw[index + 1] = avg;
				newRaw[index + 2] = avg;
			}
		}
		this.src.raw = newRaw;
		return this;
	}

	/**
	 * Apply a bleed effect, this effect randomly "drags" pixels down the image.
	 * @param amount The amount of bleed to apply (0-1).
	 * @param progressive If this is set to true, the image will go from no bleed at the top, to full bleed at the bottom (Default - false).
	 *
	 * If amount is negative, the image will go from full bleed at the top to no bleed at the bottom (i.e,. reversed).
	 * @param progressionEasing Optional easing to add to a progressive bleed.
	 */
	bleed(amount: number, progressive = false, progressionEasing?: Easing): this {
		for (let i = 0; i < this.src.raw.length / 4; i++) {
			if (Math.random() < lerp(0, 1, lerp(progressive ? (amount >= 0 ? 0 : 1) : amount, progressive ? (amount > 0 ? 1 : 0) : amount, lerp(0, 1, i / this.src.raw.length, progressionEasing), "easeOutExpo"), "easeOutCirc")) {
				if (i > this.src.width) {
					this.src.raw.set(this.src.raw.subarray((i - this.src.width) * 4, (i - this.src.width + 1) * 4), i * 4);
				} else {
					this.src.raw.set(this.src.raw.subarray(((i % this.src.width) + this.src.width * (this.src.height - 1)) * 4, ((i % this.src.width) + this.src.width * (this.src.height - 1) + 1) * 4), i * 4);
				}
			}
		}
		return this;
	}

	/**
	 * Apply tint effect to image by over/under exposing color channels.
	 * @param color The color to tint the image. [R,G,B] or [R,G,B,A] (0-255).
	 */
	tint(color: ArrayLike<number> = [255, 255, 255, 255]): this {
		for (let i = 0; i < this.src.raw.length; i += 4) {
			this.src.raw[i] = clamp((this.src.raw[i] * (color[0] ?? 255)) / 255, 0, 255);
			this.src.raw[i + 1] = clamp((this.src.raw[i + 1] * (color[1] ?? 255)) / 255, 0, 255);
			this.src.raw[i + 2] = clamp((this.src.raw[i + 2] * (color[2] ?? 255)) / 255, 0, 255);
			this.src.raw[i + 3] = clamp((this.src.raw[i + 3] * (color[3] ?? 255)) / 255, 0, 255);
		}
		return this;
	}

	/**
	 * Remove potential tints on the image by reversing tint function. This will not work if the original tint color contains a 0.
	 * @param color The color to attempt to untint from. [R,G,B] or [R,G,B,A] (0-255).
	 */
	unTint(color: ArrayLike<number> = [255, 255, 255, 255]): this {
		for (let i = 0; i < this.src.raw.length; i += 4) {
			this.src.raw[i] = clamp((this.src.raw[i] / (color[0] ?? 255)) * 255, 0, 255);
			this.src.raw[i + 1] = clamp((this.src.raw[i + 1] / (color[1] ?? 255)) * 255, 0, 255);
			this.src.raw[i + 2] = clamp((this.src.raw[i + 2] / (color[2] ?? 255)) * 255, 0, 255);
			this.src.raw[i + 3] = clamp((this.src.raw[i + 3] / (color[3] ?? 255)) * 255, 0, 255);
		}
		return this;
	}

	/**
	 * Add chromatic aberration to your image, all offsets are in pixels radially from the center. Larger images will typically need higher values to see a similar effect.
	 * @param r The red offset (integer value in pixels), (Default - 1).
	 * @param g The green offset (integer value in pixels), (Default - 2).
	 * @param b The blue offset (integer value in pixels), (Default - 3).
	 */
	chrAb(r = 1, g = 2, b = 3): this {
		const oldRaw = new Uint8Array(this.src.raw);
		const getOldIndex = (x: number, y: number, channel: "R" | "G" | "B") => {
			const inputOffset = channel === "R" ? r : channel === "G" ? g : b;
			const channelIndex = channel === "G" ? 1 : channel === "B" ? 2 : 0;
			const pixel = [Math.round(x < this.src.width / 2 ? x + inputOffset : x - inputOffset), Math.round(y < this.src.height / 2 ? y + inputOffset : y - inputOffset)];
			return (pixel[1] * this.src.width + pixel[0]) * 4 + channelIndex;
		};
		const getNewIndex = (x: number, y: number, channel: "R" | "G" | "B") => {
			const channelIndex = channel === "R" ? 0 : channel === "G" ? 1 : 2;
			return (y * this.src.width + x) * 4 + channelIndex;
		};
		for (let x = 0; x < this.src.width; x++) {
			for (let y = 0; y < this.src.height; y++) {
				this.src.raw[getNewIndex(x, y, "R")] = oldRaw[getOldIndex(x, y, "R")];
				this.src.raw[getNewIndex(x, y, "G")] = oldRaw[getOldIndex(x, y, "G")];
				this.src.raw[getNewIndex(x, y, "B")] = oldRaw[getOldIndex(x, y, "B")];
			}
		}
		return this;
	}

	/**
	 * Mix the current image with another one.
	 * @param img The image to overlay.
	 * @param factor The factor (0-1) of the new image.
	 */
	mixImage(img: PNG, factor = 0.5): this {
		for (let row = 0; row < (img.height > this.src.height ? this.src.height : img.height); row++) {
			const srcRowData = this.src.raw.subarray(row * this.src.width * 4, (row + 1) * this.src.width * 4);
			srcRowData.set(ArrOp.lerp(srcRowData, img.raw.subarray(row * img.width * 4, (row + 1) * img.width * 4), factor));
		}
		return this;
	}

	/**
	 * Overlay a color on the image.
	 * @param color The color to overlay (gamma rgb 0 - 255).
	 * @param factor The factor (0-1) of the fade between colors.
	 */
	mixColor(color: Vec4 = [255, 255, 255, 255], factor = 0.5): this {
		this.src.raw = this.src.raw.map((x, i) => Math.round(lerp(x, color[i % 4], factor)));
		return this;
	}

	private blurF32(src: Float32Array, iterations: number): Float32Array {
		const width = this.src.width;
		const height = this.src.height;
		const stride = width * 4;

		let current = src;

		for (let iteration = 0; iteration < iterations; iteration++) {
			const out = new Float32Array(current.length);

			for (let y = 0; y < height; y++) {
				const rowStart = y * stride;

				for (let x = 0; x < width; x++) {
					const i = rowStart + x * 4;

					let r = 0;
					let g = 0;
					let b = 0;
					let a = 0;
					let count = 0;

					// Top-left
					if (x > 0 && y > 0) {
						const n = i - stride - 4;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Top
					if (y > 0) {
						const n = i - stride;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Top-right
					if (x < width - 1 && y > 0) {
						const n = i - stride + 4;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Left
					if (x > 0) {
						const n = i - 4;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Right
					if (x < width - 1) {
						const n = i + 4;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Bottom-left
					if (x > 0 && y < height - 1) {
						const n = i + stride - 4;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Bottom
					if (y < height - 1) {
						const n = i + stride;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					// Bottom-right
					if (x < width - 1 && y < height - 1) {
						const n = i + stride + 4;
						r += current[n];
						g += current[n + 1];
						b += current[n + 2];
						a += current[n + 3];
						count++;
					}

					out[i] = r / count;
					out[i + 1] = g / count;
					out[i + 2] = b / count;
					out[i + 3] = a / count;
				}
			}

			current = out;
		}

		return current;
	}

	/**
	 * Apply bloom to pixels above the brightness threshold.
	 * @param strength The coefficient to multiply bloomed pixels by. (Default - 1)
	 * @param radius The radius of the bloom circle. (Default - 10)
	 * @param thresh The threshold (0 - 1) that pixels must be brighter than to apply bloom to. (Default - 0.9)
	 * @param color The color to tint the bloom with.
	 */
	bloom(strength = 1, radius = 10, thresh = 0.9, color: Vec3 = [255, 255, 255]): this {
		const tint = [...ArrOp.divide(color, 255), 1];
		thresh = clamp(thresh, 0, 1);
		const brightPass = new Float32Array(this.src.raw.length);

		for (let i = 0; i < this.src.raw.length; i += 4) {
			const brightness = (this.src.raw[i] + this.src.raw[i + 1] + this.src.raw[i + 2]) / (255 * 3);

			const alpha = this.src.raw[i + 3] / 255;
			const lightContribution = brightness * alpha;

			if (lightContribution > thresh) {
				const alpha = this.src.raw[i + 3] / 255;

				brightPass[i] = this.src.raw[i] * alpha;
				brightPass[i + 1] = this.src.raw[i + 1] * alpha;
				brightPass[i + 2] = this.src.raw[i + 2] * alpha;
				brightPass[i + 3] = this.src.raw[i + 3];
			}
		}

		const blurred = this.blurF32(brightPass, radius);
		let ti = 0;
		this.src.function(true, (i, a) => clamp(a[i] + blurred[i] * strength * tint[ti++ & 3], 0, 255));
		return this;
	}
}
