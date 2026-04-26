'use client'

import { useMemo, useState } from 'react'
import { Wifi, WifiOff, Server, RefreshCw, MonitorCheck } from 'lucide-react'
import { useCommandCenter } from '@/lib/useCommandCenter'
import POSTerminalCard from '@/components/POSTerminalCard'
import ActivityLog from '@/components/ActivityLog'

export default function DashboardPage() {
  const { terminals, logs, connected, triggerSync, pingPos, reloadPos, clearLogs } = useCommandCenter()
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')

  const terminal_list = useMemo(() => {
    const all = Array.from(terminals.values())
    if (filter === 'online')  return all.filter(t => t.status === 'online')
    if (filter === 'offline') return all.filter(t => t.status === 'offline')
    return all
  }, [terminals, filter])

  const online_count  = useMemo(() => Array.from(terminals.values()).filter(t => t.status === 'online').length,  [terminals])
  const offline_count = useMemo(() => Array.from(terminals.values()).filter(t => t.status === 'offline').length, [terminals])
  const syncing_count = useMemo(() => Array.from(terminals.values()).filter(t => t.sync_status === 'syncing').length, [terminals])

  function sync_all() {
    terminals.forEach(t => {
      if (t.status === 'online') triggerSync(t.pos_id, 'all')
    })
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">

      {/* ── Top Nav ── */}
      <header className="border-b border-slate-700 bg-slate-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MonitorCheck className="w-6 h-6 text-blue-400"/>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">POS Command Center</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium
              ${connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400 animate-pulse'}`}>
              {connected
                ? <><Wifi className="w-3 h-3"/> Connected</>
                : <><WifiOff className="w-3 h-3"/> Reconnecting…</>}
            </span>
            <button
              onClick={sync_all}
              disabled={online_count === 0}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700
                disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium
                px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4"/>
              Sync All Online
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Online',   value: online_count,  color: 'text-emerald-400', icon: <Wifi className="w-5 h-5"/> },
            { label: 'Offline',  value: offline_count, color: 'text-red-400',     icon: <WifiOff className="w-5 h-5"/> },
            { label: 'Syncing',  value: syncing_count, color: 'text-blue-400',    icon: <RefreshCw className="w-5 h-5 animate-spin"/>},
          ].map(s => (
            <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 flex items-center gap-4">
              <span className={s.color}>{s.icon}</span>
              <div>
                <p className="text-2xl font-bold text-slate-100">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label} Terminals</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Content ── */}
        <div className="flex gap-6 flex-1 min-h-0">

          {/* Left: terminal cards */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 p-1 rounded-lg w-fit">
              {(['all', 'online', 'offline'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors
                    ${filter === f
                      ? 'bg-slate-600 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Cards */}
            {terminal_list.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 text-slate-600 py-20">
                <Server className="w-12 h-12"/>
                <p className="text-sm">
                  {terminals.size === 0
                    ? 'No POS terminals connected yet. Enable WebSocket Monitor on a POS config.'
                    : `No ${filter} terminals.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pb-4">
                {terminal_list.map(t => (
                  <POSTerminalCard
                    key={t.pos_id}
                    terminal={t}
                    onTriggerSync={triggerSync}
                    onPing={pingPos}
                    onReload={reloadPos}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: activity log */}
          <div className="w-80 flex-shrink-0 flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <ActivityLog logs={logs} onClear={clearLogs}/>
          </div>
        </div>

      </main>
    </div>
  )
}
