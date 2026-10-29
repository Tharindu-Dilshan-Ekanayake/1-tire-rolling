import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

import { formatGain } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { iconUrl } from '../../ui/icons'
import { runtime } from '../runtime'
import { slide } from '../slide/slideControl'
import { drainTrainFx } from './fxQueue'
import { spawnPopup, spawnScattered, updatePopups } from './popups'

const _at = new Vector3()
const SLIDE_ICON = iconUrl('slide')
const LEVEL_GRADIENT = 'linear-gradient(180deg, #e0faff 0%, #7fe2ff 45%, #2fa8ff 100%)'
const RIDING_GAIN = { iconUrl: SLIDE_ICON }

/** One gain's popup by wherever you're drawn: on the treadmill, walking, or riding down the hill. */
function showGain(event) {
  const riding = slide.active
  const at = riding ? slide.position : runtime.player.position
  const follow = riding ? slide.position : null
  if (riding) {
    // Riding: scattered over the screen with the trophies.
    spawnScattered(`+${formatGain(event.gain)}`, RIDING_GAIN)
  } else {
    _at.set(at.x + (Math.random() - 0.5) * 3, at.y + 0.8 + Math.random() * 1.2, at.z + (Math.random() - 0.5) * 1.5)
    spawnPopup(`+${formatGain(event.gain)}`, _at, { iconUrl: SLIDE_ICON })
  }
  sfx.gain(event.source !== 'tread')
  if (event.leveledUp) {
    _at.set(at.x, at.y + 2.8, at.z)
    spawnPopup(event.maxed ? 'MAX LEVEL!' : 'LEVEL UP!', _at, { gradient: LEVEL_GRADIENT, scale: 1.5, life: 1600, follow })
  }
}

/**
 * Slide-gain feedback: a "+1.8" popup by your character for every gain - a treadmill
 * step, walking, or the "+1" ticks on the way down the hill - and LEVEL UP! when one
 * lands. Also moves every live popup each frame.
 */
export function GainFX() {
  const size = useThree((s) => s.size)

  useFrame((state) => {
    drainTrainFx(showGain)
    updatePopups(state.camera, size.width, size.height)
  })

  return null
}

export default GainFX
