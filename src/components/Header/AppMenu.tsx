import { AdvancedMenu, MENU } from '@unisim/sdk'
// Generated — `npm run credits` after any dependency change. Never edit it by
// hand: it is read off the installed tree, so a hand-kept list drifts from the
// lockfile the first time anyone upgrades anything, and a credits list naming a
// package we removed is worse than no list at all.
import credits from '../../generated/credits.json'
import { hrefFor, navigate } from '../../lib/route'
import { useEditorStore } from '../../stores/editorStore'
import { useThemeStore } from '../../stores/themeStore'

// The per-app rows that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. The SDK renders them inside
// the merged profile pill, so the bar carries one dropdown on the right rather
// than an app menu on the left and an avatar on the right.
//
// Styling is inline rather than Tailwind to match the SDK dropdown's own rows
// (the same 8px/14px rhythm and 13px label the profile and language rows use) —
// these render inside SDK chrome, not ours.
//
// ⚠️ They also have to follow the SDK's THEME. The bar is given the app's theme
// (Landing), so in dark mode these rows sit on the SDK's dark surface — and
// until 2026-09-14 they kept their light-mode greys there, and the Advanced
// section below was never told the theme at all, so it drew as a pale strip in
// the middle of a dark menu. Light keeps its original colours exactly; dark
// takes the SDK's own dark menu palette.
//
// There is no Appearance section here any more. Since SDK 0.143.0 the colour
// scheme is a Global preference, and this app's override of it (Follow global
// / Light / Dark / System) is the Colour scheme row in the SDK's App
// preferences — App.tsx hands the bar `themeStore` for that.

type Colours = { tintBg: string; tintFg: string; rest: string; label: string; disabled: string }

function coloursFor(theme: 'light' | 'dark'): Colours {
  if (theme === 'dark') {
    const p = MENU.dark
    return { tintBg: p.accentBg, tintFg: p.accentText, rest: p.body, label: p.faint, disabled: p.faint }
  }
  return { tintBg: '#fff7ed', tintFg: '#c2410c', rest: '#374151', label: '#9ca3af', disabled: '#9ca3af' }
}

export default function AppMenu() {
  const reset = useEditorStore((s) => s.reset)
  const status = useEditorStore((s) => s.status)
  const theme = useThemeStore((s) => s.effective)
  const c = coloursFor(theme)

  return (
    <>
      <MenuLabel c={c}>This edit</MenuLabel>
      <MenuRow
        c={c}
        glyph="🗑️"
        label="Start again"
        onClick={reset}
        disabled={status === 'empty' || status === 'exporting'}
      />
      <MenuLabel c={c}>About</MenuLabel>
      {/* ⚠️ A LINK, not a button. This is the only way to the spec sheet now
          that it is off the editor page, so it has to behave like a way to a
          page: middle-click opens a tab, "copy link address" copies something
          that works, and a crawler can follow it. `navigate()` intercepts the
          ordinary click so the timeline survives the trip — see `lib/route.ts`. */}
      <MenuLink
        c={c}
        glyph="ℹ️"
        label="More info"
        href={hrefFor('more-info')}
        onNavigate={() => navigate('more-info')}
      />

      {/* Advanced — the SDK's own category, so every app in the suite has one in
          the same place, and whatever goes in it next is one change rather than
          nineteen. "About this app" is always its last row. */}
      <AdvancedMenu
        theme={theme}
        about={{
          repo:    'https://github.com/universal-simulation-ltd/Universal_Video',
          proof:   'https://github.com/universal-simulation-ltd/Universal_Video/blob/main/PRIVACY.md',
          subject: 'Your video',
          version: __APP_VERSION__,
          credits,
          noticesHref: 'https://github.com/universal-simulation-ltd/Universal_Video/blob/main/THIRD-PARTY-NOTICES.md',
        }}
      />
    </>
  )
}

function MenuLabel({ c, children }: { c: Colours; children: string }) {
  return (
    <div
      style={{
        padding: '8px 14px 4px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: c.label,
      }}
    >
      {children}
    </div>
  )
}

/**
 * A menu row that is genuinely a link. Same face as `MenuRow`; different
 * element, because the difference matters to the browser and to a crawler.
 */
function MenuLink({
  c,
  glyph,
  label,
  href,
  onNavigate,
}: {
  c: Colours
  glyph: string
  label: string
  href: string
  onNavigate: () => void
}) {
  return (
    <a
      role="menuitem"
      href={href}
      onClick={(e) => {
        // A modified click is the user asking the BROWSER for something —
        // a new tab, a new window. Leave those alone.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        onNavigate()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 14px',
        fontSize: 13,
        fontFamily: 'inherit',
        textAlign: 'left',
        textDecoration: 'none',
        border: 0,
        background: 'transparent',
        color: c.rest,
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = c.tintBg
        e.currentTarget.style.color = c.tintFg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = c.rest
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
    </a>
  )
}

function MenuRow({
  c,
  glyph,
  label,
  onClick,
  selected = false,
  disabled = false,
}: {
  c: Colours
  glyph: string
  label: string
  onClick: () => void
  selected?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 14px',
        fontSize: 13,
        fontFamily: 'inherit',
        textAlign: 'left',
        border: 0,
        background: selected ? c.tintBg : 'transparent',
        color: disabled ? c.disabled : selected ? c.tintFg : c.rest,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = c.tintBg
        e.currentTarget.style.color = c.tintFg
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        e.currentTarget.style.background = selected ? c.tintBg : 'transparent'
        e.currentTarget.style.color = selected ? c.tintFg : c.rest
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
      {selected && <span aria-hidden style={{ color: c.tintFg }}>✓</span>}
    </button>
  )
}
