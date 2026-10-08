import { revalidate } from '@pitlane/vite-plugin-remix/hmr'
import { run } from 'remix/component'
import { resolveClientFrame } from '#client/frame-resolve.ts'
import { preloadClientRouteModules } from '#client/lazy-route.tsx'
import {
	captureClientException,
	initSentryClient,
} from '#client/sentry-client.ts'
import { ensureConstructableStylesheets } from './ensure-constructable-stylesheets.ts'
import { ensureCryptoRandomUUID } from './ensure-crypto-random-uuid.ts'
import { ensureObjectHasOwn } from './ensure-object-has-own.ts'
import { ensurePromiseWithResolvers } from './ensure-promise-with-resolvers.ts'

// Remix frame ids call crypto.randomUUID(); some in-app browsers omit it.
ensureCryptoRandomUUID()
// Remix StyleManager uses `new CSSStyleSheet()` + adoptedStyleSheets; Safari
// / iOS before 16.4 throw TypeError: Illegal constructor (KODY-CLOUDFLARE-63).
ensureConstructableStylesheets()
// Remix frame copyOwnRmxEntries calls Object.hasOwn; Whale 4.34 and similar
// Chromium forks omit it (KODY-7R).
ensureObjectHasOwn()
// Remix frame/reconcile use Promise.withResolvers. Mid-tier browsers omit it;
// this is not Safari 11 support (KODY-7P remains unsupported).
ensurePromiseWithResolvers()
initSentryClient(document)

function requireClientExport(exportName: string, value: unknown) {
	if (typeof value !== 'function') {
		throw new Error(`Unknown client export: ${exportName}`)
	}
	return value
}

const bootChunkReloadFlag = 'kody:boot-chunk-reload'

async function boot() {
	// `run()` starts hydration immediately; `app.ready()` only waits for it to
	// finish. Warm the current route chunk first so LazyRoute sees a hot cache
	// during hydration and matches SSR DOM.
	try {
		await preloadClientRouteModules(
			`${window.location.pathname}${window.location.search}`,
		)
		try {
			sessionStorage.removeItem(bootChunkReloadFlag)
		} catch {
			// Storage may be unavailable (private mode); the flag is best-effort.
		}
	} catch (error: unknown) {
		console.error('Client route preload failed:', error)
		// A stale cached entry referencing rotated chunk hashes cannot hydrate
		// this route. One forced reload fetches a fresh document (HTML is
		// no-store) whose entry href points at the current build; the flag
		// prevents a reload loop when the chunk is genuinely missing.
		try {
			if (!sessionStorage.getItem(bootChunkReloadFlag)) {
				sessionStorage.setItem(bootChunkReloadFlag, '1')
				window.location.reload()
				return
			}
		} catch {
			// Storage unavailable: fall through and hydrate anyway.
		}
		// Still hydrate: LazyRoute will retry the import. A hard chunk miss may
		// leave a brief empty route, which is better than never booting.
	}

	const app = run({
		async loadModule(moduleUrl, exportName) {
			const mod = (await import(/* @vite-ignore */ moduleUrl)) as Record<
				string,
				unknown
			>
			return requireClientExport(exportName, mod[exportName])
		},
		async resolveFrame(src, options) {
			return resolveClientFrame(src, options)
		},
	})

	if (import.meta.hot) {
		import.meta.hot.on('server:update', () => revalidate(app))
	}

	app.addEventListener('error', (event) => {
		console.error('Client hydration error:', event.error)
		captureClientException(event.error)
	})

	await app.ready()
	// Boot preloads the route chunk before `run()`, so SSR headings and
	// buttons are visible while click handlers are still unbound. Tests wait
	// on this marker instead of racing that gap.
	document.documentElement.dataset.hydrated = 'true'
}

void boot().catch((error: unknown) => {
	console.error('Client boot failed:', error)
	captureClientException(error)
})
