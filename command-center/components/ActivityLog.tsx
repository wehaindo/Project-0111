'use client'

import { LogEntry } from '@/lib/useCommandCenter'
import { Trash2 } from 'lucide-react'

type Props = {
  logs: LogEntry[]
  onClear: () => void
}

const level_style: Record<LogEntry['level'], string> = {
  info:    'text-slate-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
  success: 'text-emerald-400',
}

const level_dot: Record<LogEntry['level'], string> = {
  info:    'bg-slate-500',
  warn:    'bg-amber-500',
  error:   'bg-red-500',
  success: 'bg-emerald-500',
}

export default function ActivityLog({ logs, onClear }: Props) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h2 className="font-semibold text-slate-200 text-sm">Activity Log</h2>
        <button
          onClick={onClear}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded-md transition-colors"
          title="Clear log"
        >
          <Trash2 className="w-4 h-4"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
        {logs.length === 0 && (
          <p className="text-slate-600 italic text-center mt-8">No activity yet…</p>
        )}
        {logs.map((entry) => (
          <div key={entry.id} className="flex gap-2 items-start">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${level_dot[entry.level]}`}/>
            <span className="text-slate-600 flex-shrink-0 w-16">{entry.time}</span>
            <span className={level_style[entry.level]}>{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
