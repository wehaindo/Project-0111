'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export type POSStatus = {
  pos_id: string
  pos_name: string
  session_id?: number
  status: 'online' | 'offline'
  last_seen?: string
  sync_status?: 'idle' | 'syncing' | 'complete' | 'error'
  sync_progress?: number
  sync_message?: string
  last_sync?: string
}

export type LogEntry = {
  id: string
  time: string
  level: 'info' | 'warn' | 'error' | 'success'
  text: string
}

type UseCommandCenterReturn = {
  terminals: Map<string, POSStatus>
  logs: LogEntry[]
  connected: boolean
  triggerSync: (pos_id: string, sync_type: string) => void
  pingPos: (pos_id: string) => void
  reloadPos: (pos_id: string) => void
  clearLogs: () => void
}

const WS_URL =
  (typeof window !== 'undefined' && (window as any).__WS_URL__) ||
  process.env.NEXT_PUBLIC_WS_URL ||
  'ws://localhost:8080'

export function useCommandCenter(): UseCommandCenterReturn {
  const ws = useRef<WebSocket | null>(null)
  const reconnect_timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [connected, setConnected] = useState(false)
  const [terminals, setTerminals] = useState<Map<string, POSStatus>>(new Map())
  const [logs, setLogs] = useState<LogEntry[]>([])

  const add_log = useCallback((level: LogEntry['level'], text: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).slice(2),
      time: new Date().toLocaleTimeString(),
      level,
      text,
    }
    setLogs((prev) => [entry, ...prev].slice(0, 200))
  }, [])

  const send = useCallback((data: object) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  const connect = useCallback(() => {
    if (reconnect_timer.current) clearTimeout(reconnect_timer.current)

    const socket = new WebSocket(WS_URL + '/dashboard')
    ws.current = socket

    socket.onopen = () => {
      setConnected(true)
      add_log('info', `Connected to WebSocket server at ${WS_URL}`)
      // Request current state
      socket.send(JSON.stringify({ type: 'get_all_pos' }))
    }

    socket.onmessage = (event) => {
      let msg: any
      try { msg = JSON.parse(event.data) } catch { return }

      if (msg.type === 'all_pos') {
        const map = new Map<string, POSStatus>()
        for (const t of (msg.terminals || [])) map.set(t.pos_id, t)
        setTerminals(map)
        add_log('info', `Loaded ${msg.terminals?.length ?? 0} terminal(s) from server`)
        return
      }

      if (msg.type === 'pos_update') {
        setTerminals((prev) => {
          const next = new Map(prev)
          next.set(msg.pos_id, msg as POSStatus)
          return next
        })

        if (msg.status === 'online' && !terminals.has(msg.pos_id)) {
          add_log('success', `${msg.pos_name || msg.pos_id} came online`)
        }
        if (msg.status === 'offline') {
          add_log('warn', `${msg.pos_name || msg.pos_id} went offline`)
        }
        if (msg.sync_status === 'complete') {
          add_log('success', `${msg.pos_name || msg.pos_id}: sync complete`)
        }
        if (msg.sync_status === 'error') {
          add_log('error', `${msg.pos_name || msg.pos_id}: sync error — ${msg.sync_message}`)
        }
        return
      }

      if (msg.type === 'ack') {
        add_log('info', `✓ ${msg.message}`)
        return
      }

      if (msg.type === 'error') {
        add_log('error', `✗ ${msg.message}`)
        return
      }
    }

    socket.onclose = () => {
      setConnected(false)
      add_log('warn', 'WebSocket disconnected — reconnecting in 5s …')
      reconnect_timer.current = setTimeout(connect, 5000)
    }

    socket.onerror = () => {
      add_log('error', 'WebSocket connection error')
    }
  }, [add_log]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connect()
    return () => {
      if (reconnect_timer.current) clearTimeout(reconnect_timer.current)
      if (ws.current) { ws.current.onclose = null; ws.current.close() }
    }
  }, [connect])

  const triggerSync = useCallback((pos_id: string, sync_type: string) => {
    send({ type: 'trigger_sync', pos_id, sync_type })
    add_log('info', `→ Trigger sync [${sync_type}] on ${pos_id}`)
  }, [send, add_log])

  const pingPos = useCallback((pos_id: string) => {
    send({ type: 'ping_pos', pos_id })
    add_log('info', `→ Ping sent to ${pos_id}`)
  }, [send, add_log])

  const reloadPos = useCallback((pos_id: string) => {
    send({ type: 'reload_pos', pos_id })
    add_log('warn', `→ Reload command sent to ${pos_id}`)
  }, [send, add_log])

  const clearLogs = useCallback(() => setLogs([]), [])

  return { terminals, logs, connected, triggerSync, pingPos, reloadPos, clearLogs }
}
