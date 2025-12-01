import { NextRequest, NextResponse } from 'next/server'

const QT_LOGIN_URL = 'https://www.qtpod.com/QTLogin/Login'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password required' },
        { status: 400 }
      )
    }

    // Step 1: Get login page and initial cookies
    const loginPageResponse = await fetch('https://go.qttechnologies.com/Portal/Account/Login', {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    const initialCookies = loginPageResponse.headers.get('set-cookie')
    let cookieString = ''
    if (initialCookies) {
      cookieString = Array.isArray(initialCookies) ? initialCookies.join('; ') : initialCookies
    }

    // Step 2: Perform login with form data
    const formData = new URLSearchParams({
      'Email': username,
      'Password': password
    })

    const loginResponse = await fetch('https://go.qttechnologies.com/Portal/Account/Login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieString
      },
      body: formData.toString(),
      redirect: 'manual'
    })

    // Check if login was successful (should redirect)
    if (loginResponse.status === 302 || loginResponse.status === 200) {
      // Get login cookies
      const loginCookies = loginResponse.headers.get('set-cookie')
      let allCookies = cookieString

      if (loginCookies) {
        const cookieArray = Array.isArray(loginCookies) ? loginCookies : [loginCookies]
        const cookieParts = []

        for (const cookie of cookieArray) {
          const cookieValue = cookie.split(';')[0]
          cookieParts.push(cookieValue)
        }

        const existingParts = cookieString ? cookieString.split(';').map(c => c.trim()) : []
        const combinedParts = [...existingParts, ...cookieParts]
        allCookies = combinedParts.join('; ')
      }

      return NextResponse.json({
        success: true,
        message: 'Login successful',
        qtCookies: allCookies
      })
    } else {
      return NextResponse.json(
        { success: false, error: 'Login failed - invalid credentials' },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error('Login proxy error:', error)
    return NextResponse.json(
      { success: false, error: 'Login proxy error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}
