// The strip's bridge to checkpoints (src/main/checkpoints).
import { ipcRenderer } from 'electron'
import type { CheckpointView, Offer } from '../shared/checkpoints'
import { challengeBridge } from './challenges'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const checkpointApi = {
  /** A checkpoint is offered ('pause' or 'break': the strip glows), or not (null). */
  onOffer: (listener: (offer: Offer | null) => void) => subscribe('checkpoint:offer', listener),
  /** Duet closed the open checkpoint (another video came on): the strip drops its card. */
  onClosed: (listener: () => void) => subscribe('checkpoint:closed', listener),
  open: () => invoke<CheckpointView>('checkpoint:open'),
  ...challengeBridge('checkpoint'),
  done: () => invoke<void>('checkpoint:done'),
  close: () => invoke<void>('checkpoint:close'),
  /** The strip takes the keyboard (it normally leaves it to the video), to type an answer. */
  takeKeyboard: () => ipcRenderer.send('duet:focus')
}
