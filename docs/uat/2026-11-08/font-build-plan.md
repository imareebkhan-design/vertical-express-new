# Remove the external font build dependency

PR #46 CI run 42452164535 passed 1,483 backend tests, then failed in Turbopack's
Google font URL handling. Preserve Plus Jakarta Sans and existing CSS variables,
but bundle the official variable font under its SIL Open Font License.

- NEW `app/fonts/PlusJakartaSans.ttf`, `app/fonts/OFL.txt`: upstream Google Fonts
  font and redistribution licence.
- MODIFY `app/layout.tsx`: use `next/font/local`, the same `--font-jakarta`
  variable, normal style, weights 300–800 and swap display.
- NEW `app/fonts/README.md`: source and checksum.

Validate with a full production build against disposable local Postgres using
CI public-config placeholders, typecheck, lint and existing design/asset checks.
No deployment, schema, business rules or payment configuration changes. Revert
this PR to restore the previous font loading path.

## Results

- Full `npm run build` passed with Turbopack, using the existing disposable local
  UAT database and CI Firebase placeholders. No build/runtime guard was disabled.
- Lint, design-system and asset checks passed. The build's type validation passed.
- Font SHA-256 and upstream provenance are recorded in `app/fonts/README.md`.
- No remote data changes, deployment or live payment occurred.
- Browser control is unavailable in this continuation; a visual comparison is
  still required in review. The font file itself is the unchanged official font.
