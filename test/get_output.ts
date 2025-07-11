import { PNG } from "@aurellis/png";
import { decode } from "../src/binary/decode.ts";
import { Cache, clog, ensureDir } from "@aurellis/helpers";
import { arrayBuffer } from "node:stream/consumers";

function downloadSamples() {
	ensureDir("input");
	const BASE_URL = "https://raw.githubusercontent.com/pnggroup/libpng/refs/heads/libpng16/contrib/pngsuite/";

	const IM_URLS: Record<string, Record<string, string>> = {
		GrayScale: {
			"1": BASE_URL + "basn0g01.png",
			"2": BASE_URL + "basn0g02.png",
			"4": BASE_URL + "basn0g04.png",
			"8": BASE_URL + "basn0g08.png"
		},
		RGB: {
			"8": BASE_URL + "basn2c08.png"
		},
		Indexed: {
			"1": BASE_URL + "basn3p01.png",
			"2": BASE_URL + "basn3p02.png",
			"4": BASE_URL + "basn3p04.png",
			"8": BASE_URL + "basn3p08.png"
		},
		GrayScaleAlpha: {
			"8": BASE_URL + "basn4a08.png"
		},
		RGBA: {
			"8": BASE_URL + "basn6a08.png"
		}
	};

	Object.keys(IM_URLS).forEach(f => {
		Object.keys(IM_URLS[f]).forEach(k => {
			(async () => {
				const res = await fetch(IM_URLS[f][k]);
				const bytes = await res.bytes();
				await Deno.writeFile(`input/${f}${k}.png`, bytes);
			})();
		});
	});
}

const dir = Array.from(Deno.readDirSync("input"));
for (let i = 0; i < dir.length; i++) {
	const inName = "input/" + dir[i].name;
	const outName = "output/" + dir[i].name;
	clog(`Working on ${inName}...`);
	const dec = await decode(Deno.readFileSync(inName));
	const im = await PNG.fromFile(inName);
	await im.writeFile(outName);
}
