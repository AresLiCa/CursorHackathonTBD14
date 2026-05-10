"use client"

import { useState, useCallback } from "react"
import { Flame, Activity, Shield, RefreshCw, Settings, Power, RotateCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { fetchUsageData } from "@/lib/usage"

export default function BurnWatchDashboard() {
  const [tokensUsed, setTokensUsed] = useState(10)
  const [tokenLimit, setTokenLimit] = useState(100)
  const [tempLimit, setTempLimit] = useState("100")
  const [isKilled, setIsKilled] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const percentage = Math.min((tokensUsed / tokenLimit) * 100, 100)

  const getStatus = () => {
    if (percentage < 50) return { label: "Safe", color: "bg-success text-success-foreground" }
    if (percentage < 80) return { label: "Warning", color: "bg-warning text-warning-foreground" }
    return { label: "Critical", color: "bg-destructive text-destructive-foreground" }
  }

  const status = getStatus()

  const handleRefresh = useCallback(async () => {
    if (isKilled) return

    setIsRefreshing(true)
    setRefreshError(null)

    try {
      const data = await fetchUsageData()
      setTokensUsed(data.usage)
    } catch {
      setRefreshError("Could not refresh usage. Please try again.")
    } finally {
      setIsRefreshing(false)
    }
  }, [isKilled])

  const handleSaveLimit = () => {
    const newLimit = parseInt(tempLimit, 10)
    if (newLimit > 0) {
      setTokenLimit(newLimit)
      setDialogOpen(false)
    }
  }

  const getProgressColor = () => {
    if (percentage < 50) return "[&>div]:bg-success"
    if (percentage < 80) return "[&>div]:bg-warning"
    return "[&>div]:bg-destructive"
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Flame className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">BurnWatch</h1>
              <p className="text-sm text-muted-foreground">AI Agent Token Burn Guard</p>
            </div>
          </div>

          {isKilled ? (
            <Badge variant="destructive" className="flex items-center gap-1.5 px-3 py-1">
              <Shield className="h-3.5 w-3.5" />
              <span>HALTED</span>
            </Badge>
          ) : (
            <Badge className="flex items-center gap-1.5 bg-success/20 text-success border-success/30 px-3 py-1">
              <Activity className="h-3.5 w-3.5" />
              <span>ACTIVE</span>
            </Badge>
          )}
        </header>

        {/* Usage Card */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-muted-foreground">Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-4xl font-bold text-foreground">
              Tokens used: <span className="text-primary">{tokensUsed.toLocaleString()}</span>
            </div>
            {refreshError && (
              <p className="text-sm font-medium text-destructive">{refreshError}</p>
            )}
          </CardContent>
        </Card>

        {/* Budget Card */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium text-muted-foreground">Budget</CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Set limit</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Set Token Limit</DialogTitle>
                  <DialogDescription>
                    Enter the maximum number of tokens for this session.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    type="number"
                    value={tempLimit}
                    onChange={(e) => setTempLimit(e.target.value)}
                    placeholder="Enter token limit"
                    className="bg-secondary border-border"
                    min={1}
                  />
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveLimit}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold text-foreground">
              {tokensUsed.toLocaleString()} / {tokenLimit.toLocaleString()} <span className="text-lg font-normal text-muted-foreground">tokens</span>
            </div>

            <Progress value={percentage} className={`h-3 ${getProgressColor()}`} />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{percentage.toFixed(1)}% used</span>
              <Badge className={status.color}>{status.label}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex gap-3">
          <Button
            onClick={handleRefresh}
            disabled={isKilled || isRefreshing}
            className="flex-1"
            variant="secondary"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh Usage"}
          </Button>

          {isKilled ? (
            <Button
              onClick={() => setIsKilled(false)}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Resume
            </Button>
          ) : (
            <Button
              onClick={() => setIsKilled(true)}
              variant="destructive"
              className="flex-1"
            >
              <Power className="mr-2 h-4 w-4" />
              Kill Switch
            </Button>
          )}
        </div>

        {/* Halted Message */}
        {isKilled && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="py-4 text-center">
              <p className="text-destructive font-medium">
                All AI agent operations have been halted. Token burn is frozen.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
