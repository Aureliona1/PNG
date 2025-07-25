import { clog, compare } from "@aurellis/helpers";
import { PNG } from "../src/png.ts";
import { assert } from "../src/vendor/assert.ts";

function compareIms(im1: PNG, im2: PNG) {
	assert(compare(im1.raw, im2.raw));
	assert(compare(im1.width, im2.width));
	assert(compare(im1.height, im2.height));
}

Deno.test({
	name: "Scale Up PX",
	fn: async () => {
		let small = (await PNG.fromFile("test/input/upscale")).scale("px", [32, 32]);
		const large = await PNG.fromFile("test/input/downscale");
		compareIms(small, large);
	}
});

Deno.test({
	name: "Scale Up Factor",
	fn: async () => {
		let small = (await PNG.fromFile("test/input/upscale")).scale("factor", 16);
		const large = await PNG.fromFile("test/input/downscale");
		compareIms(small, large);
	}
});

Deno.test({
	name: "Scale Down Px",
	fn: async () => {
		let large = (await PNG.fromFile("test/input/downscale")).scale("px", [2, 2]);
		const small = await PNG.fromFile("test/input/upscale");
		compareIms(small, large);
	}
});

Deno.test({
	name: "Scale Down Factor",
	fn: async () => {
		let small = (await PNG.fromFile("test/input/downscale")).scale("factor", 1 / 16);
		const large = await PNG.fromFile("test/input/upscale");
		compareIms(small, large);
	}
});
