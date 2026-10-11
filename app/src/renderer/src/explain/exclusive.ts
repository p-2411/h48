// One card action at a time. Saving, rating and undoing each go to the main process once; a second
// press would find the action already done and show "That was already done" or "There is nothing to
// undo". Kept free of React so scripts/test-conversation.mjs can check it.

/**
 * Makes `run(task)`: while a task is out, further calls are ignored. `onBusy` says when the buttons
 * should be disabled. The guard is a plain flag, not React state, so two clicks in the same frame
 * (before the re-render disables the buttons) still run once.
 */
export function exclusive(onBusy: (busy: boolean) => void): (task: () => Promise<void>) => Promise<void> {
  let running = false
  return async (task) => {
    if (running) return
    running = true
    onBusy(true)
    try {
      await task()
    } finally {
      running = false
      onBusy(false)
    }
  }
}
