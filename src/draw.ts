import type { PNG } from "./png.ts";
import { ArrOp, distance, hsv2rgb, mapRange, midPoint, progressRepeat, rotateVector, rotateVector2D, type Vec2, type Vec3, type Vec4 } from "@aurellis/helpers";
import { makeNoise3D } from "./vendor/noise.ts";

export class PNGDraw {
	/**
	 * This is a utility class that can add shapes, lines, and patterns to an image. It should never be constructed by itself. Always use the `draw` member on a PNG.
	 */
	constructor(public src: PNG) {}
	/**
	 * Fill the image with a specific color.
	 * @param width The resulting width of the image.
	 * @param height The resulting height of the image.
	 * @param color The color [R,G,B] or [R,G,B,A] (0-255).
	 */
	generateBlank(width = this.src.width, height = this.src.height, color = [255, 255, 255, 255]): PNGDraw {
		this.src.raw = new Uint8Array(width * height * 4).map((_v, i) => color[i % 4]);
		this.src.width = width;
		this.src.height = height;
		return this;
	}
	/**
	 * Draws a vector on the PNG.
	 * @param start The start coord [col from left, row from top].
	 * @param end The end coord.
	 * @param color The color [R,G,B] or [R,G,B,A] (0-255).
	 */
	line(start: Vec2, end: Vec2, thickness = 1, color: ArrayLike<number> = [255, 255, 255, 255]): PNGDraw {
		start = start.map(x => Math.floor(x)) as Vec2;
		end = end.map(x => Math.floor(x)) as Vec2;
		thickness--;
		const dx = Math.abs(end[0] - start[0]),
			dy = Math.abs(end[1] - start[1]),
			sx = start[0] < end[0] ? 1 : -1,
			sy = start[1] < end[1] ? 1 : -1;
		let err = dx - dy;

		while (true) {
			for (let i = -thickness; i <= thickness; i++) {
				for (let j = -thickness; j <= thickness; j++) {
					this.src.setPixel(start[0] + i, start[1] + j, color);
				}
			}
			if (start[0] === end[0] && start[1] === end[1]) {
				break;
			}
			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				start[0] += sx;
			}
			if (e2 < dx) {
				err += dx;
				start[1] += sy;
			}
		}
		return this;
	}
	/**
	 * Draw random noise across the image.
	 * @param width The resulting width of the image.
	 * @param height The resulting height of the image.
	 * @param z The z offset.
	 * @param scale The scale of the noise, lower values will spread the noise out.
	 * @param seed The seed for the noise generator.
	 * @param byColor Set this to true to run the noise over the image by each color instead of all color channels consecutively. (Default - false)
	 */
	noisify(width = this.src.width, height = this.src.height, z = 0, scale = 1, seed: number = Math.random(), byColor = false): PNGDraw {
		this.generateBlank(width, height);
		if (byColor) {
			let noise = makeNoise3D(seed * 3276.123);
			for (let i = 0; i < this.src.raw.length; i += 4) {
				this.src.raw[i] = mapRange(noise((i % (this.src.width * 4)) * scale, Math.floor(i / (this.src.width * 4)) * scale, z), [-1, 1], [0, 255], 0);
			}
			noise = makeNoise3D(seed + 1 * 3276.123);
			for (let i = 1; i < this.src.raw.length; i += 4) {
				this.src.raw[i] = mapRange(noise((i % (this.src.width * 4)) * scale, Math.floor(i / (this.src.width * 4)) * scale, z), [-1, 1], [0, 255], 0);
			}
			noise = makeNoise3D(seed + 2 * 3276.123);
			for (let i = 2; i < this.src.raw.length; i += 4) {
				this.src.raw[i] = mapRange(noise((i % (this.src.width * 4)) * scale, Math.floor(i / (this.src.width * 4)) * scale, z), [-1, 1], [0, 255], 0);
			}
		} else {
			const noise = makeNoise3D(seed);
			this.src.function(false, i => mapRange(noise((i % (this.src.width * 4)) * scale, Math.floor(i / (this.src.width * 4)) * scale, z), [-1, 1], [0, 255], 0));
		}
		return this;
	}

	/**
	 * Generate a fractal using the serpinski (idk how to spell it) algorithm.
	 * @param corners The number of corneers of the resulting fractal shape.
	 * @param color The color of the shape.
	 * @param width The resulting width of the image.
	 * @param height The resulting height of the image.
	 * @param fadeWhite Optional, fade more common pixels to white.
	 */
	fractalPolygon(corners = 3, color: Vec4 = [255, 0, 0, 255], width = this.src.width, height = this.src.height, fadeWhite = false): PNGDraw {
		// Create black bg
		this.generateBlank(width, height, [0, 0, 0, 255]);

		// Init shape corners
		const cornerPoints = Array(corners)
			.fill([0, 0])
			.map((_, i) => rotateVector([width / 2, height / 2, 0], [0, height / 2, 0], [0, 0, (i * 360) / corners]).slice(0, 2) as Vec2);

		// Draw
		let currentPoint: Vec2 = [width / 2, height / 2];
		if (fadeWhite) {
			progressRepeat(width * height, () => {
				currentPoint = midPoint(currentPoint, cornerPoints[Math.floor(Math.random() * corners)], true);
				const thisColor = ArrOp.lerp(color, [255, 255, 255, 255], new ArrOp(this.src.getPixel(...currentPoint)).sum / 1020);
				this.src.setPixel(...currentPoint, thisColor);
			});
		} else {
			progressRepeat(width * height, () => {
				currentPoint = midPoint(currentPoint, cornerPoints[Math.floor(Math.random() * corners)], true);
				this.src.setPixel(...currentPoint, color);
			});
		}
		return this;
	}
	/**
	 * Generate a fractal binary tree shape.
	 * @param layers The number of tree layers.
	 * @param angleOffset The offset angle of each layer.
	 * @param lengthFactor The factor by which each layer's length should change.
	 * @param width The resulting width of the image.
	 * @param height The resulting height of the image.
	 * @param initialLength The length (in pixels) of the first layer.
	 * @param baseColor The base color of the tree.
	 * @param outerColor The color of the final layer of the tree.
	 */
	fractalTree(layers = 10, angleOffset = 20, lengthFactor = 0.9, width = this.src.width, height = this.src.height, initialLength = this.src.height * 0.13, baseColor: Vec4 = [255, 0, 0, 255], outerColor: Vec4 = [255, 255, 255, 255]): PNG {
		this.generateBlank(width, height, [0, 0, 0, 255]);
		let ends: Vec3[] = [[this.src.height - 1, Math.floor(this.src.width / 2), 0]];
		for (let i = 0; i < layers; i++) {
			const newEnds: Vec3[] = [];
			const color = ArrOp.lerp(baseColor, outerColor, i / layers);
			ends.forEach(x => {
				const endPoint = rotateVector2D(x.slice(0, 2) as Vec2, [x[0] - initialLength * Math.pow(lengthFactor, i), x[1]], x[2]);
				this.src.draw.line(x.slice(0, 2) as Vec2, endPoint, 1, color);
				newEnds.push([...endPoint, angleOffset + x[2]], [...endPoint, -angleOffset + x[2]]);
			});
			ends = newEnds;
		}
		return this.src;
	}
	/**
	 * Creates a voronoi diagram (color by distance).
	 * @param dims The dimensions of the diagram.
	 * @param pointCount The number of points in the diagram.
	 */
	voronoiDiagram(pointCount = 10, width = this.src.width, height = this.src.height): PNGDraw {
		const maxDist = distance([width, height], [0, 0]);
		this.generateBlank(width, height);
		const points = Array(pointCount)
			.fill(0)
			.map(() => [Math.random() * width, Math.random() * height, hsv2rgb([Math.random(), 1, 1, 1]).map(x => Math.floor(x * 255))].map((x, i) => (i > 1 ? Math.floor(x as number) : x))) as [number, number, Vec4][];
		for (let row = 0; row < width; row++) {
			for (let col = 0; col < height; col++) {
				let shortestDist = distance([row, col], points[0].slice(0, 2) as Vec2);
				let closestPointIndex = 0;
				for (let i = 1; i < points.length; i++) {
					const thisDist = distance([row, col], points[i].slice(0, 2) as Vec2);
					if (thisDist < shortestDist) {
						shortestDist = thisDist;
						closestPointIndex = i;
					}
				}
				this.src.setPixel(
					row,
					col,
					points[closestPointIndex][2].map(x => x * mapRange(shortestDist, [0, maxDist], [1, 0], 0, "easeOutExpo"))
				);
			}
		}
		return this;
	}
}
