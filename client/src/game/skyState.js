import { Color } from 'three'

import { SKY } from './sceneStyle'

/**
 * Sky shader uniforms, module-level so other systems (the roll's zone tint, Space
 * going dark) can retint the sky without React: they write `.value` and the next frame
 * shows it.
 */
export const skyUniforms = {
  topColor: { value: new Color(SKY.top) },
  horizonColor: { value: new Color(SKY.horizon) },
  exponent: { value: SKY.exponent },
}
