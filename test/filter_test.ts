import { clamp, clog, compare, random } from "@aurellis/helpers";
import { PNG } from "../src/png.ts";
import { assert } from "../src/vendor/assert.ts";

/*
	In regards to these tests.
	Since the filters are all cosmetic operations and do not explicitly
	follow any steady "rule", tests will only be run on very basic cases for some filters.

	For any obviously "incorrect" filter behaviour, please raise an issue on the PNG GitHub.
*/

Deno.test({
	name: "Exposure Filter",
	fn: () => {
		const sample = new PNG(
			new Uint8Array(32 * 32 * 4).map((_, i) => random(0, 256, i, 0)),
			32,
			32
		);
		const copy = new PNG(new Uint8Array(sample.raw), sample.width, sample.height);
		copy.filter.exposure(2);
		assert(
			compare(
				copy.raw,
				sample.raw.map((x, i) => ((i + 1) % 4 ? clamp(x * 2, [0, 255]) : x))
			)
		);
		copy.filter.exposure(0);
		assert(copy.raw.filter((_, i) => (i + 1) % 4).every(x => x === 0));
	}
});

Deno.test({
	name: "HSV Filter",
	fn: () => {
		const sample = new PNG(
			new Uint8Array(32 * 32 * 4).map((_, i) => (i % 2 ? 255 : 0)),
			32,
			32
		);
		sample.filter.hsv(1 / 3, 1, 1);
		assert(
			compare(
				sample.raw,
				new Uint8Array(32 * 32 * 4).map((_, i) => (Math.floor(i / 2) % 2 ? 255 : 0))
			)
		);
		sample.filter.hsv(1 / 3, 1, 1);
		assert(
			compare(
				sample.raw,
				new Uint8Array(32 * 32 * 4).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0))
			)
		);
		sample.filter.hsv(0, 0, 1);
		assert(sample.raw.every(x => x === 255));
	}
});

Deno.test({
	name: "Contrast Filter",
	fn: () => {
		const sample = new PNG(
			new Uint8Array(32 * 32 * 4).map((_, i) => ((i + 1) % 4 ? random(0, 256, i, 0) : 255)),
			32,
			32
		);
		sample.filter.contrast(100, 128 / 255);
		assert(sample.raw.every(x => x === 255 || x === 0 || x === 128));
		sample.raw = new Uint8Array(32 * 32 * 4).map((_, i) => ((i + 1) % 4 ? random(0, 256, i, 0) : 255));
		sample.filter.contrast(0, 150 / 255);
		assert(sample.raw.filter((_, i) => (i + 1) % 4).every(x => x === 150));
	}
});
