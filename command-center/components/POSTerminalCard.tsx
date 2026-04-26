'use client'

import { useState } from 'react'
import {
  RefreshCw, Wifi, WifiOff, Activity, ChevronDown, RotateCcw, Zap, Loader2
} from 'lucide-react'
import { POSStatus } from '@/lib/useCommandCenter'

type Props = {
  terminal: POSStatus
  onTriggerSync: (pos_id: string, sync_type: string) => void
  onPing: (pos_id: string) => void
  onReload: (pos_id: string) => void
}

const SYNC_TYPES = [
  { value: 'all',       label: 'All Data' },
  { value: 'products',  label: 'Products' },
  { value: 'stock',     label: 'Stock' },
  { value: 'pricelist', label: 'Pricelist' },
]

function time_ago(iso?: string): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 5)  return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function POSTerminalCard({ terminal, onTriggerSync, onPing, onReload }: Props) {
  const [sync_type, setSyncType] = useState('all')
  const [show_menu, setShowMenu] = useState(false)
  const is_online = terminal.status === 'online'
  const is_syncing = terminal.sync_status === 'syncing'

  return (
    <div className={`relative rounded-xl border p-5 flex flex-col gap-4 transition-all duration-300
      ${is_online
        ? 'bg-slate-800 border-slate-600 shadow-lg shadow-slate-900/50'
        : 'bg-slate-900 border-slate-700 opacity-70'}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-100 text-lg leading-tight">{terminal.pos_name}</h3>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{terminal.pos_id}</p>
        </div>
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
          ${is_online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {is_online ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}
          {is_online ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-700/50 rounded-lg px-3 py-2">
          <p className="text-slate-500 mb-0.5">Last Seen</p>
          <p className="text-slate-300 font-medium">{time_ago(terminal.last_seen)}</p>
        </div>
        <div className="bg-slate-700/50 rounded-lg px-3 py-2">
          <p className="text-slate-500 mb-0.5">Last Sync</p>
          <p className="text-slate-300 font-medium">{time_ago(terminal.last_sync)}</p>
        </div>
      </div>

      {/* Sync progress */}
      {is_syncing && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin"/>
              {terminal.sync_message || 'Syncing…'}
            </span>
            <span className="text-slate-400">{terminal.sync_progress ?? 0}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${terminal.sync_progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Sync status badge (not syncing) */}
      {!is_syncing && terminal.sync_status && terminal.sync_status !== 'idle' && (
        <div className={`flex items-center gap-1.5 text-xs
          ${terminal.sync_status === 'complete' ? 'text-emerald-400'
          : terminal.sync_status === 'error'    ? 'text-red-400'
          : 'text-slate-400'}`}>
          <Activity className="w-3.5 h-3.5"/>
          {terminal.sync_status === 'complete' ? 'Last sync completed'
         : terminal.sync_status === 'error'    ? `Error: ${terminal.sync_message}`
         : 'Idle'}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {/* Sync trigger with dropdown */}
        <div className="flex flex-1 gap-0">
          <button
            disabled={!is_online || is_syncing}
            onClick={() => onTriggerSync(terminal.pos_id, sync_type)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500
              disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
              text-white text-sm font-medium rounded-l-lg px-3 py-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${is_syncing ? 'animate-spin' : ''}`}/>
            Sync {sync_type !== 'all' ? sync_type : ''}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!show_menu)}
              disabled={!is_online || is_syncing}
              className="h-full bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:cursor-not-allowed
                text-white rounded-r-lg px-2 border-l border-blue-500 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5"/>
            </button>
            {show_menu && (
              <div className="absolute right-0 bottom-full mb-1 bg-slate-700 border border-slate-600
                rounded-lg shadow-xl z-20 overflow-hidden min-w-[130px]">
                {SYNC_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => { setSyncType(t.value); setShowMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-600 transition-colors
                      ${sync_type === t.value ? 'text-blue-400 bg-slate-600' : 'text-slate-200'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ping */}
        <button
          disabled={!is_online}
          onClick={() => onPing(terminal.pos_id)}
          title="Ping terminal"
          className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed
            text-slate-300 rounded-lg transition-colors"
        >
          <Zap className="w-4 h-4"/>
        </button>

        {/* Reload */}
        <button
          disabled={!is_online}
          onClick={() => onReload(terminal.pos_id)}
          title="Reload POS browser"
          className="p-2 bg-slate-700 hover:bg-amber-600/70 disabled:opacity-40 disabled:cursor-not-allowed
            text-slate-300 rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4"/>
        </button>
      </div>
    </div>
  )
}
