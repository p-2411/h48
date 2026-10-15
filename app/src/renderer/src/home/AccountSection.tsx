// Settings › Your plan: who is signed in, the plan, this period's watch hours and credits, when more
// come, and Upgrade (Free) or Manage plan (Paid). Signed out: Sign in. Spec:
// docs/superpowers/specs/2026-10-13-usage-caps-design.md, section 12.
import { usageSummary } from '../../../shared/usage'
import { useAccount } from './useAccount'
import { useAccountAction } from './useAccountAction'

function Meter({
  label,
  fraction,
  resets
}: {
  label: string
  fraction: number
  resets: string
}): React.JSX.Element {
  return (
    <div className="plan-meter">
      <div className="plan-meter-text">
        <span>{label}</span>
        <span className="muted">{resets}</span>
      </div>
      <div
        className="plan-meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div
          className={`plan-meter-fill${fraction >= 1 ? ' full' : ''}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}

export function AccountSection(): React.JSX.Element | null {
  const account = useAccount()
  const [error, run] = useAccountAction()
  if (!account?.configured) return null
  const summary = account.usage && usageSummary(account.usage)
  return (
    <section className="settings-group" aria-labelledby="settings-plan">
      <h2 className="label" id="settings-plan">
        Your plan
      </h2>
      <div className="glass">
        {!account.user ? (
          <>
            <p className="muted">Sign in to watch with Duet. Free includes 2 hours a week.</p>
            <button
              type="button"
              className="btn primary"
              onClick={() => run(() => window.duet.account.signIn(), 'Could not open sign-in.')}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            <p>
              {summary ? `Duet ${summary.plan}` : 'Duet'} ·{' '}
              <span className="muted">{account.user.email}</span>
            </p>
            {account.usage?.freeBlocked && (
              <p className="muted">
                Free Duet is limited to two accounts on one computer. Upgrade to go on.
              </p>
            )}
            {summary && (
              <>
                <Meter {...summary.hours} />
                <Meter {...summary.credits} />
              </>
            )}
            <div className="plan-actions">
              {account.usage?.billing &&
                (account.usage.plan === 'free' ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() =>
                      run(() => window.duet.account.upgrade(), 'Could not open the payment page.')
                    }
                  >
                    Upgrade — $15.99 a month
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      run(() => window.duet.account.manage(), 'Could not open your plan.')
                    }
                  >
                    Manage plan
                  </button>
                ))}
              <button
                type="button"
                className="btn quiet"
                onClick={() => run(() => window.duet.account.signOut(), 'Could not sign out.')}
              >
                Sign out
              </button>
            </div>
          </>
        )}
        {error && (
          <small className="error-text" role="alert">
            {error}
          </small>
        )}
      </div>
    </section>
  )
}
