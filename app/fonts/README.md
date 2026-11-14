# Plus Jakarta Sans

Official normal variable font from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/plusjakartasans), retrieved 8 November 2026.

Upstream file: `ofl/plusjakartasans/PlusJakartaSans[wght].ttf`.
Local filename: `PlusJakartaSans.ttf` (font contents unchanged).
SHA-256: `89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8`.

Redistributed under the SIL Open Font License 1.1; see `OFL.txt` for the complete
copyright and licence notice. Keep it with the font. `app/layout.tsx` uses the
300–800 normal weight range and the existing `--font-jakarta` CSS variable.

Bundling the font avoids downloading and parsing Google Fonts URLs during
production builds. Next.js serves the generated font asset from the application.
