import { describe, expect, it } from 'vitest'
import { pathFor, routeFor } from './route'

// ⚠️ Every case here is run against BOTH bases. Vite serves this app at `/` in
// dev and `/video/` in production, so a route check that only ever sees one of
// them is a check that passes locally and sends every production visitor to the
// editor — or, worse, sends every dev visitor to a page that does not exist.
const BASES = ['/', '/video/']

describe('which page a path asks for', () => {
  it('takes the root as the editor, under either base', () => {
    expect(routeFor('/', '/')).toBe('editor')
    expect(routeFor('/video/', '/video/')).toBe('editor')
  })

  it('finds the more-info page under either base', () => {
    expect(routeFor('/more-info', '/')).toBe('more-info')
    expect(routeFor('/video/more-info', '/video/')).toBe('more-info')
  })

  it('tolerates a trailing slash, so a link written either way lands right', () => {
    for (const base of BASES) {
      expect(routeFor(pathFor('more-info', base) + '/', base)).toBe('more-info')
    }
  })

  it('sends anything it does not recognise to the editor rather than a blank page', () => {
    for (const base of BASES) {
      expect(routeFor(pathFor('editor', base) + 'nonsense', base)).toBe('editor')
      expect(routeFor(pathFor('editor', base) + 'more-info/extra', base)).toBe('editor')
    }
  })

  it('⚠️ does not match a path that merely CONTAINS the segment', () => {
    // The SPA fallback hands this file every unknown path under the base, so a
    // sloppy `includes()` would open the info page on `/video/not-more-info`.
    for (const base of BASES) {
      expect(routeFor(pathFor('editor', base) + 'not-more-info', base)).toBe('editor')
    }
  })

  it('survives a base written without its trailing slash', () => {
    expect(routeFor('/video/more-info', '/video')).toBe('more-info')
    expect(pathFor('more-info', '/video')).toBe('/video/more-info')
  })

  it('round-trips: the path a route names is read back as that route', () => {
    for (const base of BASES) {
      for (const route of ['editor', 'more-info'] as const) {
        expect(routeFor(pathFor(route, base), base)).toBe(route)
      }
    }
  })
})
