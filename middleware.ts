import { NextRequest, NextResponse } from 'next/server'

const USER = process.env.APP_USER || 'conexion'
const PASS = process.env.APP_PASS || 'conexion2026'

export function middleware(req: NextRequest) {
  const authHeader = req.headers.get('authorization')

  if (!authHeader) {
    return new NextResponse('Auth required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"'
      }
    })
  }

  const base64Credentials = authHeader.split(' ')[1]
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
  const [username, password] = credentials.split(':')

  if (username === USER && password === PASS) {
    return NextResponse.next()
  }

  return new NextResponse('Access denied', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"'
    }
  })
}

export const config = {
  matcher: '/:path*'
}
