import { createAssetResolver } from '@pitlane/assets'
import manifest from '@pitlane/assets/manifest'
import { type EntryComponent } from 'remix/component'
import { type RenderToStreamOptions } from 'remix/component/server'
import { clientRouteAreaNameForPath } from '#client/lazy-route.tsx'

/**
 * Vite replaces `@pitlane/assets/manifest` with the manifest of the current
 * dev server or build, and rewrites `clientEntry(import.meta.url, …)` islands
 * to the portable `file:` keys the resolver reads. Vitest runs the SSR code
 * without that build step: it keeps the published placeholder manifest, no
 * browser ever hydrates its HTML, and Remix resolves islands by their raw
 * entry id instead.
 */
const assets =
	manifest.mode === 'unavailable' ? null : createAssetResolver(manifest)

export type DocumentScripts = {
	/** The browser entry's script URL. */
	href: string
	/** `modulepreload` hrefs for the entry's chunks and the current lazy route area. */
	preloads: Array<string>
}

export type ClientAssets = {
	scripts: DocumentScripts
	/**
	 * `renderToStream`'s island resolver: the lookup `render({ assets })` from
	 * `remix/middleware/render` performs, minus the preloads the document
	 * already emits, so Remix hoists only what an island adds.
	 */
	resolveClientEntry: NonNullable<RenderToStreamOptions['resolveClientEntry']>
}

/**
 * The browser entry plus preload hints for the lazy route area serving
 * `pathname`, so hydration does not wait on a chunk waterfall. Preloads are
 * empty under `vite dev`, where no chunk graph exists. Null outside a Vite
 * graph.
 */
export async function resolveClientAssets(
	pathname: string,
): Promise<ClientAssets | null> {
	if (!assets) return null
	const areaName = clientRouteAreaNameForPath(pathname)
	const [entry, preloads] = await Promise.all([
		assets.getScriptEntry('packages/worker/client/entry.tsx'),
		assets.getPreloads([
			'packages/worker/client/entry.tsx',
			...(areaName ? [`packages/worker/client/routes/${areaName}.ts`] : []),
		]),
	])
	const documentPreloads = new Set(preloads)
	return {
		scripts: { href: entry.href, preloads },
		async resolveClientEntry(entryId: string, component: EntryComponent) {
			const island = await assets.getScriptEntry(entryId)
			const hashIndex = entryId.lastIndexOf('#')
			return {
				href: island.href,
				exportName:
					(hashIndex === -1 ? '' : entryId.slice(hashIndex + 1)) ||
					component.name,
				preloads: island.preloads.filter((href) => !documentPreloads.has(href)),
			}
		},
	}
}
