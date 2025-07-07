# PNG

This package contains several utilities for reading, writing, and modifying PNG images.

To install the package, follow the respective guide for importing packages from JSR with your environment of choice.

This package conatins many helpful items, so it is encouraged to explore the source to get a full understanding of some of the options available.

PNG is made to work with [Deno](deno.com), and has not been tested on other runtimes.
To import PNG into your project, use the JSR import:

```ts
import { PNG } from "jsr:@aurellis/png";

const im = new PNG();
```

Alternatively, you can import the current commit using the GitHub URL (not recommended).

```ts
import { PNG } from "https://raw.githubusercontent.com/Aureliona1/PNG/refs/heads/main/mod.ts";

const im = new PNG();
```
