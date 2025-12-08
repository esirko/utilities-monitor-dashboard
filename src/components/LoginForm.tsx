import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lightning, Database } from '@phosphor-icons/react'
import { api, ApiError } from '@/lib/api'

interface LoginFormProps {
  onLoginSuccess: () => void
  onDemoMode: () => void
}

export function LoginForm({ onLoginSuccess, onDemoMode }: LoginFormProps) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)
  const [storedUsername, setStoredUsername] = useState<string | null>(null)
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(true)
  const onLoginSuccessRef = useRef(onLoginSuccess)

  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess
  }, [onLoginSuccess])

  useEffect(() => {
    let isMounted = true

    const checkStoredCredentials = async () => {
      setIsCheckingCredentials(true)
      try {
        const authStatus = await api.checkBackendAuth()
        if (!isMounted) {
          return
        }
        setHasStoredCredentials(authStatus.hasStoredCredentials ?? false)
        setStoredUsername(authStatus.username)

        if (authStatus.authenticated) {
          onLoginSuccessRef.current()
        }
      } catch (err) {
        console.error('Failed to check for stored credentials:', err)
        if (!isMounted) {
          return
        }
        setHasStoredCredentials(false)
        setStoredUsername(null)
      } finally {
        if (isMounted) {
          setIsCheckingCredentials(false)
        }
      }
    }

    checkStoredCredentials()
    return () => {
      isMounted = false
    }
  }, [])

  const handleConnectWithStored = async () => {
    setError('')
    setIsLoading(true)

    try {
      const result = await api.connectWithStoredCredentials()
      if (result.success) {
        onLoginSuccess()
      } else {
        setError(result.message || 'Failed to connect with stored credentials')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to connect to server. Make sure the backend is running.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 rounded-lg bg-primary/20 border-2 border-primary">
            <Lightning weight="fill" className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Energy Monitor</h1>
            <p className="text-sm text-muted-foreground">Emporia Vue Login</p>
          </div>
        </div>

        {isCheckingCredentials ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Checking for stored credentials...</p>
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {hasStoredCredentials ? (
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <Database className="w-5 h-5 text-primary" weight="fill" />
                  <div className="text-sm text-muted-foreground">
                    Stored credentials{storedUsername ? ` for ${storedUsername}` : ''} detected.
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full h-auto py-3 flex-col gap-1"
                  onClick={handleConnectWithStored}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    'Connecting...'
                  ) : (
                    <>
                      <div>Connect with Stored Credentials</div>
                      {storedUsername && (
                        <div className="text-sm opacity-90">{storedUsername}</div>
                      )}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 mb-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Database className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Stored Emporia credentials were not found. Add <code className="font-mono text-xs">EMPORIA_USERNAME</code> and <code className="font-mono text-xs">EMPORIA_PASSWORD</code> to your <code className="font-mono text-xs">.env</code> file, then restart the backend.
                </p>
              </div>
            )}

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onDemoMode}
              disabled={isLoading}
            >
              View Demo
            </Button>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              <p>Demo mode lets you explore with simulated data.</p>
              <p className="mt-2">Update stored credentials and restart the backend to see your real Emporia Vue energy data.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
