import { useEffect, useRef, useState } from 'react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const distanceTo = (point, rect) => Math.hypot(point.x - clamp(point.x, rect.left, rect.right), point.y - clamp(point.y, rect.top, rect.bottom))

export default function useGamePointer(stageRef, audioRef) {
  const cursorRef = useRef(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const stage = stageRef.current
    const cursor = cursorRef.current
    const audio = audioRef.current
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let raw = { x: innerWidth / 2, y: innerHeight / 2 }
    let point = { ...raw }, goal = { ...raw }, velocity = { x: 0, y: 0 }
    let target = null, dragging = null, frame = 0, previousTime = 0, inside = false
    let suppressClick = false
    const activity = zen => window.dispatchEvent(new CustomEvent('concertpointermove', { detail: { zen } }))
    const clearTarget = () => { target?.removeAttribute('data-game-hover'); target = null }
    const draw = () => { cursor.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)` }
    const animate = time => {
      const dt = Math.min((time - previousTime) / 1000 || 1 / 60, .025)
      previousTime = time
      for (const axis of ['x', 'y']) {
        velocity[axis] += ((goal[axis] - point[axis]) * 220 - velocity[axis] * 23) * dt
        point[axis] += velocity[axis] * dt
      }
      if (reducedMotion.matches || (Math.hypot(goal.x - point.x, goal.y - point.y) < .1 && Math.hypot(velocity.x, velocity.y) < .5)) {
        point = { ...goal }; velocity = { x: 0, y: 0 }; frame = 0
      } else frame = requestAnimationFrame(animate)
      draw()
    }
    const aim = element => {
      if (target !== element) { clearTarget(); target = element; target?.setAttribute('data-game-hover', '') }
      const rect = target?.getBoundingClientRect()
      const range = target?.matches('input[type=range]')
      goal = rect ? { x: range ? clamp(raw.x, rect.left, rect.right) : rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { ...raw }
      cursor.style.setProperty('--cursor-width', `${rect && !range ? rect.width + 10 : 14}px`)
      cursor.style.setProperty('--cursor-height', `${rect && !range ? rect.height + 10 : 14}px`)
      cursor.dataset.magnetic = String(Boolean(target))
      if (!frame) { previousTime = 0; frame = requestAnimationFrame(animate) }
    }
    const pick = () => {
      const candidates = [...stage.querySelectorAll('button:not(:disabled), input[type=range]:not(:disabled)')]
        .map(element => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ element, rect }) => {
          if (!rect.width || !rect.height) return false
          for (let current = element; current && current !== stage; current = current.parentElement) {
            const style = getComputedStyle(current)
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < .5 || style.pointerEvents === 'none') return false
          }
          return true
        })
      // Each control owns its nearest region, with a small overlap to avoid flicker.
      const hit = candidates.find(({ rect }) => distanceTo(raw, rect) === 0)
      if (hit) return hit.element
      const nearest = candidates.sort((a, b) => distanceTo(raw, a.rect) - distanceTo(raw, b.rect))[0]
      if (!nearest || distanceTo(raw, nearest.rect) > 80) return null
      const current = candidates.find(item => item.element === target)
      return current && distanceTo(raw, current.rect) <= distanceTo(raw, nearest.rect) + 12 ? current.element : nearest.element
    }
    const seek = input => {
      const rect = input.getBoundingClientRect()
      if (audio && Number.isFinite(audio.duration)) audio.currentTime = clamp((raw.x - rect.left) / rect.width, 0, 1) * audio.duration
    }
    const move = event => {
      if (event.pointerType !== 'mouse') return
      inside = true
      stage.classList.add('magnetic-pointer-active')
      cursor.dataset.outside = 'false'
      raw = { x: event.clientX, y: event.clientY }
      const zone = stage.querySelector('.concert-zen-zone')?.getBoundingClientRect()
      const zen = Boolean(zone?.width && distanceTo(raw, zone) === 0 && !dragging)
      activity(zen)
      cursor.dataset.parked = String(zen)
      if (zen) { clearTarget(); return }
      if (dragging) { seek(dragging); aim(dragging) } else aim(pick())
    }
    const leave = () => {
      if (dragging) return
      inside = false
      clearTarget()
      stage.classList.remove('magnetic-pointer-active')
      cursor.dataset.outside = 'true'
    }
    const down = event => {
      if (!inside || event.pointerType !== 'mouse' || event.button !== 0) return
      if (target?.matches('input[type=range]')) {
        event.preventDefault()
        dragging = target
        suppressClick = true
        target.focus({ preventScroll: true })
        stage.setPointerCapture(event.pointerId)
        seek(target)
      }
    }
    const up = event => {
      dragging = null
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
    }
    const click = event => {
      if (!inside || !event.isTrusted || event.detail === 0 || event.button !== 0) return
      if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return }
      if (!target?.isConnected || !target.matches('button:not(:disabled)')) return
      const chrome = target.closest('.concert-toolbar, .concert-footer')
      if (chrome && Number(getComputedStyle(chrome).opacity) < .5) return
      if (target.contains(event.target)) return // A normal click already targets the right button.
      event.preventDefault()
      event.stopPropagation()
      target.click()
    }
    const focus = event => {
      if (event.target.matches('button, input[type=range]')) {
        cursor.dataset.parked = 'false'
        cursor.dataset.outside = 'false'
        aim(event.target)
      }
    }
    const keyboard = event => { if (event.key === 'Escape') setEnabled(false) }
    const park = () => { clearTarget(); cursor.dataset.parked = 'true'; activity(true) }
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerleave', leave)
    stage.addEventListener('pointerdown', down)
    stage.addEventListener('pointerup', up)
    stage.addEventListener('pointercancel', up)
    stage.addEventListener('click', click, true)
    stage.addEventListener('focusin', focus)
    window.addEventListener('keydown', keyboard)
    window.addEventListener('blur', leave)
    audio?.addEventListener('play', park)
    cursor.dataset.outside = 'true'
    return () => {
      cancelAnimationFrame(frame)
      clearTarget()
      stage.classList.remove('magnetic-pointer-active')
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerleave', leave)
      stage.removeEventListener('pointerdown', down)
      stage.removeEventListener('pointerup', up)
      stage.removeEventListener('pointercancel', up)
      stage.removeEventListener('click', click, true)
      stage.removeEventListener('focusin', focus)
      window.removeEventListener('keydown', keyboard)
      window.removeEventListener('blur', leave)
      audio?.removeEventListener('play', park)
      activity(false)
    }
  }, [enabled, stageRef, audioRef])

  return { enabled, cursorRef, toggle: () => setEnabled(value => !value) }
}
