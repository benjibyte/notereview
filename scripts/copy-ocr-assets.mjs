import { cp, mkdir, writeFile } from "node:fs/promises";

const publicOcr = "public/ocr";
const coreDirectory = `${publicOcr}/core`;
const languageDirectory = `${publicOcr}/lang`;

await Promise.all([
  mkdir(coreDirectory, { recursive: true }),
  mkdir(languageDirectory, { recursive: true }),
]);

await Promise.all([
  cp("node_modules/tesseract.js/dist/worker.min.js", `${publicOcr}/worker.min.js`),
  cp(
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    `${coreDirectory}/tesseract-core-lstm.wasm.js`,
  ),
  cp(
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
    `${coreDirectory}/tesseract-core-lstm.wasm`,
  ),
  cp(
    "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
    `${languageDirectory}/eng.traineddata.gz`,
  ),
  cp(
    "node_modules/tesseract.js-core/LICENSE",
    `${publicOcr}/LICENSE-APACHE-2.0.txt`,
  ),
  cp(
    "node_modules/@tesseract.js-data/eng/README.md",
    `${publicOcr}/ENGLISH-DATA-NOTICE.md`,
  ),
]);

await writeFile(
  `${publicOcr}/THIRD-PARTY-NOTICES.txt`,
  [
    "Tesseract.js and tesseract.js-core are distributed under the Apache License, Version 2.0.",
    "The English trained data from @tesseract.js-data/eng is distributed under the MIT License.",
    "See LICENSE-APACHE-2.0.txt and ENGLISH-DATA-NOTICE.md for the corresponding notices.",
    "",
  ].join("\n"),
);
