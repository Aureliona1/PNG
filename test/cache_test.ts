import { clog, compare, pathCanBeAccessed } from "@aurellis/helpers";
import { PNG } from "@aurellis/png";
import { TIC } from "../src/binary/tic.ts";
import { PNGCache } from "../src/cache.ts";
import { TicDictEntry } from "../src/types.ts";
import { assert } from "../src/vendor/assert.ts";

const px = [255, 0, 0, 254, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];

/**
 * Generate a sample TIC file containing one 2x2, 8-bit, RGBA image.
 * The image is called "test".
 */
function generateSampleTIC(): Uint8Array {
	const dataBuffer = new ArrayBuffer(38);
	const v = new DataView(dataBuffer);
	v.setUint32(0, 18); // dict length
	v.setUint32(4, 0); // byte start
	v.setUint32(8, 2); // width
	v.setUint32(12, 2); // height
	v.setUint8(16, 240); // RGBA 8
	v.setUint8(17, 4); // name length
	v.setUint8(18, "t".charCodeAt(0));
	v.setUint8(19, "e".charCodeAt(0));
	v.setUint8(20, "s".charCodeAt(0));
	v.setUint8(21, "t".charCodeAt(0));
	const data = new Uint8Array(dataBuffer);
	data.set(px, 22);
	return data;
}

function assertIsSampleTIC(tic: TIC) {
	assert(tic.dictLength === 18);
	assert(compare(tic.dict, new Map<string, TicDictEntry>().set("test", { byteOffset: 22, width: 2, height: 2, colorFormat: "RGBA", bitDepth: 8, nameLength: 4, name: "test" })));
	assert(compare(tic.dataChunk, new Uint8Array(px)));
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
		c.validate();
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
		const im = new PNG(new Uint8Array(px), 2, 2);
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
		assert(dec.height === 2);
		assert(compare(dec.raw, new Uint8Array(px)));
		assert(dec.width === 2);
	}
});

Deno.test({
	name: "TIC Encode",
	fn: () => {
		const dict = new Map<string, TicDictEntry>([["test", { name: "test", nameLength: 4, width: 2, height: 2, byteOffset: 0, colorFormat: "RGBA", bitDepth: 8 }]]);
		const c = new TIC(18, dict, new Uint8Array(px));
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
		assert(dec.height === 2);
		assert(dec.width === 2);
		assert(compare(dec.raw, new Uint8Array(px)));
		Deno.removeSync(cacheFileName);
	}
});

Deno.test({
	name: "Cache Write",
	fn: () => {
		const c = new PNGCache(cacheFileName);
		const im = new PNG(new Uint8Array(px), 2, 2);
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
