import { Cache, clog, compare, pathCanBeAccessed } from "@aurellis/helpers";
import { PNG } from "@aurellis/png";
import { TIC } from "../src/binary/tic.ts";
import { PNGCache } from "../src/cache.ts";
import { TicDictEntry } from "../src/types.ts";
import { assert } from "../src/vendor/assert.ts";

const sc = new Cache("test/output/RGBA8.png.json");
const sampleImage = {
	width: sc.read<number>("width"),
	height: sc.read<number>("height"),
	raw: sc.read<number[]>("RGBA")
};

/**
 * Generate a sample TIC file containing one 2x2, 8-bit, RGBA image.
 * The image is called "test".
 */
function generateSampleTIC(): Uint8Array {
	const dataBuffer = new ArrayBuffer(22 + sampleImage.raw.length);
	const v = new DataView(dataBuffer);
	v.setUint32(0, 18); // dict length
	v.setUint32(4, 0); // byte start
	v.setUint32(8, sampleImage.width); // width
	v.setUint32(12, sampleImage.height); // height
	v.setUint8(16, 240); // RGBA 8
	v.setUint8(17, 4); // name length
	v.setUint8(18, "t".charCodeAt(0));
	v.setUint8(19, "e".charCodeAt(0));
	v.setUint8(20, "s".charCodeAt(0));
	v.setUint8(21, "t".charCodeAt(0));
	const data = new Uint8Array(dataBuffer);
	data.set(sampleImage.raw, 22);
	return data;
}

function assertIsSampleTIC(tic: TIC) {
	assert(tic.dictLength === 18);
	const compareMap = new Map<string, TicDictEntry>([["test", { byteOffset: 0, width: sampleImage.width, height: sampleImage.height, colorFormat: "RGBA", bitDepth: 8, nameLength: 4, name: "test" }]]);
	assert(compare(tic.dict, compareMap));
	assert(compare(tic.dataChunk, new Uint8Array(sampleImage.raw)));
}

function assertIsEmptyTIC(tic: TIC) {
	assert(tic.dictLength === 0);
	assert(tic.dataChunk.length === 0);
	assert(tic.dict.size === 0);
}

Deno.test({
	name: "TIC Decode",
	fn: () => {
		const raw = generateSampleTIC();
		let c = TIC.from(raw);
		assertIsSampleTIC(c);
		c = TIC.from(new Uint8Array());
		assertIsEmptyTIC(c);
	}
});

Deno.test({
	name: "TIC Validate",
	fn: () => {
		// Invalid TIC
		const raw = generateSampleTIC();
		let c = TIC.from(raw.subarray(0, 37));
		clog("There should be a warning from TIC below this line...", "Log", "TIC Validate Test");
		c.validate();
		clog("There should be a warning from TIC above this line...", "Log", "TIC Validate Test");
		assertIsEmptyTIC(c);

		// Already valid TIC
		c = TIC.from(raw);
		c.validate();
		assertIsSampleTIC(c);
	}
});

Deno.test({
	name: "TIC Remove",
	fn: () => {
		const c = TIC.from(generateSampleTIC());
		c.removeEntry("test");
		assertIsEmptyTIC(c);
	}
});

Deno.test({
	name: "TIC Write",
	fn: () => {
		const c = new TIC();
		assertIsEmptyTIC(c);
		const im = new PNG(new Uint8Array(sampleImage.raw), sampleImage.width, sampleImage.height);
		c.writeEntry("test", im);
		assertIsSampleTIC(c);
	}
});

Deno.test({
	name: "TIC Read",
	fn: () => {
		const c = TIC.from(generateSampleTIC());
		const dec = c.readEntry("test");
		assert(dec.bitDepth === 8);
		assert(dec.colorFormat === "RGBA");
		assert(dec.height === sampleImage.height);
		assert(compare(dec.raw, new Uint8Array(sampleImage.raw)));
		assert(dec.width === sampleImage.width);
	}
});

Deno.test({
	name: "TIC Encode",
	fn: () => {
		const dict = new Map<string, TicDictEntry>([["test", { name: "test", nameLength: 4, width: sampleImage.width, height: sampleImage.height, byteOffset: 0, colorFormat: "RGBA", bitDepth: 8 }]]);
		const c = new TIC(18, dict, new Uint8Array(sampleImage.raw));
		assert(compare(generateSampleTIC(), c.encode()));
	}
});

// Wrapper functions

const cacheFileName = "test/input/cache.tic";

Deno.test({
	name: "Cache Init + Entries",
	fn: () => {
		// Read sucess
		Deno.writeFileSync(cacheFileName, generateSampleTIC());
		let c = new PNGCache(cacheFileName);
		assert(compare(c.entries, ["test"]));
		Deno.removeSync(cacheFileName);
		// Read failure
		c = new PNGCache(cacheFileName);
		assert(c.entries.length === 0);
	}
});

Deno.test({
	name: "Cache Read",
	fn: () => {
		Deno.writeFileSync(cacheFileName, generateSampleTIC());
		const c = new PNGCache(cacheFileName);
		const dec = c.read("test");
		assert(dec.bitDepth === 8);
		assert(dec.colorFormat === "RGBA");
		assert(dec.height === sampleImage.height);
		assert(dec.width === sampleImage.width);
		assert(compare(dec.raw, new Uint8Array(sampleImage.raw)));
		Deno.removeSync(cacheFileName);
	}
});

Deno.test({
	name: "Cache Write",
	fn: () => {
		const c = new PNGCache(cacheFileName);
		const im = new PNG(new Uint8Array(sampleImage.raw), sampleImage.width, sampleImage.height);
		c.write("test", im);
		let raw = Deno.readFileSync(cacheFileName);
		assert(compare(raw, generateSampleTIC()));
		c.write("test");
		raw = Deno.readFileSync(cacheFileName);
		assert(compare(raw, new Uint8Array([0, 0, 0, 0])));
		Deno.removeSync(cacheFileName);
	}
});

Deno.test({
	name: "Cache Clear",
	fn: () => {
		Deno.writeFileSync(cacheFileName, generateSampleTIC());
		const c = new PNGCache(cacheFileName);
		c.clear();
		assert(!pathCanBeAccessed(cacheFileName));
		assert(!c.entries.length);
	}
});
