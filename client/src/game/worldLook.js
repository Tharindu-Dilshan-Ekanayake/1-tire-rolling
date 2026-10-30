import { WORLD_ZONES } from '@shared/balance'
import { Color } from 'three'

import { getGame } from '../store/game'
import { SKY } from './sceneStyle'
import { skyUniforms } from './skyState'

/**
 * The world you're in (index into balance WORLDS) and what it changes on screen: the
 * stages the track shows - their names, colours and scenery; every world's gates stand
 * at the same metres - and the lobby's sky. GameScene remounts the track when the world
 * changes, so whatever it builds on mount follows; tables derived from the stages are
 * built once per world (`perWorld`) and picked when used.
 */
export const activeWorld = () => getGame().profile.world || 0

/** The current world's stages (ZONES for World 1). */
export const zones = () => WORLD_ZONES[activeWorld()] ?? WORLD_ZONES[0]

/** `build(zones, world)` for every world, up front; returns a getter for the current one. */
export function perWorld(build) {
  const tables = WORLD_ZONES.map((zs, world) => build(zs, world))
  return () => tables[activeWorld()] ?? tables[0]
}

/** The lobby's sky in each world: World 2's is a candy-pink sunset under violet. */
const LOBBY_SKIES = [
  { top: new Color(SKY.top), horizon: new Color(SKY.horizon) },
  { top: new Color('#7457f5'), horizon: new Color('#ffc4e8') },
]
export const lobbySky = () => LOBBY_SKIES[activeWorld()] ?? LOBBY_SKIES[0]

/** Puts the current world's lobby sky back (and the fog, which matches its horizon). */
export function showLobbySky(fog) {
  const sky = lobbySky()
  skyUniforms.topColor.value.copy(sky.top)
  skyUniforms.horizonColor.value.copy(sky.horizon)
  if (fog) fog.color.copy(sky.horizon)
}
