import { assert } from "@std/assert";
import { PNGFormatterTo } from "../src/format.ts";
import { PNG } from "../src/png.ts";

Deno.test({
	name: "Can be GrayScale",
	fn: () => {
		const raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255, 0, 0, 0, 255]);
		const im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeGrayScale());
	}
});

Deno.test({
	name: "Can't be GrayScale",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255, 0, 1, 0, 255]);
		let im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScale());
		raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 254, 3, 3, 3, 255, 4, 4, 4, 255, 0, 0, 0, 255]);
		im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScale());
	}
});

Deno.test({
	name: "Can be RGB",
	fn: () => {
		const raw = new Uint8Array([1, 2, 3, 255, 2, 3, 1, 255, 3, 2, 3, 255, 4, 1, 4, 255, 1, 2, 5, 255]);
		const im = new PNG(raw, 2, 2);
		assert(new PNGFormatterTo(im).canBeGrayScale());
	}
});

Deno.test({
	name: "Can't be RGB",
	fn: () => {
		let raw = new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255, 0, 1, 0, 254]);
		let im = new PNG(raw, 2, 2);
		assert(!new PNGFormatterTo(im).canBeGrayScale());
	}
});
