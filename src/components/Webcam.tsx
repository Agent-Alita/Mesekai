import { useEffect, useRef, useState } from 'react'
import '@mediapipe/holistic'
import '@mediapipe/drawing_utils'
import '@mediapipe/camera_utils'
import type {
  Holistic as HolisticType,
  LandmarkConnectionArray,
  Results,
} from '@mediapipe/holistic'
import type { Camera as CameraType } from '@mediapipe/camera_utils'

// MediaPipe's npm packages are UMD/IIFE scripts that attach their exports to
// the global object rather than using real ES module exports. Pull the symbols
// off of window here.
type MediaPipeGlobals = {
  Holistic: new (config: { locateFile: (file: string) => string }) => HolisticType
  Camera: new (
    video: HTMLVideoElement,
    options: { onFrame: () => Promise<void>; width?: number; height?: number },
  ) => CameraType
  drawConnectors: (
    ctx: CanvasRenderingContext2D,
    landmarks: Results['poseLandmarks'] | undefined,
    connections: LandmarkConnectionArray,
    style?: { color?: string; lineWidth?: number },
  ) => void
  drawLandmarks: (
    ctx: CanvasRenderingContext2D,
    landmarks: Results['poseLandmarks'] | undefined,
    style?: { color?: string; lineWidth?: number; radius?: number },
  ) => void
  POSE_CONNECTIONS: LandmarkConnectionArray
  FACEMESH_CONTOURS: LandmarkConnectionArray
  HAND_CONNECTIONS: LandmarkConnectionArray
}

const mp = window as unknown as MediaPipeGlobals

const PIP_WIDTH = 320
const PIP_HEIGHT = 240
const CAM_WIDTH = 640
const CAM_HEIGHT = 480

function Webcam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false

    const holistic = new mp.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    })

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      refineFaceLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    const onResults = (results: Results) => {
      if (cancelled) return
      const { width, height } = canvas

      ctx.save()
      ctx.clearRect(0, 0, width, height)

      // Mirror horizontally for selfie view.
      ctx.translate(width, 0)
      ctx.scale(-1, 1)

      if (results.image) {
        ctx.drawImage(results.image, 0, 0, width, height)
      }

      mp.drawConnectors(ctx, results.poseLandmarks, mp.POSE_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: 2,
      })
      mp.drawLandmarks(ctx, results.poseLandmarks, {
        color: '#FF0000',
        lineWidth: 1,
        radius: 1,
      })

      mp.drawConnectors(ctx, results.faceLandmarks, mp.FACEMESH_CONTOURS, {
        color: '#C0C0C070',
        lineWidth: 0.5,
      })

      mp.drawConnectors(ctx, results.leftHandLandmarks, mp.HAND_CONNECTIONS, {
        color: '#CC0000',
        lineWidth: 2,
      })
      mp.drawLandmarks(ctx, results.leftHandLandmarks, {
        color: '#00FF00',
        lineWidth: 1,
        radius: 1,
      })

      mp.drawConnectors(ctx, results.rightHandLandmarks, mp.HAND_CONNECTIONS, {
        color: '#00CC00',
        lineWidth: 2,
      })
      mp.drawLandmarks(ctx, results.rightHandLandmarks, {
        color: '#FF0000',
        lineWidth: 1,
        radius: 1,
      })

      ctx.restore()
    }

    holistic.onResults(onResults)

    const camera = new mp.Camera(video, {
      onFrame: async () => {
        if (cancelled) return
        await holistic.send({ image: video })
      },
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
    })

    camera.start().catch((err: unknown) => {
      console.error('Failed to start webcam:', err)
      setError('Camera unavailable')
    })

    return () => {
      cancelled = true
      camera.stop().catch(() => {})
      holistic.close().catch(() => {})
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.15)',
        background: '#000',
        zIndex: 10,
      }}
    >
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        width={PIP_WIDTH}
        height={PIP_HEIGHT}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

export default Webcam
