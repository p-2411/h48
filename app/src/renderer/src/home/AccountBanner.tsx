// A line above the hub when Duet can't help right now: signed out, or a cap reached (with when more
// comes, and Upgrade for Free). Nothing otherwise.
import { useAccount } from './useAccount'
import { useAccountAction } from './useAccountAction'

export function AccountBanner(): React.JSX.Element | null {
  const account = useAccount()
  const [error, run] = useAccountAction()
  if (!account?.configured) return null
  const signedOut = !account.user
  if (!signedOut && !account.capped) return null
  const canUpgrade = !signedOut && account.usage?.billing && account.usage.plan === 'free'
  return (
    <div className="glass home-banner" role="status">
      <span>{signedOut ? 'Sign in to Duet to see lines, Explain and Talk.' : account.capped}</span>
      {signedOut ? (
        <button
          type="button"
          className="btn primary"
          onClick={() => run(() => window.duet.account.signIn(), 'Could not open sign-in.')}
        >
          Sign in
        </button>
      ) : (
        canUpgrade && (
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              run(() => window.duet.account.upgrade(), 'Could not open the payment page.')
            }
          >
            Upgrade
          </button>
        )
      )}
      {error && (
        <small className="error-text" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}
