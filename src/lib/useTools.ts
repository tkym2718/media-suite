import { useCallback, useEffect, useState } from 'react'
import type { ToolsReport } from '../types'

export function useTools() {
  const [tools, setTools] = useState<ToolsReport | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const report = await window.api.checkTools()
      setTools(report)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setPath = useCallback(
    async (name: 'ffmpeg' | 'ffprobe' | 'yt-dlp') => {
      const picked = await window.api.pickBinary()
      if (picked) {
        await window.api.setToolPath(name, picked)
        await refresh()
      }
    },
    [refresh],
  )

  return { tools, loading, refresh, setPath }
}
