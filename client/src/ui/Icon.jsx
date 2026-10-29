import { iconUrl } from './icons'

/**
 * An icon from the game's SVG set (see icons.js), as an <img> so repeated icons share
 * one decoded image and never clash over gradient ids.
 *
 * @param {{ name: string, size?: string|number, className?: string, style?: object }} props
 */
export function Icon({ name, size = '1em', className = '', style }) {
  const src = iconUrl(name)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`pointer-events-none inline-block select-none ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  )
}

export default Icon
