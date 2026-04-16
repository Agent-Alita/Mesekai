'use client'

import { Button, Dropdown, Radio, Space, Switch } from 'antd'
import { DownOutlined } from '@ant-design/icons'

import { Camera } from '@mediapipe/camera_utils'
import { DrawingUtils } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { Environment } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { AvatarCreator } from '@readyplayerme/react-avatar-creator'

import Avatar, { resetFace, resetBody, resetLegs, resetHands } from '@/components/avatar'
import CameraDisplay from '@/components/camera'
import Controls from '@/components/controls'
import { 
    CAM_WIDTH, CAM_HEIGHT, SCENES, DEFAULT_SCENE, 
    FULLBODY_LOOKAT, HALFBODY_LOOKAT, HEADONLY_LOOKAT, 
    LM_VIS_THRESH, lHIP, rHIP
} from '@/utils/constants'
import {
    createTrackers,
    drawFaceLandmarks,
    drawBodyLandmarks,
    drawHandLandmarks,
    filterBodyLandmarks,
    filterHandLandmarks,
    filterFaceLandmarks,
    createFilters
} from '@/utils/tracker'
import './globals.css'
import Social from '@/components/social'

function processFrame(frame, drawingUtils, setFaceLandmarks, setBodyLandmarks, setlHandLandmarks, setrHandLandmarks, setLegsVisible, trackFace, trackBody, trackHands, faceTracker, bodyTracker, handTracker, faceFilters, bodyFilters, lHandFilters, rHandFilters) {    
    if (trackFace) {
        const trackingResult = faceTracker.detectForVideo(frame, performance.now())
        
        const filteredFaceLandmarks = filterFaceLandmarks(trackingResult.faceLandmarks, faceFilters)
        setFaceLandmarks(filteredFaceLandmarks)

        drawFaceLandmarks(filteredFaceLandmarks, drawingUtils, CAM_HEIGHT / 1000)
    }

    if (trackBody) {
        const trackingResult = bodyTracker.detectForVideo(frame, performance.now())

        if (trackingResult.worldLandmarks && trackingResult.worldLandmarks.length > 0) {
            const landmarks = trackingResult.worldLandmarks[0]
            const filteredLandmarks = filterBodyLandmarks(landmarks, bodyFilters)
            setBodyLandmarks(filteredLandmarks)
            setLegsVisible(filteredLandmarks[lHIP].visibility > LM_VIS_THRESH && filteredLandmarks[rHIP].visibility > LM_VIS_THRESH)
        }

        drawBodyLandmarks(trackingResult.landmarks, drawingUtils, CAM_HEIGHT / 1000, CAM_HEIGHT / 500)
    }

    if (trackHands) {
        const trackingResult = handTracker.detectForVideo(frame, performance.now())
        
        for (let handIdx = 0; handIdx < trackingResult.handedness.length; handIdx++) {
            const handedness = trackingResult.handedness[handIdx][0]['categoryName']
            const landmarks = trackingResult.worldLandmarks[handIdx]
            const filteredLandmarks = filterHandLandmarks(landmarks, (handedness == 'Left') ? lHandFilters : rHandFilters)
            
            if (handedness == 'Left') {
                setlHandLandmarks(filteredLandmarks)
            } else {
                setrHandLandmarks(filteredLandmarks)
            }
        }

        drawHandLandmarks(trackingResult.landmarks, drawingUtils, CAM_HEIGHT / 1000, CAM_HEIGHT / 1000)
    }
}

export default function Home() {
    const [inMesekai, setInMesekai] = useState(true)
    const [avatarUrl, setAvatarUrl] = useState(
        'https://models.readyplayer.me/622952275de1ae64c9ebe969.glb?morphTargets=ARKit'
    )
    const [faceLandmarks, setFaceLandmarks] = useState(null)
    const [bodyLandmarks, setBodyLandmarks] = useState(null)
    const [lHandLandmarks, setlHandLandmarks] = useState(null)
    const [rHandLandmarks, setrHandLandmarks] = useState(null)
    const [legsVisible, setLegsVisible] = useState(false)
    const [trackLegs, setTrackLegs] = useState(true)
    const [scene, setScene] = useState(DEFAULT_SCENE)
    const [lookAt, setLookAt] = useState(FULLBODY_LOOKAT)
    const [trackFace, setTrackFace] = useState(true)
    const [trackBody, setTrackBody] = useState(true)
    const [trackHands, setTrackHands] = useState(true)
    const [trackersCreated, setTrackersCreated] = useState(false)
    const [faceTracker, setFaceTracker] = useState(null)
    const [bodyTracker, setBodyTracker] = useState(null)
    const [handTracker, setHandTracker] = useState(null)
    const [filters, setFilters] = useState(null)

    const video = useRef(null)
    const canvas = useRef(null)
    useEffect(() => {
        const canvasCtx = canvas.current.getContext('2d')
        const drawingUtils = new DrawingUtils(canvasCtx)
        let lastVideoTime = -1

        async function initializeTrackers() {
            try {
                const [ft, bt, ht] = await createTrackers()
                const newFilters = createFilters()
                setFilters(newFilters)
                setFaceTracker(ft)
                setBodyTracker(bt)
                setHandTracker(ht)
                setTrackersCreated(true)
            } catch (error) {
                console.error('Failed to initialize trackers:', error)
            }
        }

        const camera = new Camera(video.current, {
            onFrame: async () => {
                if (!trackersCreated) {
                    await initializeTrackers()
                    return
                }

                if (lastVideoTime != video.current.currentTime && faceTracker && bodyTracker && handTracker && filters) {
                    lastVideoTime = video.current.currentTime
                    canvasCtx.save()
                    canvasCtx.clearRect(0, 0, canvas.current.width, canvas.current.height)
                    processFrame(
                        video.current, drawingUtils, 
                        setFaceLandmarks, 
                        setBodyLandmarks, 
                        setlHandLandmarks, 
                        setrHandLandmarks, 
                        setLegsVisible,
                        trackFace,
                        trackBody,
                        trackHands,
                        faceTracker,
                        bodyTracker,
                        handTracker,
                        filters.faceFilters,
                        filters.bodyFilters,
                        filters.lHandFilters,
                        filters.rHandFilters
                    )
                    canvasCtx.restore()
                }
            },
            width: CAM_WIDTH,
            height: CAM_HEIGHT
        })
        camera.start()

        return function cleanup() {
            camera.stop()
            if (faceTracker) faceTracker.close()
            if (bodyTracker) bodyTracker.close()
            if (handTracker) handTracker.close()
            if (filters) {
                filters.faceFilters = null
                filters.bodyFilters = null
                filters.lHandFilters = null
                filters.rHandFilters = null
            }
        }
    }, [trackersCreated, trackFace, trackBody, trackHands, faceTracker, bodyTracker, handTracker, filters])

    return (
        <>
            <div
                hidden={!inMesekai}
                style={{
                    position: 'relative',
                    width: '100vw',
                    height: '100vh',
                }}
            >
                <CameraDisplay video={video} canvas={canvas}/>
                
                < Canvas
                    style={{
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                    }}
                >
                    <Avatar
                        avatarUrl={avatarUrl}
                        userFace={faceLandmarks}
                        userBody={bodyLandmarks}
                        userLHand={lHandLandmarks}
                        userRHand={rHandLandmarks}
                        legsVisible={legsVisible}
                        trackLegs={trackLegs}
                    />
                    <Environment preset={scene} background={true} />
                    <Controls lookAt={lookAt} />
                </Canvas>

                <Space direction='vertical' align='start'
                    style={{
                        position: 'absolute',
                        top: '1%',
                        left: '1%',
                    }}
                >
                    <Switch checkedChildren='Face' unCheckedChildren='Face' defaultChecked 
                        onChange={(checked) => {
                            setTrackFace(checked)
                            if (!checked) {
                                setFaceLandmarks(null)
                                resetFace()
                            }
                        }}
                    />
                    <Switch checkedChildren='Body' unCheckedChildren='Body' defaultChecked
                        onChange={(checked) => {
                            setTrackBody(checked)
                            if (checked) {
                                if (trackLegs) {
                                    setLookAt(FULLBODY_LOOKAT)
                                } else {
                                    setLookAt(HALFBODY_LOOKAT)
                                }
                            } else {
                                setBodyLandmarks(null)
                                resetBody()
                                resetLegs()
                                setLookAt(HEADONLY_LOOKAT)
                            }
                        }}
                    />
                    <Switch checkedChildren='Legs' unCheckedChildren='Legs' defaultChecked
                        checked={trackLegs && bodyLandmarks}
                        disabled={!bodyLandmarks}
                        onChange={(checked) => {
                            setTrackLegs(checked)
                            if (checked) {
                                setLookAt(FULLBODY_LOOKAT)
                            } else {
                                resetLegs()
                                setLookAt(HALFBODY_LOOKAT)
                            }
                        }}
                    />
                    <Switch checkedChildren='Hands' unCheckedChildren='Hands' defaultChecked
                        onChange={(checked) => {
                            setTrackHands(checked)
                            if (!checked) {
                                setlHandLandmarks(null)
                                setrHandLandmarks(null)
                                resetHands()
                            }
                        }}
                    />

                    <Dropdown
                        menu={{
                            items: SCENES,
                            selectable: true,
                            defaultSelectedKeys: [DEFAULT_SCENE],
                            onClick: (event) => {
                                setScene(event.key)
                            },
                        }}
                    >
                        <Button size='small' style={{ fontSize: '0.75em' }}>
                            <Space>
                                Scene
                                <DownOutlined />
                            </Space>
                        </Button>
                    </Dropdown>
                </Space>

                <Social />
            </div>

            {!inMesekai && (
                <AvatarCreator
                    subdomain='mesekai-ptasby'
                    config={{
                        bodyType: 'fullbody',
                        quickStart: true,
                        language: 'en',
                        clearCache: false,
                    }}
                    style={{
                        width: '100%',
                        height: '100vh',
                        border: 'none',
                    }}
                    onAvatarExported={(event) => {
                        setAvatarUrl(`${event.data.url}?morphTargets=ARKit`)
                        setInMesekai(true)
                    }}
                />
            )}

            <Radio.Group
                value={inMesekai}
                onChange={(event) => {
                    setInMesekai(event.target.value)
                }}
                size='large'
                style={{ position: 'absolute', bottom: '1%', left: '1%' }}
            >
                <Radio.Button value={true} style={{ width: '50%', fontFamily: 'Kristen ITC' }}>
                    Mesekai
                </Radio.Button>
                <Radio.Button value={false} style={{ width: '50%' }}>
                    Customize
                </Radio.Button>
            </Radio.Group>
        </>
    )
}
