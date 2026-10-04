import { useContext } from 'react'
import { MENU, PreferencesThemeContext, useLanguage } from '@unisim/sdk'
import { usePrefsStore } from '../stores/prefsStore'

/**
 * Universal Video's own row in Tune this app — the SDK draws the dialog, its
 * Language and Colour scheme rows, Reset to defaults and About; this is only
 * what is ours. Inline-styled from the SDK's menu palette so it matches the
 * rows around it in either colour scheme.
 *
 * Unticked (the default) shows frames and a sound wave on every clip; ticked
 * goes back to plain blocks. Worded as "Hide" because every tick box in the
 * suite starts unticked and this feature starts on.
 */

const COPY: Record<string, { label: string; hint: string }> = {
  en: {
    label: 'Hide timeline thumbnails',
    hint: 'Clips show plain blocks instead of frames and a sound wave. Lighter on an older computer.',
  },
  fr: {
    label: 'Masquer les vignettes de la timeline',
    hint: 'Les clips s’affichent en blocs simples, sans images ni forme d’onde. Plus léger pour un ordinateur ancien.',
  },
  es: {
    label: 'Ocultar las miniaturas de la línea de tiempo',
    hint: 'Los clips se muestran como bloques simples, sin fotogramas ni forma de onda. Más ligero en un ordenador antiguo.',
  },
  it: {
    label: 'Nascondi le miniature della timeline',
    hint: 'Le clip appaiono come blocchi semplici, senza fotogrammi né forma d’onda. Più leggero su un computer datato.',
  },
  de: {
    label: 'Timeline-Vorschaubilder ausblenden',
    hint: 'Clips erscheinen als einfache Blöcke statt mit Einzelbildern und Wellenform. Schont ältere Computer.',
  },
  'pt-BR': {
    label: 'Ocultar miniaturas da linha do tempo',
    hint: 'Os clipes aparecem como blocos simples, sem quadros nem forma de onda. Mais leve em um computador antigo.',
  },
  'pt-PT': {
    label: 'Ocultar miniaturas da linha temporal',
    hint: 'Os clipes aparecem como blocos simples, sem fotogramas nem forma de onda. Mais leve num computador antigo.',
  },
  tr: {
    label: 'Zaman çizelgesi küçük resimlerini gizle',
    hint: 'Klipler kare ve ses dalgası yerine düz bloklar olarak görünür. Eski bilgisayarlarda daha hafif.',
  },
}

function stripsCopy(language: string): { label: string; hint: string } {
  return COPY[language] ?? COPY[language.split('-')[0]] ?? COPY.en
}

export default function StripsPreference() {
  const theme = useContext(PreferencesThemeContext)
  const { language } = useLanguage()
  const hideStrips = usePrefsStore((s) => s.hideStrips)
  const set = usePrefsStore((s) => s.set)
  const p = MENU[theme === 'dark' ? 'dark' : 'light']
  const copy = stripsCopy(language)

  return (
    <label
      data-testid="pref-hide-strips"
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: 'pointer' }}
    >
      <input
        type="checkbox"
        checked={hideStrips}
        onChange={(e) => set({ hideStrips: e.target.checked })}
        style={{ marginTop: 2, width: 16, height: 16, accentColor: '#ea580c', flexShrink: 0 }}
      />
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: p.body }}>{copy.label}</span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 12, lineHeight: 1.4, color: p.muted }}>{copy.hint}</span>
      </span>
    </label>
  )
}
