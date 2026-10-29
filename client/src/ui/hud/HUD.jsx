import { useGame } from '../../store/game'
import EggPanel from './EggPanel'
import InteractPrompt from './InteractPrompt'
import LeftMenu from './LeftMenu'
import HealthBar from './HealthBar'
import PassButtons from './PassButtons'
import RollButton from './RollButton'
import RollOverlay from './RollOverlay'
import StatsPanel from './StatsPanel'
import TopBar from './TopBar'
import TopCenter from './TopCenter'

/**
 * The heads-up display, laid out like the reference: Rebirths and Wins top-left over
 * the menu tiles, the passes on the right, your Health, level bar and Health packs
 * bottom-centre, the tutorial top-centre, and sound, daily rewards, leaderboards and
 * your name tag top-right.
 *
 * The root ignores pointer events so the canvas and joystick underneath keep working;
 * only the buttons themselves opt back in. While a panel is open the HUD steps aside,
 * as in the reference.
 */
export function HUD() {
  const panelOpen = useGame((s) => s.panel !== null)
  // While your tire rolls the side menus clear out, as in the reference.
  const rolling = useGame((s) => Boolean(s.roll || s.rollResult))
  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-20 select-none">
      <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: panelOpen ? 0 : 1, visibility: panelOpen ? 'hidden' : 'visible' }}>
        <TopBar />
        <StatsPanel />
        {/* Hidden, not unmounted, while rolling: remounting them at the moment of the
            push-off cost a visible hitch on slow phones. */}
        <div className="contents" style={{ visibility: rolling ? 'hidden' : 'visible' }}>
          <LeftMenu />
          <PassButtons />
          <TopCenter />
        </div>
        <HealthBar />
        <RollButton />
        <InteractPrompt />
        <EggPanel />
        <RollOverlay />
      </div>
    </div>
  )
}

export default HUD
