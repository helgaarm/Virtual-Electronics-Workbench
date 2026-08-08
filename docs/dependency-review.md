# Dependency security, freshness, and license review

Review date: 2026-08-09. Runtime used: Node.js 26.7.0 and npm 11.19.0.

## Results

- `npm outdated --json` reported every direct dependency current except TypeScript 7.0.2. The project retains TypeScript 6.0.3 because the current `typescript-eslint` 8.66.0 peer range is `>=4.8.4 <6.1.0`; TypeScript 6.0.3 is therefore the newest supported release for this toolchain.
- `npm audit --json` reported zero known vulnerabilities: 0 info, low, moderate, high, or critical findings across the resolved graph at review time.
- `tsx` is a production dependency because `npm start` executes the TypeScript server entry point. A production-only install therefore remains runnable.
- The root package declares MIT and the repository contains the matching MIT license text.

## License inventory

The installed production dependency graph contains 121 packages declaring MIT, 7 ISC, 5 Apache-2.0, and 2 BSD-3-Clause, plus `webgl-constants@1.1.1`, which omits the `license` field from package metadata but includes an MIT `LICENSE` and identifies MIT in its README. No GPL, LGPL, AGPL, proprietary, or unlicensed installed production dependency was found.

The full development graph also contains MPL-2.0 build tooling (`lightningcss` and its platform binary) and CC-BY-4.0 browser-compatibility data (`caniuse-lite`). These tools/data do not impose a reciprocal license on this application's original source, but their notices and license terms still apply if redistributed.

## Distribution guidance

MIT is compatible with the current dependency set and fits a permissive open-source application. Keep the repository `LICENSE` and the generated `THIRD_PARTY_LICENSES.md` with distributions. Refresh that inventory with `npm run licenses:generate`, and re-run `npm outdated` plus `npm audit` before each release because installed packages, registry metadata, and advisories change.
