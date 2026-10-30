import { useCallback, useEffect } from 'react'

import { WORLD_ZONES } from '@shared/balance'
import { formatDistance, formatNumber } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { setRollHudElement } from '../../game/roll/hudLink'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

/**
 * Each stage theme's colour on the progress bar (the same hues as its walls' caps; kept here
 * so the HUD doesn't pull in the lazily loaded track).
 */
const ZONE_BAR = {
  grassy: '#7bd64a',
  autumn: '#ff9a3c',
  desert: '#ffd25a',
  beach: '#5fd6ff',
  jungle: '#3fd16a',
  frozen: '#d9f3ff',
  cherry: '#ffa8d4',
  candy: '#ff6fc0',
  mushroom: '#c46bff',
  volcano: '#ff5a2a',
  swamp: '#8ae04a',
  crystal: '#b98bff',
  ocean: '#1fb8e8',
  neon: '#39ff88',
  sky: '#fff0a8',
  rainbow: '#ff5fd2',
  moon: '#b8bcc8',
  aurora: '#5fffc8',
  space: '#5a4cff',
  cosmic: '#d43bc8',
}

/**
 * Top centre while your tire rolls, as in the reference: a bar of the track's zones
 * with your marker moving along it, "1,050 m" under it and the zone's name. All three
 * are written straight to the DOM from the frame loop (see hudLink), never through
 * React.
 */
function DistanceCounter() {
  // A callback ref: registered when the element mounts, cleared when it unmounts.
  const ref = useCallback((el) => setRollHudElement(el), [])
  const world = useGame((s) => s.profile.world)
  return (
    // Below the top-right buttons, so the bar never runs under them.
    <div ref={ref} className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(96), width: u(1300), maxWidth: '86vw' }}>
      <div className="relative w-full" style={{ height: u(30) }}>
        <div className="absolute inset-0 flex overflow-hidden" style={{ border: `${u(5)} solid #111`, borderRadius: u(16) }}>
          {WORLD_ZONES[world].map((zone) => (
            <div key={zone.id} className="h-full flex-1" style={{ background: ZONE_BAR[zone.theme], borderRight: `${u(2)} solid rgba(0,0,0,0.35)` }} />
          ))}
        </div>
        <div data-zone-marker className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: '0%' }}>
          <Icon name="tire" size={u(64)} />
        </div>
      </div>
      <span className="pp-text" style={{ fontSize: u(100), lineHeight: 1, marginTop: u(14) }}>
        <span data-distance aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(20) }}>
          0 m
        </span>
        <span data-distance className="pp-text-fill" style={{ color: '#ffffff' }}>
          0 m
        </span>
      </span>
      <span className="pp-text" style={{ fontSize: u(56), marginTop: u(6) }}>
        <span data-zone aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(12) }} />
        <span data-zone data-zone-fill className="pp-text-fill" style={{ WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }} />
      </span>
    </div>
  )
}

/**
 * Once the tire stops: "+123 Wins!" with a trophy, the distance (NEW BEST! if it was),
 * and - if it broke on a gate - what that gate's wall takes to smash.
 */
/** How many trophies fly to the Wins counter, and where each bursts out to first. */
const FLYERS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.3
  const r = 110 + (i % 3) * 45
  return { sx: Math.cos(a) * r, sy: Math.sin(a) * r * 0.7, delay: 0.35 + i * 0.06 }
})

/**
 * The Wins flying home: a ring of trophies bursts out of the result and streams into
 * the Wins counter in the top-left (which bumps as they land - see StatsPanel), with a
 * coin ping for each.
 */
function FlyingTrophies() {
  useEffect(() => sfx.coins(FLYERS.length), [])
  return FLYERS.map((f, i) => (
    <span
      key={i}
      className="pp-fly pointer-events-none absolute left-1/2 top-[48%]"
      style={{ '--sx': u(f.sx), '--sy': u(f.sy), animationDelay: `${f.delay}s` }}
    >
      <Icon name="trophy" size={u(70)} />
    </span>
  ))
}

function RollResult({ result }) {
  const world = useGame((s) => s.profile.world)
  const wall = result.blocked > 0 ? WORLD_ZONES[world][result.blocked] : null
  return (
    <>
      <FlyingTrophies key={`fly-${result.id}`} />
      {/* Centred by the pp-result animation's own transform. */}
      <div key={result.id} className="pp-result pointer-events-none absolute left-1/2 top-[48%] flex flex-col items-center">
        <div className="flex items-center" style={{ gap: u(14), fontSize: u(100) }}>
          <Icon name="trophy" size={u(140)} />
          <StrokeText stroke={u(18)} gradient={GRADIENTS.gold}>
            +{formatNumber(result.wins + result.prize)} Wins!
          </StrokeText>
        </div>
        <div style={{ fontSize: u(46) }}>
          <StrokeText stroke={u(10)}>
            {formatDistance(result.distance)}
            {result.best && <span style={{ marginLeft: u(24) }}>NEW BEST!</span>}
          </StrokeText>
        </div>
        {wall && (
          <div className="flex flex-col items-center" style={{ fontSize: u(38), marginTop: u(8) }}>
            <span className="flex items-center" style={{ gap: u(8) }}>
              <Icon name="tire" size={u(52)} />
              <StrokeText stroke={u(8)} gradient={GRADIENTS.priceShort}>
                Your tire broke on the {wall.name} gate!
              </StrokeText>
            </span>
            <span className="flex items-center" style={{ gap: u(8), fontSize: u(34) }}>
              <Icon name="heart" size={u(46)} />
              <StrokeText stroke={u(7)}>Train to {formatNumber(wall.wall)} Health to smash it</StrokeText>
            </span>
          </div>
        )}
      </div>
    </>
  )
}

/** How long a toast stays up. */
const TOAST_MS = 3500

/** A celebration banner across the middle: a new zone, an ad reward, a Gems purchase. */
function Toast() {
  const toast = useGame((s) => s.toast)
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => {
      if (useGame.getState().toast === toast) useGame.setState({ toast: null })
    }, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast])
  if (!toast) return null
  return (
    <div
      key={toast.id}
      className="pp-result pointer-events-none absolute left-1/2 top-[30%] flex flex-col items-center text-center"
      style={{ fontSize: u(60), animationDuration: `${TOAST_MS}ms`, width: 'max-content', maxWidth: '92vw' }}
    >
      <StrokeText stroke={u(12)} gradient={GRADIENTS.gold} style={{ whiteSpace: 'normal' }}>
        {toast.text}
      </StrokeText>
    </div>
  )
}

export function RollOverlay() {
  const rolling = useGame((s) => Boolean(s.roll || s.rollResult))
  const result = useGame((s) => s.rollResult)
  return (
    <>
      {rolling && <DistanceCounter />}
      {result && <RollResult result={result} />}
      <Toast />
    </>
  )
}

export default RollOverlay
