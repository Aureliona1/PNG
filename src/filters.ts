import { ArrOp, byteHsvToRgb, byteRgbToHsv, clamp, type Easing, lerp, type Vec2, type Vec4 } from "@aurellis/helpers";
import type { PNG } from "./png.ts";

/**
 * This is a utility class that can add filters to an image. Never construct this class by itself. Use the `filter` member on PNG.
 */
export class FilterPNG {
	private i2c(i: number): Vec2 {
		return [Math.floor(Math.floor(i / 4) / this.src.dimensions[1]), Math.floor(i / 4) % this.src.dimensions[1]];
	}
	private getNeighbours(i: number, neighbourhood: "Moore" | "Von-Neumann" | "Horizontal" | "Vertical") {
		const coord = this.i2c(i);
		const n = new Uint8Array(neighbourhood == "Moore" ? 32 : neighbourhood == "Von-Neumann" ? 16 : 8);
		switch (neighbourhood) {
			case "Moore":
				n.set(this.src.getPixel(coord[0] - 1, coord[1] - 1));
				n.set(this.src.getPixel(coord[0] - 1, coord[1]), 4);
				n.set(this.src.getPixel(coord[0] - 1, coord[1] + 1), 8);
				n.set(this.src.getPixel(coord[0], coord[1] - 1), 12);
				n.set(this.src.getPixel(coord[0], coord[1] + 1), 16);
				n.set(this.src.getPixel(coord[0] + 1, coord[1] - 1), 20);
				n.set(this.src.getPixel(coord[0] + 1, coord[1]), 24);
				n.set(this.src.getPixel(coord[0] + 1, coord[1] + 1), 28);
				break;
			case "Von-Neumann":
				n.set(this.src.getPixel(coord[0] - 1, coord[1]));
				n.set(this.src.getPixel(coord[0], coord[1] - 1), 4);
				n.set(this.src.getPixel(coord[0], coord[1] + 1), 8);
				n.set(this.src.getPixel(coord[0] + 1, coord[1]), 12);
				break;
			case "Horizontal":
				n.set(this.src.getPixel(coord[0], coord[1] - 1));
				n.set(this.src.getPixel(coord[0], coord[1] + 1), 4);
				break;
			case "Vertical":
				n.set(this.src.getPixel(coord[0] - 1, coord[1]));
				n.set(this.src.getPixel(coord[0] + 1, coord[1]), 4);
				break;
		}
		return n;
	}
	constructor(private src: PNG) {}
	/**
	 * Over or under expose the image.
	 * @param factor The multiplier to expose the image to (1 - no change)
	 */
	exposure(factor: number): FilterPNG {
		this.src.function(false, (i, a) => clamp(a[i] * factor, [0, 255]));
		return this;
	}
	/**
	 * Adjust the image hue saturation and value.
	 * @param hueShift 0 - no effect (values should be 0-1).
	 * @param satFac 1 - no effect
	 * @param valFac 1 - no effect
	 */
	hsv(hueShift: number, satFac: number, valFac: number): FilterPNG {
		for (let i = 0; i < this.src.raw.length / 4; i++) {
			const hsv = byteRgbToHsv(this.src.raw.subarray(i * 4, i * 4 + 3));
			hsv[0] = (hsv[0] + hueShift * 255) % 255;
			hsv[1] = clamp(hsv[1] * satFac, [0, 255]);
			hsv[2] = clamp(hsv[2] * valFac, [0, 255]);
			byteHsvToRgb(hsv);
		}
		return this;
	}
	private cf = (val: number, fac: number, thresh = 0.5) => clamp(fac * (val - thresh) + thresh, [0, 1]);
	/**
	 * Apply contrasting to image
	 * @param factor 1 - no effect
	 */
	contrast(factor: number, thresh = 0.5): FilterPNG {
		this.src.function(false, (i, a) => this.cf(a[i] / 255, factor, thresh) * 255);
		return this;
	}
	/**
	 * Blur the image by averaging neighbouring pixels.
	 * @param iterations The number of averages to take, the more you blur the image, the longer it takes to run.
	 * @param alpha Whether to also blur the alpha values. (Default - false).
	 * @param neighbourhood Determines the neighbourhood to use for blurring. (Default = Von-Neumann)
	 *
	 * Horizontal - blurs based on the average of the pixels above and below. (Fast)
	 * Vertical - blurs based on the average of the pixels left and right. (Fast)
	 * Von-Neumann - Combines horizontal and vertical. (Meduim)
	 * Moore - Also averages the diagonals on top of the Von-Neumann neighbourhood. (Slow)
	 */
	blur(iterations: number, alpha = false, neighbourhood: "Moore" | "Von-Neumann" | "Horizontal" | "Vertical" = "Von-Neumann"): FilterPNG {
		const sumEvery = (arr: Uint8Array, start: number, skip: number) => {
			let sum = 0;
			for (let i = start; i < arr.length; i += skip) {
				sum += arr[i];
			}
			return sum;
		};
		for (let i = 0; i < iterations; i++) {
			const out = new Uint8Array(this.src.raw);
			for (let i = 0; i < out.length; i += 4) {
				const n = this.getNeighbours(i, neighbourhood);
				const neighbourCount = n.length / 4;
				out[i] = sumEvery(n, 0, 4) / neighbourCount;
				out[i + 1] = sumEvery(n, 1, 4) / neighbourCount;
				out[i + 2] = sumEvery(n, 2, 4) / neighbourCount;
				if (alpha) {
					out[i + 4] = sumEvery(n, 3, 4) / neighbourCount;
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
	quantise(colors: number, dither = false): FilterPNG {
		const q = (i: number) => Math.round(i * colors) / colors;
		if (dither) {
			this.src.raw = new Uint8Array(
				Array.from(this.src.raw).map((x, i, a) => {
					const out = q(x / 255) * 255;
					// Right Pix
					if (!(i % this.src.dimensions[1] >= this.src.dimensions[1] * 4 - 4)) {
						a[i + 4] += ((x - out) * 7) / 16;
						if (!(i > this.src.dimensions[1] * 4 * (this.src.dimensions[0] - 1))) {
							a[i + this.src.dimensions[1] * 4 + 4] += (x - out) / 16;
						}
					}
					// Down Pix
					if (!(i > this.src.dimensions[1] * 4 * (this.src.dimensions[0] - 1))) {
						a[i + this.src.dimensions[1] * 4] += ((x - out) * 5) / 16;
						if (!(i % this.src.dimensions[1] < 4)) {
							a[i + this.src.dimensions[1] * 4 - 4] += ((x - out) * 3) / 16;
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
	 * @param width The width to check difference over. (Default - 1).
	 * @param contrast The contrast factor to add over the image. (Default - 5).
	 * @param contrastThresh The threshold to apply contrast to. (Default - 0.05)
	 */
	edgeDetect(width = 1, contrast = 5, contrastThresh = 0.05): FilterPNG {
		this.src.function(false, (i, arr) => {
			const val = Math.min(
				Math.abs(i < this.src.dimensions[1] * 4 * width ? 255 : arr[i] - arr[i - this.src.dimensions[1] * 4 * width]), // Up
				Math.abs(i > this.src.dimensions[1] * (this.src.dimensions[0] - width) * 4 ? 255 : arr[i] - arr[i + this.src.dimensions[1] * 4 * width]), // Down
				Math.abs(i % (this.src.dimensions[1] * 4) < 4 * width ? 255 : arr[i] - arr[i - 4 * width]), // Left
				Math.abs(i % (this.src.dimensions[1] * 4) > this.src.dimensions[1] * 4 - 4 * width ? 255 : arr[i] - arr[i + 4 * width]) // Right
			);
			return this.cf(val / 255, contrast, contrastThresh) * 255;
		});
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
	bleed(amount: number, progressive = false, progressionEasing?: Easing): FilterPNG {
		for (let i = 0; i < this.src.raw.length / 4; i++) {
			if (Math.random() < lerp(0, 1, lerp(progressive ? (amount >= 0 ? 0 : 1) : amount, progressive ? (amount > 0 ? 1 : 0) : amount, lerp(0, 1, i / this.src.raw.length, progressionEasing), "easeOutExpo"), "easeOutCirc")) {
				if (i > this.src.dimensions[1]) {
					this.src.raw.set(this.src.raw.subarray((i - this.src.dimensions[1]) * 4, (i - this.src.dimensions[1] + 1) * 4), i * 4);
				} else {
					this.src.raw.set(this.src.raw.subarray(((i % this.src.dimensions[1]) + this.src.dimensions[1] * (this.src.dimensions[0] - 1)) * 4, ((i % this.src.dimensions[1]) + this.src.dimensions[1] * (this.src.dimensions[0] - 1) + 1) * 4), i * 4);
				}
			}
		}
		return this;
	}
	/**
	 * Apply tint effect to image by over/under exposing color channels.
	 * @param color The color to tint the image (gamma rgb: 0 - 255), (Default - [255, 255, 255, 255]).
	 */
	tint(color: Uint8Array = new Uint8Array([255, 255, 255, 255])): FilterPNG {
		for (let i = 0; i < this.src.raw.length; i += 4) {
			this.src.raw[i] = clamp((this.src.raw[i] * (color[0] ?? 255)) / 255, [0, 255]);
			this.src.raw[i + 1] = clamp((this.src.raw[i + 1] * (color[1] ?? 255)) / 255, [0, 255]);
			this.src.raw[i + 2] = clamp((this.src.raw[i + 2] * (color[2] ?? 255)) / 255, [0, 255]);
			this.src.raw[i + 3] = clamp((this.src.raw[i + 3] * (color[3] ?? 255)) / 255, [0, 255]);
		}
		return this;
	}
	/**
	 * Remove potential tints on the image by reversing tint function. This will not work if the original tint color contains a 0.
	 * @param color The color to attemt to untint from (gamma rgb: 0 - 255), (Default - [255, 255, 255, 255]).
	 */
	unTint(color: Uint8Array = new Uint8Array([255, 255, 255, 255])): FilterPNG {
		for (let i = 0; i < this.src.raw.length; i += 4) {
			this.src.raw[i] = clamp((this.src.raw[i] / (color[0] ?? 255)) * 255, [0, 255]);
			this.src.raw[i + 1] = clamp((this.src.raw[i + 1] / (color[1] ?? 255)) * 255, [0, 255]);
			this.src.raw[i + 2] = clamp((this.src.raw[i + 2] / (color[2] ?? 255)) * 255, [0, 255]);
			this.src.raw[i + 3] = clamp((this.src.raw[i + 3] / (color[3] ?? 255)) * 255, [0, 255]);
		}
		return this;
	}
	/**
	 * Add chromatic abberation to your image, all offsets are to the left. Larger images will typically need higher values to see the same effect.
	 * @param r The red offset (integer value in pixels), (Default - 1).
	 * @param g The green offset (integer value in pixels), (Default - 2).
	 * @param b The blue offset (integer value in pixels), (Default - 3).
	 */
	chrAb(r = 1, g = 2, b = 3): FilterPNG {
		this.src.function(false, (i, a) => {
			if (i % (this.src.dimensions[1] * 4) > Math.max(r, g, b) * 4) {
				if (i % 4 == 0) {
					a[i - Math.floor(r) * 4] = a[i];
				}
				if (i % 4 == 1) {
					a[i - Math.floor(g) * 4] = a[i];
				}
				if (i % 4 == 2) {
					a[i - Math.floor(b) * 4] = a[i];
				}
			}
			return a[i];
		});
		return this;
	}
	/**
	 * Mix the current image with another one.
	 * @param img The image to overlay.
	 * @param factor The factor (0-1) of the new image.
	 */
	mixImage(img: PNG, factor = 0.5): FilterPNG {
		for (let row = 0; row < (img.dimensions[0] > this.src.dimensions[0] ? this.src.dimensions[0] : img.dimensions[0]); row++) {
			const srcRowData = this.src.raw.subarray(row * this.src.dimensions[1] * 4, (row + 1) * this.src.dimensions[1] * 4);
			srcRowData.set(ArrOp.lerp(srcRowData, img.raw.subarray(row * img.dimensions[1] * 4, (row + 1) * img.dimensions[1] * 4), factor));
		}
		return this;
	}
	/**
	 * Overlay a color on the image.
	 * @param color The color to overlay (gamma rgb 0 - 255).
	 * @param factor The factor (0-1) of the fade between colors.
	 */
	mixColor(color: Vec4 = [255, 255, 255, 255], factor = 0.5): FilterPNG {
		this.src.raw = this.src.raw.map((x, i) => Math.round(lerp(x, color[i % 4], factor)));
		return this;
	}
}
