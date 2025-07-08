import type { PNG } from "./png.ts";

export class PNGAlphaHandler {
	constructor(public src: PNG) {}
	/**
	 * Check if the image has just rgb values and not a.
	 */
	get hasNoAlphaValues(): boolean {
		return this.src.raw.length == this.src.height * this.src.width * 3;
	}
	/**
	 * Check if the image has alpha values that vary from 255, does not check if the alpha actually exists
	 */
	get hasVariableAlpha(): boolean {
		let variable = false;
		for (let i = 3; variable == false && i < this.src.raw.length; i += 4) {
			variable = this.src.raw[i] !== 255;
		}
		return variable;
	}
	/**
	 * Remove every 4th value from the raw. This is irrespective of whether alpha values actually exist in the raw. Make sure you confirm the presence of alpha values before running this.
	 */
	removeAlpha(): PNGAlphaHandler {
		const out = new Uint8Array(this.src.height * this.src.width * 3);
		for (let oldI = 0, newI = 0; oldI < this.src.raw.length; oldI += (oldI + 2) % 4 ? 1 : 2, newI++) {
			out[newI] = this.src.raw[oldI];
		}
		this.src.raw = out;
		return this;
	}
	/**
	 * Add a 255 value in every 4th place. This is irrespective of if the alpha is already there. Ensure that alpha is not already present before running this.
	 */
	addAlpha(): PNGAlphaHandler {
		const out = new Uint8Array(this.src.height * this.src.width * 4).fill(255);
		for (let newI = 0, oldI = 0; newI < out.length; newI += (newI + 2) % 4 ? 1 : 2, oldI++) {
			out[newI] = this.src.raw[oldI];
		}
		this.src.raw = out;
		return this;
	}
}
