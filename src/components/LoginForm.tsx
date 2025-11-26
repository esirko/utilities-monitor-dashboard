import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lightning, Eye, EyeSlash, Database } from '@phosphor-icons/react'
import { api, ApiError } from '@/lib/api'

interface LoginFormProps {
  onLoginSuccess: () => void
  onDemoMode: () => void
}

export function LoginForm({ onLoginSuccess, onDemoMode }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)
  const [storedUsername, setStoredUsername] = useState<string | null>(null)
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(true)

  useEffect(() => {
    const checkStoredCredentials = async () => {
      setIsCheckingCredentials(true)
      try {
        const authStatus = await api.checkBackendAuth()
        setHasStoredCredentials(authStatus.hasStoredCredentials || false)
        setStoredUsername(authStatus.username)
      } catch (error) {
        console.error('Failed to check for stored credentials:', error)
        setHasStoredCredentials(false)
        setStoredUsername(null)
      } finally {
        setIsCheckingCredentials(false)
      }
    }
    
    checkStoredCredentials()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await api.login(username, password)
      onLoginSuccess()
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
            {hasStoredCredentials && (
              <div className="mb-6">
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleConnectWithStored}
                  disabled={isLoading}
                >
                  <Database className="w-4 h-4 mr-2" />
                  {isLoading ? 'Connecting...' : `Connect with Stored Credentials${storedUsername ? ` (${storedUsername})` : ''}`}
                </Button>
                
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or enter new credentials</span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your Emporia Vue username"
              required
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeSlash className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Connecting...' : 'Connect to Emporia Vue'}
          </Button>
          
          <div className="relative my-4">
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
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <p>Demo mode lets you explore with simulated data.</p>
          <p className="mt-2">Connect to see your real Emporia Vue energy data.</p>
        </div>
          </>
        )}
      </Card>
    </div>
  )
}
