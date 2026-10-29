import { useEffect, useRef } from 'react'

import { NAMEPLATE_POOL_SIZE, registerNameplateElements } from '../game/remote/nameplates'

const SLOTS = Array.from({ length: NAMEPLATE_POOL_SIZE }, (_, i) => i)

/**
 * DOM side of the other players' name tags; positioned by the 3D frame loop. Chunky
 * white lettering in the game's font with a thick dark outline and a drop under it.
 */
export function NameplateLayer() {
  const refs = useRef([])
  useEffect(() => {
    registerNameplateElements(refs.current)
  }, [])
  return (
    <div className="pointer-events-none absolute inset-0 z-[14] overflow-hidden">
      {SLOTS.map((i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="pp-text"
          style={{
            // Inline, so .pp-text's position: relative can't override it.
            position: 'absolute',
            left: 0,
            top: 0,
            display: 'none',
            fontSize: 'max(15px, calc(var(--px) * 32))',
            letterSpacing: '0.02em',
            willChange: 'transform',
          }}
        >
          {/* An outlined copy behind and a clean white one on top, like StrokeText: one
              element with a thick text-stroke draws stray bits of outline on phones. */}
          <span className="pp-text-stroke" style={{ WebkitTextStrokeWidth: '0.24em', WebkitTextStrokeColor: '#121218', color: '#121218' }} />
          <span className="pp-text-fill" style={{ color: '#ffffff' }} />
        </div>
      ))}
    </div>
  )
}

export default NameplateLayer
