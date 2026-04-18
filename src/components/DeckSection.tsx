import type { DeckState } from '../types'

interface DeckSectionProps {
  deck: DeckState
  onDeckDraw: () => void
  onDeckReset: () => void
}

function colorClass(color: 'red' | 'black' | 'gold' | undefined): string {
  if (!color) return 'gold'
  return color === 'gold' ? 'gold' : color
}

export default function DeckSection(props: DeckSectionProps) {
  const current = props.deck.current
  const history = props.deck.history.slice(-8)

  return (
    <section className="util-card">
      <h3>Общая колода</h3>

      <div className="card-area">
        <div className="deck-row">
          <div className="card-wrap">
            <button
              className="playing-card"
              onClick={props.onDeckDraw}
              title="Вытянуть карту"
              draggable={Boolean(current)}
              onDragStart={(event) => {
                if (!current) return
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData('application/x-ca-card', 'current')
              }}
            >
              {current ? (
                <div className={`card-face ${colorClass(current.color)}`}>
                  <span className="c-big">{current.label}</span>
                </div>
              ) : (
                <div className="card-back">
                  <div className="card-back-pat"></div>
                </div>
              )}
            </button>
          </div>

          <div className="card-info">
            <div className={`card-name-lbl ${current ? colorClass(current.color) : ''}`}>
              {current ? current.label : '— нажмите —'}
            </div>
            <div className="deck-cnt">Колода: {props.deck.remaining.length} карт</div>
            <div className="drop-hint">История сохраняется в сейв игры</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button className="draw-btn" onClick={props.onDeckDraw}>
              🎴 Вытянуть
            </button>
            <button className="reset-deck-btn" onClick={props.onDeckReset}>
              ♻ Перемешать
            </button>
          </div>
        </div>

        <div style={{ width: '100%' }}>
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', letterSpacing: '2px', marginBottom: '5px' }}>ИСТОРИЯ</div>
          <div className="hist-chips">
            {history.length === 0 ? <span className="muted">История пока пустая</span> : null}
            {history.map((card, idx) => (
              <div className={`chip ${colorClass(card.color)} ${card.suit === 'joker' ? 'joker' : ''}`} key={`${card.id}_${idx}`}>
                {card.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
