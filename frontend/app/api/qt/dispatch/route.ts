import { NextRequest, NextResponse } from 'next/server'

const QT_DISPATCH_URL = 'https://go.qttechnologies.com/Portal/Dispatch/GetDispatchDetail'

export async function POST(request: NextRequest) {
  try {
    const { CompanyLocationID, UserID } = await request.json()
    const qtCookies = request.headers.get('QT-Cookies') || ''

    if (!CompanyLocationID || !UserID) {
      return NextResponse.json(
        { success: false, error: 'CompanyLocationID and UserID required' },
        { status: 400 }
      )
    }

    if (!qtCookies) {
      return NextResponse.json(
        { success: false, error: 'QT authentication cookies required' },
        { status: 401 }
      )
    }

    // Make request to QT dispatch API with proper headers
    const response = await fetch(QT_DISPATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Origin': 'https://go.qttechnologies.com',
        'Pragma': 'no-cache',
        'Referer': 'https://go.qttechnologies.com/Portal/Dispatch/ListDispatch?view=tab',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': qtCookies
      },
      body: JSON.stringify({
        CompanyLocationID,
        UserID,
      }),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { success: false, error: 'Authentication failed - please login again' },
          { status: 401 }
        )
      }
      throw new Error(`QT API returned status ${response.status}`)
    }

    const data = await response.json()

    // Pass through the QT API response
    return NextResponse.json(data)
  } catch (error) {
    console.error('QT Dispatch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
