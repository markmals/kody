import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type TestProject } from 'vitest/node'
import { buildMcpE2eOrigin } from './build-mcp-e2e-origin.ts'

/**
 * Vitest global setup: builds the origin once per run so each MCP e2e file
 * boots the built worker rather than paying for a build of its own. The
 * config path reaches the harness through `inject` (see mcp-test-support.ts).
 */
export default async function setup(project: TestProject) {
	const outputRoot = await mkdtemp(path.join(tmpdir(), 'kody-mcp-e2e-origin-'))
	const build = await buildMcpE2eOrigin(outputRoot)
	project.provide('mcpE2eOriginWranglerConfigPath', build.wranglerConfigPath)
	return async () => {
		await rm(outputRoot, { recursive: true, force: true })
	}
}
