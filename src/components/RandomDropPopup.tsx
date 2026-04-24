import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import '../styles/randomDropPopup.css'

interface PopupCoords {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface RandomDropPopupProps {}

export interface RandomDropShowPayload {
  imagePaths: string[]
  messages: string[]
  coords?: PopupCoords
  autoCloseMs?: number
}

export interface RandomDropPopupRef {
  show: (payload: RandomDropShowPayload) => void
  hide: () => void
}

interface PopupData {
  image: string
  message: string
  coords: Required<PopupCoords>
}

function randomPick(items: string[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return null
  const idx = Math.floor(Math.random() * items.length)
  return items[idx] ?? null
}

export const RandomDropPopup = forwardRef<RandomDropPopupRef, RandomDropPopupProps>(function RandomDropPopup(
  _props,
  ref,
) {
  const [active, setActive] = useState(false)
  const [closing, setClosing] = useState(false)
  const [data, setData] = useState<PopupData | null>(null)
  const [closeDelay, setCloseDelay] = useState(5000)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimers(): void {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    autoCloseTimerRef.current = null
    fadeTimerRef.current = null
  }

  function hideWithFade(): void {
    //game-topif (!active || closing) return
    setClosing(true)
    fadeTimerRef.current = setTimeout(() => {
      setActive(false)
      setClosing(false)
      setData(null)
    }, 180)
  }

  function showPopup(payload: RandomDropShowPayload): void {
    clearTimers()
    const images = payload.imagePaths
    const messages = payload.messages

    const image = randomPick(images)
    const message = randomPick(messages)
    if (!image || !message) return

    const coords: Required<PopupCoords> = {
      top: payload.coords?.top ?? 12,
      right: payload.coords?.right ?? 950,
      bottom: payload.coords?.bottom ?? 0,
      left: payload.coords?.left ?? 0,
    }
    setCloseDelay(payload.autoCloseMs ?? 5000)
    setData({ image, message, coords })
    setClosing(false)
    setActive(true)

    autoCloseTimerRef.current = setTimeout(() => {
      hideWithFade()
    }, closeDelay)
  }

  useImperativeHandle(
    ref,
    () => ({
      show: showPopup,
      hide: hideWithFade,
    }),
    [closeDelay, active, closing],
  )

  useEffect(() => {
    return () => clearTimers()
  }, [])

  if (!active || !data) return null

  return (
    <button
      type="button"
      className={`random-drop-popup ${closing ? 'is-closing' : 'is-open'}`}
      style={{
        top: data.coords.top > 0 ? `${data.coords.top}px` : undefined,
        right: data.coords.right > 0 ? `${data.coords.right}px` : undefined,
        bottom: data.coords.bottom > 0 ? `${data.coords.bottom}px` : undefined,
        left: data.coords.left > 0 ? `${data.coords.left}px` : undefined,
      }}
      onClick={hideWithFade}
      title="Нажмите, чтобы закрыть"
    >
      <img src={data.image} alt="drop" className="random-drop-popup-img" />
      <span className="random-drop-popup-text">{data.message}</span>
    </button>
  )
})
