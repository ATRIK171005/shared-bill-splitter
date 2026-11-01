import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: BillSplitterApp,
})

interface Home {
  id: string
  name: string
  createdAt?: string
}

interface Member {
  id: string
  homeId: string
  name: string
}

interface Share {
  id: string
  billId?: string
  memberId: string
  memberName?: string
  amountCents: number
  paidAt: string | null
}

interface Bill {
  id: string
  homeId: string
  title: string
  totalCents: number
  createdAt?: string
  shares: Share[]
}

interface Balance {
  memberId: string
  name: string
  outstandingCents: number
}

function formatMoney(cents: number): string {
  const dollars = (cents / 100).toFixed(2)
  return `$${dollars} (${cents}¢)`
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function BillSplitterApp() {
  const [homes, setHomes] = useState<Home[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  // Loading & error states
  const [isLoadingHomes, setIsLoadingHomes] = useState<boolean>(true)
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // In-flight action states
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [isCreatingBill, setIsCreatingBill] = useState<boolean>(false)
  const [isAddingMember, setIsAddingMember] = useState<boolean>(false)
  const [isCreatingHome, setIsCreatingHome] = useState<boolean>(false)

  // Form states
  const [newHomeName, setNewHomeName] = useState<string>('')
  const [newMemberName, setNewMemberName] = useState<string>('')
  const [newBillTitle, setNewBillTitle] = useState<string>('')
  const [newBillCents, setNewBillCents] = useState<string>('')

  // Fetch homes list
  const loadHomes = useCallback(async () => {
    setIsLoadingHomes(true)
    setGlobalError(null)
    try {
      const res = await fetch('/api/homes')
      if (!res.ok) {
        throw new Error(`Failed to load homes (Status ${res.status})`)
      }
      const data = (await res.json()) as { homes: Home[] }
      const fetchedHomes = data.homes || []
      setHomes(fetchedHomes)
      setSelectedHomeId((curr) => curr || fetchedHomes[0]?.id || '')
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to connect to API server')
    } finally {
      setIsLoadingHomes(false)
    }
  }, [])

  // Fetch home details (members, bills, balances)
  const loadHomeDetails = useCallback(async (homeId: string) => {
    if (!homeId) return
    setIsLoadingDetails(true)
    setActionError(null)
    try {
      const [membersRes, billsRes, balancesRes] = await Promise.all([
        fetch(`/api/homes/${homeId}`),
        fetch(`/api/homes/${homeId}/bills`),
        fetch(`/api/homes/${homeId}/balances`),
      ])

      if (!membersRes.ok) throw new Error(`Could not load members (${membersRes.status})`)
      if (!billsRes.ok) throw new Error(`Could not load bills (${billsRes.status})`)
      if (!balancesRes.ok) throw new Error(`Could not load balances (${balancesRes.status})`)

      const membersData = (await membersRes.json()) as { members: Member[] }
      const billsData = (await billsRes.json()) as { bills: Bill[] }
      const balancesData = (await balancesRes.json()) as { balances: Balance[] }

      setMembers(membersData.members || [])
      setBills(billsData.bills || [])
      setBalances(balancesData.balances || [])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error loading home data')
    } finally {
      setIsLoadingDetails(false)
    }
  }, [])

  useEffect(() => {
    loadHomes()
  }, [loadHomes])

  useEffect(() => {
    if (selectedHomeId) {
      loadHomeDetails(selectedHomeId)
    } else {
      setMembers([])
      setBills([])
      setBalances([])
    }
  }, [selectedHomeId, loadHomeDetails])

  // Handle Home creation
  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim()) return

    setIsCreatingHome(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to create home')
      }
      setNewHomeName('')
      setActionSuccess(`Home created successfully!`)
      await loadHomes()
      setSelectedHomeId(data.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'An error occurred while creating home')
    } finally {
      setIsCreatingHome(false)
    }
  }

  // Handle Member addition
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId || !newMemberName.trim()) return

    setIsAddingMember(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to add member')
      }
      setNewMemberName('')
      setActionSuccess(`Member added successfully`)
      await loadHomeDetails(selectedHomeId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error adding member')
    } finally {
      setIsAddingMember(false)
    }
  }

  // Handle Bill creation
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedHomeId || !newBillTitle.trim() || !newBillCents) return

    const cents = Number.parseInt(newBillCents, 10)
    if (Number.isNaN(cents) || cents <= 0) {
      setActionError('Total cents must be a positive integer (e.g. 1000 for $10.00)')
      return
    }

    if (members.length === 0) {
      setActionError('Cannot create a bill: this home has no members')
      return
    }

    setIsCreatingBill(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBillTitle.trim(),
          totalCents: cents,
        }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to create bill')
      }
      setNewBillTitle('')
      setNewBillCents('')
      setActionSuccess(`Bill created and split evenly across members`)
      await loadHomeDetails(selectedHomeId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error creating bill')
    } finally {
      setIsCreatingBill(false)
    }
  }

  // Handle Pay Share
  const handlePayShare = async (billId: string, shareId: string) => {
    setPayingShareId(shareId)
    setActionError(null)
    setActionSuccess(null)

    // Generate unique idempotency key for this payment attempt
    const idempotencyKey = crypto.randomUUID()

    try {
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      })

      const data = (await res.json()) as {
        id?: string
        paidAt?: string
        error?: string
      }

      if (!res.ok || !data.paidAt) {
        // Keeps the share unpaid and displays the error
        throw new Error(data.error || `Payment failed (Status: ${res.status})`)
      }

      // Mark the share as paid in component state
      const resolvedPaidAt = data.paidAt ?? new Date().toISOString()
      setBills((prevBills) =>
        prevBills.map((b) => {
          if (b.id !== billId) return b
          return {
            ...b,
            shares: b.shares.map((s) => (s.id === shareId ? { ...s, paidAt: resolvedPaidAt } : s)),
          }
        }),
      )

      setActionSuccess('Share marked as paid')

      // Refresh balances in background
      if (selectedHomeId) {
        fetch(`/api/homes/${selectedHomeId}/balances`)
          .then((r) => r.json() as Promise<{ balances: Balance[] }>)
          .then((bData) => {
            if (bData.balances) setBalances(bData.balances)
          })
          .catch(() => {})
      }
    } catch (err) {
      // Retain unpaid status and show clear error
      setActionError(err instanceof Error ? err.message : 'Payment request failed')
    } finally {
      setPayingShareId(null)
    }
  }

  // Global loading state
  if (isLoadingHomes) {
    return (
      <div className="card state-box">
        <div className="spinner" />
        <p style={{ marginTop: 12 }}>Loading homes...</p>
      </div>
    )
  }

  // Global error state
  if (globalError) {
    return (
      <div className="card state-box error">
        <h3>Unable to load application data</h3>
        <p style={{ marginTop: 8 }}>{globalError}</p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          onClick={() => loadHomes()}
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Action feedback banners */}
      {actionError && (
        <div className="alert alert-error">
          <span>{actionError}</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="alert alert-success">
          <span>{actionSuccess}</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
            onClick={() => setActionSuccess(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Home selection bar */}
      <section className="card">
        <div className="home-bar">
          <label htmlFor="home-select" style={{ fontWeight: 600 }}>
            Active Home:
          </label>
          {homes.length > 0 ? (
            <select
              id="home-select"
              className="input-field"
              value={selectedHomeId}
              onChange={(e) => setSelectedHomeId(e.target.value)}
              style={{ minWidth: 200 }}
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>No homes yet</span>
          )}

          {/* Quick Create Home */}
          <form
            onSubmit={handleCreateHome}
            style={{ display: 'inline-flex', gap: 8, marginLeft: 'auto' }}
          >
            <input
              type="text"
              className="input-field"
              placeholder="New home name (e.g. Flat 4B)"
              value={newHomeName}
              onChange={(e) => setNewHomeName(e.target.value)}
              disabled={isCreatingHome}
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={isCreatingHome || !newHomeName.trim()}
            >
              {isCreatingHome ? 'Creating...' : '+ Add Home'}
            </button>
          </form>
        </div>
      </section>

      {/* Main Home Content */}
      {!selectedHomeId ? (
        <div className="card state-box">
          <h3>No home selected</h3>
          <p style={{ marginTop: 8 }}>
            Please select an existing home or create a new one using the form above.
          </p>
        </div>
      ) : isLoadingDetails ? (
        <div className="card state-box">
          <div className="spinner" />
          <p style={{ marginTop: 12 }}>Loading home bills and balances...</p>
        </div>
      ) : (
        <>
          {/* Top row: Members & Balances */}
          <div className="grid-2">
            {/* Members card */}
            <div className="card">
              <div className="card-title">
                <span>Members ({members.length})</span>
              </div>

              {members.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 16 }}>
                  No members added yet. Add at least one member to split bills.
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  {members.map((m, idx) => (
                    <div key={m.id} className="balance-item">
                      <span>
                        <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>
                          #{idx + 1}
                        </span>
                        <strong>{m.name}</strong>
                      </span>
                      <span className="badge badge-info">Member</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add member form */}
              <form onSubmit={handleAddMember} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Member name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  disabled={isAddingMember}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={isAddingMember || !newMemberName.trim()}
                >
                  {isAddingMember ? 'Adding...' : '+ Add Member'}
                </button>
              </form>
            </div>

            {/* Balances card */}
            <div className="card">
              <div className="card-title">
                <span>Outstanding Balances</span>
              </div>

              {balances.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No balance data available.
                </div>
              ) : (
                <div>
                  {balances.map((b) => (
                    <div key={b.memberId} className="balance-item">
                      <span>{b.name}</span>
                      <span
                        className="balance-amount"
                        style={{ color: b.outstandingCents > 0 ? '#b45309' : '#059669' }}
                      >
                        {b.outstandingCents > 0
                          ? `Owes ${formatMoney(b.outstandingCents)}`
                          : 'All settled ($0.00)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Create new bill card */}
          <section className="card">
            <div className="card-title">
              <span>Create New Bill</span>
            </div>
            <form onSubmit={handleCreateBill}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <label
                    htmlFor="bill-title"
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Bill Title
                  </label>
                  <input
                    id="bill-title"
                    type="text"
                    className="input-field"
                    placeholder="e.g. WiFi, Groceries"
                    value={newBillTitle}
                    onChange={(e) => setNewBillTitle(e.target.value)}
                    disabled={isCreatingBill}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="bill-cents"
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Total Amount (in whole Cents)
                  </label>
                  <input
                    id="bill-cents"
                    type="number"
                    step="1"
                    min="1"
                    className="input-field"
                    placeholder="e.g. 3000 for $30.00"
                    value={newBillCents}
                    onChange={(e) => setNewBillCents(e.target.value)}
                    disabled={isCreatingBill}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {members.length > 0 && newBillCents && Number(newBillCents) > 0 && (
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                  }}
                >
                  💡 Split preview: {newBillCents}¢ divided across {members.length} member
                  {members.length > 1 ? 's' : ''} ≈{' '}
                  {formatMoney(Math.floor(Number(newBillCents) / members.length))} base per share.
                  {Number(newBillCents) % members.length > 0 &&
                    ` (+1¢ extra to first ${Number(newBillCents) % members.length} member(s))`}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  isCreatingBill || !newBillTitle.trim() || !newBillCents || members.length === 0
                }
              >
                {isCreatingBill ? 'Splitting Bill...' : 'Create & Split Bill'}
              </button>
            </form>
          </section>

          {/* Bills and Shares Section */}
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Bills & Shares</h2>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '4px 12px' }}
                onClick={() => loadHomeDetails(selectedHomeId)}
              >
                Refresh
              </button>
            </div>

            {bills.length === 0 ? (
              <div className="card state-box">
                <h4>No bills yet</h4>
                <p style={{ marginTop: 6, fontSize: '0.9rem' }}>
                  No bills have been split for this home yet. Use the form above to add your first
                  bill.
                </p>
              </div>
            ) : (
              bills.map((bill) => {
                const totalPaid = bill.shares.filter((s) => s.paidAt !== null).length
                const allPaid = totalPaid === bill.shares.length

                return (
                  <div key={bill.id} className="bill-card">
                    <div className="bill-header">
                      <div>
                        <div className="bill-title">{bill.title}</div>
                        <div
                          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}
                        >
                          Created {formatDate(bill.createdAt)} • {totalPaid} of {bill.shares.length}{' '}
                          shares settled
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="bill-total">{formatMoney(bill.totalCents)}</span>
                        {allPaid ? (
                          <span className="badge badge-paid">Fully Settled</span>
                        ) : (
                          <span className="badge badge-unpaid">Pending</span>
                        )}
                      </div>
                    </div>

                    <table className="shares-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Share Amount</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.shares.map((share) => {
                          const isPaid = share.paidAt !== null
                          const isPaying = payingShareId === share.id
                          const memberName =
                            share.memberName ||
                            members.find((m) => m.id === share.memberId)?.name ||
                            'Member'

                          return (
                            <tr key={share.id}>
                              <td>
                                <strong>{memberName}</strong>
                              </td>
                              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatMoney(share.amountCents)}
                              </td>
                              <td>
                                {isPaid ? (
                                  <span className="badge badge-paid">
                                    Paid ({formatDate(share.paidAt)})
                                  </span>
                                ) : (
                                  <span className="badge badge-unpaid">Unpaid</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {isPaid ? (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    ✓ Settled
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-pay"
                                    disabled={isPaying}
                                    onClick={() => handlePayShare(bill.id, share.id)}
                                  >
                                    {isPaying ? 'Processing...' : 'Pay Share'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })
            )}
          </section>
        </>
      )}
    </div>
  )
}
