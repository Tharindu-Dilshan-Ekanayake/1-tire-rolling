import { MAX_EQUIPPED_PETS } from '@shared/balance'
import { rebirthProgress } from '@shared/logic'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import GiftTile from './GiftTile'
import StrokeText from '../StrokeText'
import { AlertBadge, ChunkyButton } from './parts'
import { u } from './style'

/** Each tile's face colour. */
const TILE_GRADIENTS = {
  pets: 'linear-gradient(180deg, #ffd99a 0%, #ffa53a 50%, #f07a12 100%)',
  rebirth: 'linear-gradient(180deg, #b4efff 0%, #4cb8ff 50%, #2477e8 100%)',
  items: 'linear-gradient(180deg, #ffb8c6 0%, #ff5f86 50%, #d92b5a 100%)',
  store: 'linear-gradient(180deg, #c9ff96 0%, #6fe04a 50%, #26ad3c 100%)',
}

function MenuTile({ icon, label, onClick, alert, top }) {
  return (
    <ChunkyButton gradient={TILE_GRADIENTS[icon]} onClick={onClick} title={label} radius={20} className="flex-col" style={{ width: u(112), height: u(112) }}>
      <Icon name={icon} size={u(84)} style={{ marginTop: u(-10) }} />
      <span className="absolute" style={{ bottom: u(-14), fontSize: u(32) }}>
        <StrokeText stroke={u(7)}>{label}</StrokeText>
      </span>
      {top && (
        <span className="absolute" style={{ top: u(-22), fontSize: u(30) }}>
          <StrokeText stroke={u(7)} className="italic">
            {top}
          </StrokeText>
        </span>
      )}
      {alert && <AlertBadge size={40} style={{ top: u(-12), right: u(-14) }} />}
    </ChunkyButton>
  )
}

/** The menu on the left, under the stats: Rebirth (with % to next), Pets, Items, Store, and the free Gift. */
export function LeftMenu() {
  const togglePanel = useGame((s) => s.togglePanel)
  const rebirthPct = useGame((s) => Math.floor(rebirthProgress(s.profile) * 100))
  const petAlert = useGame((s) => s.profile.equippedPets.length < Math.min(MAX_EQUIPPED_PETS, s.profile.pets.length))
  const itemAlert = useGame((s) => Object.values(s.profile.items).some((n) => n > 0))

  return (
    <div
      className="hud-menu pointer-events-none absolute grid grid-cols-2"
      style={{ gap: u(14), rowGap: u(30) }}
    >
      <MenuTile
        icon="rebirth"
        label="Rebirth"
        top={`${rebirthPct}%`}
        alert={rebirthPct >= 100}
        onClick={() => togglePanel('rebirth')}
      />
      <MenuTile icon="pets" label="Pets" alert={petAlert} onClick={() => togglePanel('pets')} />
      <MenuTile icon="items" label="Items" alert={itemAlert} onClick={() => togglePanel('items')} />
      <MenuTile icon="store" label="Store" alert onClick={() => togglePanel('store')} />
      <GiftTile />
    </div>
  )
}

export default LeftMenu
