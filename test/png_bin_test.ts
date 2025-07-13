import { Cache, compare } from "@aurellis/helpers";
import { decode } from "../src/binary/decode.ts";
import { assert } from "@std/assert";
import { PNG } from "../src/png.ts";
import { BitDepth, ColorFormat } from "../src/types.ts";

function generateDecodeTest(imageName: string) {
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
	fn: generateDecodeTest("GrayScale1")
});

Deno.test({
	name: "Decode GrayScale 2",
	fn: generateDecodeTest("GrayScale2")
});

Deno.test({
	name: "Decode GrayScale 4",
	fn: generateDecodeTest("GrayScale4")
});

Deno.test({
	name: "Decode GrayScale 8",
	fn: generateDecodeTest("GrayScale8")
});

Deno.test({
	name: "Decode GrayScaleAlpha",
	fn: generateDecodeTest("GrayScaleAlpha8")
});

Deno.test({
	name: "Decode Indexed 1",
	fn: generateDecodeTest("Indexed1")
});

Deno.test({
	name: "Decode Indexed 2",
	fn: generateDecodeTest("Indexed2")
});

Deno.test({
	name: "Decode Indexed 4",
	fn: generateDecodeTest("Indexed4")
});

Deno.test({
	name: "Decode Indexed 8",
	fn: generateDecodeTest("Indexed8")
});

Deno.test({
	name: "Decode RGB 8",
	fn: generateDecodeTest("RGB8")
});

Deno.test({
	name: "Decode RGBA 8",
	fn: generateDecodeTest("RGBA8")
});

function generateEncodeTest(format: ColorFormat, bitDepth: BitDepth) {
	return async () => {
		const im = new PNG();
		const cache = new Cache(`test/output/${format}${bitDepth}.png.json`);
		im.width = cache.read<number>("width");
		im.height = cache.read<number>("height");
		im.raw = new Uint8Array(cache.read<number[]>("RGBA"));
		await im.writeFile(`test/output/${format}${bitDepth}.png`, format, bitDepth);
		const im2 = await PNG.fromFile(`test/output/${format}${bitDepth}.png`);
		assert(compare(im.raw, im2.raw));
		assert(compare(im.width, im2.width));
		assert(compare(im.height, im2.height));
	};
}

Deno.test({
	name: "Encode GrayScale 1",
	fn: generateEncodeTest("GrayScale", 1)
});

Deno.test({
	name: "Encode GrayScale 2",
	fn: generateEncodeTest("GrayScale", 2)
});

Deno.test({
	name: "Encode GrayScale 4",
	fn: generateEncodeTest("GrayScale", 4)
});

Deno.test({
	name: "Encode GrayScale 8",
	fn: generateEncodeTest("GrayScale", 8)
});

Deno.test({
	name: "Encode GrayScaleAlpha",
	fn: generateEncodeTest("GrayScaleAlpha", 8)
});

Deno.test({
	name: "Encode Indexed 1",
	fn: generateEncodeTest("Indexed", 1)
});

Deno.test({
	name: "Encode Indexed 2",
	fn: generateEncodeTest("Indexed", 2)
});

Deno.test({
	name: "Encode Indexed 4",
	fn: generateEncodeTest("Indexed", 4)
});

Deno.test({
	name: "Encode Indexed 8",
	fn: generateEncodeTest("Indexed", 8)
});

Deno.test({
	name: "Encode RGB 8",
	fn: generateEncodeTest("RGB", 8)
});

Deno.test({
	name: "Encode RGBA 8",
	fn: generateEncodeTest("RGBA", 8)
});
