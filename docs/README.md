# Study Sprint

Study Sprint is a static, browser-only study tool. Paste Markdown or open a `.md` file to make flashcards or timed coding fill-in-the-blank tests. Notes stay on the device; the app does not upload them or execute pasted code.

> **AI note:** This initial version was vibecoded with AI assistance.

## Use it

1. Paste notes, choose **Open .md**, or choose **Add note photos** to recognize up to five JPEG, PNG, or WebP images (10 MB maximum each).
2. Review and edit the recognized text in the notes box. OCR runs in your browser; the first scan downloads the bundled English model (about 11 MB), which the browser can cache for later.
3. Leave **Auto-detect** selected, or choose a study mode yourself.
4. Choose **Build my study session**.
5. For flashcards, reveal each answer and choose whether to continue or practice it again. Coding practice has a 10-minute timer; each test checks the missing word against the source notes.

The local OCR works best with sharply focused, well-lit photos and clearly printed or block handwriting. Accuracy varies—cursive and unusual page layouts may need more correction—so check the extracted text before starting a quiz. Images are resized in the browser for processing and are never uploaded.

Flashcards are generated from `Q:` / `A:` pairs, or from headings and the paragraphs or bullet points beneath them. For the clearest cards, write a specific heading and one or two concise facts under it. A heading-free note can also be studied as key-idea cards.

Auto-detect switches to coding practice for an explicit programming assignment or a code block marked with a blank (`___`), a `TODO` / `fill in` comment, or an answer placeholder. Ordinary code examples stay in flashcard mode. You can always select a mode manually.

The OCR runtime, English model, and their license notices are included in the production site under `ocr/`.

### Authoring coding tests

Put a code example in a fenced Markdown block. A `{{answer:...}}` placeholder sets the exact expected answer; otherwise, the app picks a non-keyword identifier from the code block.

````markdown
## Add two values
Complete the addition expression.

```js
const total = {{answer:first}} + second;
```
````

In the example, the test asks for `first`. The answer check compares text and does not compile or run code. A code block needs at least one identifier (or an answer placeholder) to make a test.

## Develop locally

Requires Node.js 22.13+ and npm.

```sh
npm install
npm run dev
```

Run the checks and production build with:

```sh
npm test
npm run build
```

The production site is written to `dist/`.

## Publish on GitHub Pages

1. Push this project to GitHub.
2. In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.
3. Push to the `main` branch. The included `.github/workflows/pages.yml` runs tests, builds the site, and publishes `dist/`.

Vite uses relative asset paths, so the built site works both at a user-site root and at a project-site subpath.
