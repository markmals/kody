import path from 'node:path'
import { type Plugin } from 'vite'

/**
 * Points the client and ssr environments at `<outDir>/client` and
 * `<outDir>/ssr`. `remix()` from `@pitlane/vite-plugin-remix` pins both to
 * `dist/`, ignoring `build.outDir`, and plugin config merges in plugin order,
 * so this has to run after it. `@cloudflare/vite-plugin` reads the result,
 * which lets a build land somewhere other than the repo-root `dist/` (the MCP
 * e2e origin builds into a temp dir while a startup check may be building
 * `dist/`).
 */
export function outputDirectory(outDir: string): Plugin {
	return {
		name: 'kody-output-directory',
		config: () => ({
			environments: {
				client: { build: { outDir: path.join(outDir, 'client') } },
				ssr: { build: { outDir: path.join(outDir, 'ssr') } },
			},
		}),
	}
}
