// Server-side QT Technologies session, ported from Minuteman's api/dispatch.js.
//
// QT's GetDispatchDetail needs an authenticated session cookie again, and a bare login is not
// enough: QT only activates the session once the portal home and the dispatch list page have been
// loaded in it, as a browser would before firing its AJAX refresh. Credentials never leave the
// server. The cookie is cached in memory (Railway runs one long-lived Node process, so no table
// is needed) and refreshed on demand.

const QT_BASE = 'https://go.qttechnologies.com'
const QT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
const LIST_PAGE = `${QT_BASE}/Portal/Dispatch/ListDispatch?view=tab`

let cachedCookie: string | null = null
let loginInFlight: Promise<string> | null = null

// Merge Set-Cookie headers into a "k=v; k=v" string. getSetCookie() returns each header on its own;
// the comma-joined form breaks on Expires dates.
function mergeCookies(cookieString: string, response: Response): string {
  const setCookies = response.headers.getSetCookie?.() ?? []
  if (!setCookies.length) return cookieString

  const jar = new Map<string, string>()
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }
  for (const setCookie of setCookies) {
    const pair = setCookie.split(';')[0]
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ')
}

async function qtLogin(): Promise<string> {
  const { QT_USERNAME, QT_PASSWORD } = process.env
  if (!QT_USERNAME || !QT_PASSWORD) {
    throw new Error('QT_USERNAME/QT_PASSWORD not configured - cannot refresh QT session')
  }

  const htmlHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': QT_USER_AGENT
  }

  const loginPage = await fetch(`${QT_BASE}/Portal/Account/Login`, { headers: htmlHeaders })
  let cookie = mergeCookies('', loginPage)

  const login = await fetch(`${QT_BASE}/Portal/Account/Login`, {
    method: 'POST',
    headers: {
      ...htmlHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie
    },
    body: new URLSearchParams({ Email: QT_USERNAME, Password: QT_PASSWORD }).toString(),
    redirect: 'manual'
  })
  if (login.status !== 302 && login.status !== 200) {
    throw new Error(`QT login failed with status ${login.status}`)
  }
  cookie = mergeCookies(cookie, login)

  const home = await fetch(`${QT_BASE}/Portal/`, {
    headers: { ...htmlHeaders, Cookie: cookie }
  })
  if (!home.ok) throw new Error(`QT portal home page failed to load with status ${home.status}`)
  cookie = mergeCookies(cookie, home)

  const list = await fetch(LIST_PAGE, {
    headers: { ...htmlHeaders, Cookie: cookie, Referer: `${QT_BASE}/Portal/` }
  })
  if (!list.ok) throw new Error(`QT dispatch list page failed to load with status ${list.status}`)
  return mergeCookies(cookie, list)
}

// Concurrent polls that all hit an expired session share one login rather than racing five each.
function refreshSession(): Promise<string> {
  loginInFlight ??= qtLogin()
    .then((cookie) => {
      cachedCookie = cookie
      return cookie
    })
    .finally(() => {
      loginInFlight = null
    })
  return loginInFlight
}

// QT answers an unauthenticated GetDispatchDetail with HTTP 200 and {"message":"Unauthorized"}, or
// sometimes a 200 with an empty / non-JSON body. Anything without a Success field is a rejection.
function isAuthFailure(data: unknown): boolean {
  return !data || typeof data !== 'object' || !('Success' in data)
}

async function callGetDispatchDetail(
  companyLocationId: string,
  userId: string,
  cookie: string | null
): Promise<{ ok: boolean; status: number; data: unknown; rawText: string }> {
  const response = await fetch(`${QT_BASE}/Portal/Dispatch/GetDispatchDetail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.8',
      'Cache-Control': 'no-cache',
      Origin: QT_BASE,
      Pragma: 'no-cache',
      Referer: LIST_PAGE,
      'User-Agent': QT_USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify({ CompanyLocationID: companyLocationId, UserID: userId }),
    cache: 'no-store'
  })

  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    // treated as an empty body below
  }
  let data: unknown = null
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      // non-JSON body: data stays null
    }
  }
  return { ok: response.ok, status: response.status, data, rawText }
}

export class QtError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** Fetch the QT dispatch list, logging in (and retrying once) if the session was rejected. */
export async function fetchQtDispatchDetail(): Promise<Record<string, unknown>> {
  const { QT_COMPANY_LOCATION_ID, QT_USER_ID } = process.env
  if (!QT_COMPANY_LOCATION_ID || !QT_USER_ID) {
    throw new QtError(
      'Server configuration incomplete - missing QT_COMPANY_LOCATION_ID/QT_USER_ID',
      500
    )
  }

  let result = await callGetDispatchDetail(QT_COMPANY_LOCATION_ID, QT_USER_ID, cachedCookie)
  if (!result.ok || isAuthFailure(result.data)) {
    console.error('QT auth failure on GetDispatchDetail, refreshing session. status=%d', result.status)
    let cookie: string
    try {
      cookie = await refreshSession()
    } catch (err) {
      throw new QtError(
        `QT session expired and re-login failed: ${err instanceof Error ? err.message : err}`,
        502
      )
    }
    result = await callGetDispatchDetail(QT_COMPANY_LOCATION_ID, QT_USER_ID, cookie)
    if (!result.ok || isAuthFailure(result.data)) {
      cachedCookie = null
      throw new QtError(
        'QT rejected the request even after re-login - check QT_USERNAME/QT_PASSWORD or contact QT support',
        502
      )
    }
  }
  return result.data as Record<string, unknown>
}
