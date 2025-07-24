import { PNG } from "@aurellis/png";

const im = new PNG(new Uint8Array([0, 255, 0, 255]), 2, 2);
// This is a crazy condition that checks if the index is in the top left quadrant or bottom right one, and sets it blue.
im.raw = im.raw.map((x, i) => ((i % (im.width * 4) < im.width * 2 && Math.floor(i / (im.width * 4)) < im.height / 2) || (i % (im.width * 4) >= im.width * 2 && Math.floor(i / (im.width * 4)) >= im.height / 2) ? [0, 0, 0, 255][i % 4] : x));
await im.writeFile("test/input/upscale");
