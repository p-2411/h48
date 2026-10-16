// The side panel window (Script, Explain): over the video, on its right side, as the strip is (above
// full-screen video too). With no video in view, where it was last left. Opened from the strip or the
// menu bar; its tabs are in src/renderer/src/panel. Drawn in the macOS sidebar material.
import type { BrowserWindow, Rectangle } from 'electron'
import type { VideoFrame } from '../captions'
import { createSideWindow } from './side'

const WIDTH = 460
const HEIGHT = 720
const LEAST_HEIGHT = 480
// Its room inside the video's edges.
const INSET = 20

/** The panel on the video's right side, centred top to bottom, as tall as the video allows. */
export function boundsOnVideo(frame: VideoFrame): Rectangle {
  const height = Math.round(Math.min(HEIGHT, Math.max(LEAST_HEIGHT, frame.height - INSET * 2)))
  return {
    width: WIDTH,
    height,
    x: Math.round(frame.x + frame.width - WIDTH - INSET),
    y: Math.round(frame.y + (frame.height - height) / 2)
  }
}

export function createPanelWindow(bounds?: Rectangle): BrowserWindow {
  return createSideWindow('panel', 'Duet', { width: WIDTH, height: HEIGHT, bounds, glass: true, floating: true })
}
