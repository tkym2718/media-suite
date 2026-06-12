import { useState } from 'react'
import type { Feature } from './types'
import { Launcher } from './features/Launcher'
import { MusicPlayer } from './features/music/MusicPlayer'
import { VideoViewer } from './features/video/VideoViewer'
import { ImageViewer } from './features/image/ImageViewer'

export default function App() {
  const [feature, setFeature] = useState<Feature>('home')
  const goHome = () => setFeature('home')

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans">
      {feature === 'home' && <Launcher onSelect={setFeature} />}
      {feature === 'music' && <MusicPlayer onHome={goHome} />}
      {feature === 'video' && <VideoViewer onHome={goHome} />}
      {feature === 'image' && <ImageViewer onHome={goHome} />}
    </div>
  )
}
