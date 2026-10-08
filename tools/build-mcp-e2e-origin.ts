import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { resolveLocalBinary } from './node-runtime.ts'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * Builds the origin for the MCP e2e suite with the same Vite pipeline
 * `npm run build` uses, in the `test` Cloudflare environment, into
 * `outputRoot`. The suite then runs `<outputRoot>/ssr/wrangler.json`, the
 * bundle shape production deploys, instead of letting Wrangler bundle the
 * source itself.
 */
export async function buildMcpE2eOrigin(outputRoot: string) {
	await execFileAsync(resolveLocalBinary('vite'), ['build'], {
		cwd: repoRoot,
		env: {
			...process.env,
			CLOUDFLARE_ENV: 'test',
			KODY_VITE_OUTDIR: outputRoot,
		},
		maxBuffer: 20 * 1024 * 1024,
	})
	// The Cloudflare Vite plugin leaves a repo-root deploy redirect pointing
	// at this throwaway build; sibling Wrangler commands would follow it.
	await rm(path.join(repoRoot, '.wrangler', 'deploy', 'config.json'), {
		force: true,
	})
	return { wranglerConfigPath: path.join(outputRoot, 'ssr', 'wrangler.json') }
}
