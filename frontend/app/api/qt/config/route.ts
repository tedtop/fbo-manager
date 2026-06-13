import { NextResponse } from 'next/server'

export async function GET() {
  // Return QT configuration from environment variables
  const config = {
    username: process.env.QT_USERNAME,
    password: process.env.QT_PASSWORD,
    companyLocationId: process.env.QT_COMPANY_LOCATION_ID,
    userId: process.env.QT_USER_ID,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  }

  // Check if all required credentials are present
  if (!config.username || !config.password || !config.companyLocationId || !config.userId) {
    return NextResponse.json(
      { error: 'QT credentials not configured in environment variables' },
      { status: 500 }
    )
  }

  return NextResponse.json(config)
}
