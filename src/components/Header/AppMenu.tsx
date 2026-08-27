import { hrefFor, navigate } from '../../lib/route'
import { useEditorStore } from '../../stores/editorStore'
import { useThemeStore, type ThemePref } from '../../stores/themeStore'

// The per-app rows that slot into <UniversalAppsNavBar />'s `actions` prop —
// ROWS ONLY, no trigger and no panel of its own. The SDK renders them inside
// the merged profile pill, so the bar carries one dropdown on the right rather
// than an app menu on the left and an avatar on the right.
//
// Styling is inline rather than Tailwind to match the SDK dropdown's own rows
// (the same 8px/14px rhythm and 13px label the profile and language rows use) —
// these render inside SDK chrome, not ours.

const TINT = { bg: '#fff7ed', fg: '#c2410c' }
const REST_COLOR = '#374151'

const THEMES: { pref: ThemePref; label: string; glyph: string }[] = [
  { pref: 'light', label: 'Light', glyph: '☀️' },
  { pref: 'dark', label: 'Dark', glyph: '🌙' },
  // 'system' is offered but is deliberately NOT the default — see themeStore.
  { pref: 'system', label: 'Match my device', glyph: '🖥️' },
]

export default function AppMenu() {
  const reset = useEditorStore((s) => s.reset)
  const status = useEditorStore((s) => s.status)
  const pref = useThemeStore((s) => s.pref)
  const setPref = useThemeStore((s) => s.setPref)

  return (
    <>
      <MenuLabel>This edit</MenuLabel>
      <MenuRow
        glyph="🗑️"
        label="Start again"
        onClick={reset}
        disabled={status === 'empty' || status === 'exporting'}
      />
      <MenuLabel>Appearance</MenuLabel>
      {THEMES.map((t) => (
        <MenuRow
          key={t.pref}
          glyph={t.glyph}
          label={t.label}
          selected={pref === t.pref}
          onClick={() => setPref(t.pref)}
        />
      ))}
      <MenuLabel>About</MenuLabel>
      {/* ⚠️ A LINK, not a button. This is the only way to the spec sheet now
          that it is off the editor page, so it has to behave like a way to a
          page: middle-click opens a tab, "copy link address" copies something
          that works, and a crawler can follow it. `navigate()` intercepts the
          ordinary click so the timeline survives the trip — see `lib/route.ts`. */}
      <MenuLink
        glyph="ℹ️"
        label="More info"
        href={hrefFor('more-info')}
        onNavigate={() => navigate('more-info')}
      />
    </>
  )
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        padding: '8px 14px 4px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#9ca3af',
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
  glyph,
  label,
  href,
  onNavigate,
}: {
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
        color: REST_COLOR,
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = TINT.bg
        e.currentTarget.style.color = TINT.fg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = REST_COLOR
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
    </a>
  )
}

function MenuRow({
  glyph,
  label,
  onClick,
  selected = false,
  disabled = false,
}: {
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
        background: selected ? TINT.bg : 'transparent',
        color: disabled ? '#9ca3af' : selected ? TINT.fg : REST_COLOR,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = TINT.bg
        e.currentTarget.style.color = TINT.fg
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        e.currentTarget.style.background = selected ? TINT.bg : 'transparent'
        e.currentTarget.style.color = selected ? TINT.fg : REST_COLOR
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
      {selected && <span aria-hidden style={{ color: TINT.fg }}>✓</span>}
    </button>
  )
}
