import { usePetIcon } from '../game/pets/petIcons'
import Icon from './Icon'

/**
 * A pet's portrait, rendered from its 3D model (see petIcons.js). Shows a faint
 * placeholder for the frame or two before the portrait is ready.
 *
 * @param {{ id: string, size: string|number, className?: string, style?: object }} props
 */
export function PetIcon({ id, size, className = '', style }) {
  const url = usePetIcon(id)
  if (!url) return <Icon name="pets" size={size} className={className} style={{ opacity: 0.25, ...style }} />
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className={`pointer-events-none select-none ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  )
}

export default PetIcon
