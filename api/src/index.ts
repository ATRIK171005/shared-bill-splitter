import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

// Health check endpoint
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Create a new home
app.post('/api/homes', async (c) => {
  let body: { name?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'Home name is required' }, 400)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()
  const createdAt = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, name, createdAt)
    .run()

  return c.json({ id, name }, 201)
})

// List all homes (used by the web interface)
app.get('/api/homes', async (c) => {
  const { results: homes } = await c.env.DB.prepare(
    'SELECT id, name, created_at as createdAt FROM homes ORDER BY rowid ASC',
  ).all<{ id: string; name: string; createdAt: string }>()

  return c.json({ homes })
})

// Get details of a single home including its members
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string; name: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const { results: members } = await c.env.DB.prepare(
    'SELECT id, home_id as homeId, name FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; name: string }>()

  return c.json({ ...home, members })
})

// Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: { name?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'Member name is required' }, 400)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()
  const createdAt = new Date().toISOString()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, name, createdAt)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Create and split a bill between home members
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: { title?: unknown; totalCents?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 422)
  }

  const { title, totalCents } = body

  if (
    typeof totalCents !== 'number' ||
    !Number.isInteger(totalCents) ||
    totalCents <= 0 ||
    !Number.isSafeInteger(totalCents)
  ) {
    return c.json({ error: 'totalCents must be a positive whole integer' }, 422)
  }

  if (typeof title !== 'string' || !title.trim()) {
    return c.json({ error: 'Title is required' }, 422)
  }

  // Members must be retrieved in exact insertion order
  const { results: members } = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<{ id: string; name: string }>()

  if (members.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const memberCount = members.length
  const baseAmount = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const billId = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  const shares = members.map((member, index) => {
    const extra = index < remainder ? 1 : 0
    return {
      id: crypto.randomUUID(),
      billId,
      memberId: member.id,
      amountCents: baseAmount + extra,
      paidAt: null,
    }
  })

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(billId, homeId, title.trim(), totalCents, createdAt),
  ]

  for (const share of shares) {
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO bill_shares (id, bill_id, member_id, amount_cents, paid_at, idempotency_key, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)',
      ).bind(share.id, billId, share.memberId, share.amountCents, createdAt),
    )
  }

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title: title.trim(),
      totalCents,
      shares: shares.map((s) => ({
        id: s.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        paidAt: null,
      })),
    },
    201,
  )
})

// Get bills of a home with all member shares
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const { results: bills } = await c.env.DB.prepare(
    'SELECT id, home_id as homeId, title, total_cents as totalCents, created_at as createdAt FROM bills WHERE home_id = ? ORDER BY rowid DESC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; title: string; totalCents: number; createdAt: string }>()

  const { results: allShares } = await c.env.DB.prepare(
    `SELECT s.id, s.bill_id as billId, s.member_id as memberId, m.name as memberName, s.amount_cents as amountCents, s.paid_at as paidAt
     FROM bill_shares s
     JOIN members m ON m.id = s.member_id
     JOIN bills b ON b.id = s.bill_id
     WHERE b.home_id = ?
     ORDER BY m.rowid ASC`,
  )
    .bind(homeId)
    .all<{
      id: string
      billId: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>()

  const sharesByBill = new Map<
    string,
    Array<{
      id: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>
  >()

  for (const share of allShares) {
    const list = sharesByBill.get(share.billId) || []
    list.push({
      id: share.id,
      memberId: share.memberId,
      memberName: share.memberName,
      amountCents: share.amountCents,
      paidAt: share.paidAt,
    })
    sharesByBill.set(share.billId, list)
  }

  const billsWithShares = bills.map((bill) => ({
    id: bill.id,
    homeId: bill.homeId,
    title: bill.title,
    totalCents: bill.totalCents,
    createdAt: bill.createdAt,
    shares: sharesByBill.get(bill.id) || [],
  }))

  return c.json({ bills: billsWithShares })
})

// Pay a share with idempotency protection
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const idempotencyKey = c.req.header('Idempotency-Key')
  if (!idempotencyKey?.trim()) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const trimmedKey = idempotencyKey.trim()
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  const share = await c.env.DB.prepare(
    'SELECT id, bill_id as billId, member_id as memberId, amount_cents as amountCents, paid_at as paidAt, idempotency_key as idempotencyKey FROM bill_shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<{
      id: string
      billId: string
      memberId: string
      amountCents: number
      paidAt: string | null
      idempotencyKey: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  // Already paid? Check idempotency key
  if (share.paidAt !== null) {
    if (share.idempotencyKey === trimmedKey) {
      return c.json(
        {
          id: share.id,
          memberId: share.memberId,
          amountCents: share.amountCents,
          paidAt: share.paidAt,
        },
        200,
      )
    }
    return c.json({ error: 'Share already paid with a different key' }, 409)
  }

  // Attempt atomic payment
  const paidAt = new Date().toISOString()
  const updateResult = await c.env.DB.prepare(
    'UPDATE bill_shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(paidAt, trimmedKey, shareId, billId)
    .run()

  if (updateResult.meta.changes === 1) {
    return c.json(
      {
        id: share.id,
        memberId: share.memberId,
        amountCents: share.amountCents,
        paidAt,
      },
      200,
    )
  }

  // If update affected 0 rows, another concurrent request paid it
  const freshShare = await c.env.DB.prepare(
    'SELECT id, member_id as memberId, amount_cents as amountCents, paid_at as paidAt, idempotency_key as idempotencyKey FROM bill_shares WHERE id = ?',
  )
    .bind(shareId)
    .first<{
      id: string
      memberId: string
      amountCents: number
      paidAt: string | null
      idempotencyKey: string | null
    }>()

  if (freshShare?.paidAt && freshShare.idempotencyKey === trimmedKey) {
    return c.json(
      {
        id: freshShare.id,
        memberId: freshShare.memberId,
        amountCents: freshShare.amountCents,
        paidAt: freshShare.paidAt,
      },
      200,
    )
  }

  return c.json({ error: 'Share already paid with a different key' }, 409)
})

// Outstanding balances for members of a home
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const { results: balances } = await c.env.DB.prepare(
    `SELECT 
       m.id AS memberId,
       m.name AS name,
       COALESCE((
         SELECT SUM(s.amount_cents)
         FROM bill_shares s
         JOIN bills b ON b.id = s.bill_id
         WHERE b.home_id = m.home_id AND s.member_id = m.id AND s.paid_at IS NULL
       ), 0) AS outstandingCents
     FROM members m
     WHERE m.home_id = ?
     ORDER BY m.rowid ASC`,
  )
    .bind(homeId)
    .all<{ memberId: string; name: string; outstandingCents: number }>()

  return c.json({
    balances: balances.map((b) => ({
      memberId: b.memberId,
      name: b.name,
      outstandingCents: Number(b.outstandingCents),
    })),
  })
})

// Fallbacks for 404 and unhandled errors
app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error('Unhandled server error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
