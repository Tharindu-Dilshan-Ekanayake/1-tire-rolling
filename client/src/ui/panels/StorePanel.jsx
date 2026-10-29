import { SHOP } from '@shared/balance'

import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import PetIcon from '../PetIcon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const SECTIONS = [
  { title: 'Passes', items: ['slideX2', 'winsX2'] },
  { title: 'Treadmills', items: ['treadVeryOp', 'treadBest'] },
  { title: 'Specials', items: ['sphinx'] },
]

const ICONS = {
  slideX2: 'slide',
  winsX2: 'trophy',
  treadVeryOp: 'portal',
  treadBest: 'portal',
}

const BLURBS = {
  slideX2: 'Double every Slide gain, forever',
  winsX2: 'Double the Wins from every slide, forever',
  treadVeryOp: 'Unlocks the x30 Ice Treadmill',
  treadBest: 'Unlocks the x60 Galaxy Treadmill',
  sphinx: 'Limited: x150 Slide pet',
}

/** Everything Wins can buy besides boards, eggs and Slide packs, grouped, with what it does. */
export function StorePanel() {
  const passes = useGame((s) => s.profile.passes)
  const wins = useGame((s) => s.profile.wins)
  return (
    <Panel title="STORE" width={1080}>
      <div className="flex flex-col" style={{ gap: u(18) }}>
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: u(40), marginBottom: u(8) }}>
              <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
                {section.title}
              </StrokeText>
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${u(200)}, 1fr))`, gap: u(12) }}>
              {section.items.map((id) => {
                const product = SHOP[id]
                const owned = product.kind === 'pass' && passes[id]
                return (
                  <div
                    key={id}
                    className="flex flex-col items-center text-center"
                    style={{ padding: u(10), borderRadius: u(8), border: `${u(5)} solid #111`, background: owned ? GRADIENTS.greyButton : GRADIENTS.rewardCard }}
                  >
                    {id === 'sphinx' ? <PetIcon id="sphinx" size={u(96)} /> : <Icon name={ICONS[id]} size={u(96)} />}
                    <span style={{ fontSize: u(product.name.length > 12 ? 24 : 30), lineHeight: 1.1 }}>
                      <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
                        {product.name}
                      </StrokeText>
                    </span>
                    <span className="whitespace-normal" style={{ fontSize: u(18), minHeight: u(44), margin: `${u(4)} 0` }}>
                      <span style={{ color: '#3a2a10', fontFamily: 'system-ui, sans-serif', fontWeight: 700 }}>{BLURBS[id]}</span>
                    </span>
                    <ChunkyButton
                      gradient={owned ? GRADIENTS.greyButton : GRADIENTS.greenButton}
                      disabled={owned}
                      onClick={() => buy(id)}
                      className="w-full"
                      style={{ height: u(58) }}
                    >
                      {owned ? (
                        <span style={{ fontSize: u(30) }}>
                          <StrokeText stroke={u(6)}>Owned</StrokeText>
                        </span>
                      ) : (
                        <Price amount={product.price} size={32} afford={wins >= product.price} />
                      )}
                    </ChunkyButton>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default StorePanel
