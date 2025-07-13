import { Cache, compare } from "@aurellis/helpers";
import { decode } from "../src/binary/decode.ts";
import { assert } from "@std/assert";
import { PNG } from "../src/png.ts";

function decodeTestGenerator(imageName: string) {
	imageName = /.*\.png$/.test(imageName) ? imageName : imageName + ".png";
	return async () => {
		const comp = new Cache(`test/output/${imageName}.json`);
		const im = await PNG.fromFile(`test/input/${imageName}`);
		assert(compare(comp.read<number>("width"), im.width));
		assert(compare(comp.read<number>("height"), im.height));
		assert(compare(comp.read<number[]>("RGBA"), Array.from(im.raw)));
	};
}

Deno.test({
	name: "Decode GrayScale 1",
	fn: decodeTestGenerator("GrayScale1")
});

Deno.test({
	name: "Decode GrayScale 2",
	fn: decodeTestGenerator("GrayScale2")
});

Deno.test({
	name: "Decode GrayScale 4",
	fn: decodeTestGenerator("GrayScale4")
});

Deno.test({
	name: "Decode GrayScale 8",
	fn: decodeTestGenerator("GrayScale8")
});

Deno.test({
	name: "Decode GrayScaleAlpha",
	fn: decodeTestGenerator("GrayScaleAlpha8")
});

Deno.test({
	name: "Decode Indexed 1",
	fn: decodeTestGenerator("Indexed1")
});

Deno.test({
	name: "Decode Indexed 2",
	fn: decodeTestGenerator("Indexed2")
});

Deno.test({
	name: "Decode Indexed 4",
	fn: decodeTestGenerator("Indexed4")
});

Deno.test({
	name: "Decode Indexed 8",
	fn: decodeTestGenerator("Indexed8")
});

Deno.test({
	name: "Decode RGB 8",
	fn: decodeTestGenerator("RGB8")
});

Deno.test({
	name: "Decode RGBA 8",
	fn: decodeTestGenerator("RGBA8")
});
