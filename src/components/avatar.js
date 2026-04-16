import { useEffect, useRef, useCallback } from 'react'
import { useGLTF } from '@react-three/drei'

import { 
    animateBody, 
    animateFace, 
    animateHand, 
    rotateHead, 
    resetBlendshapes, 
    resetRotations 
} from '@/utils/solver'

export function resetFace(headBones, defaultHeadQuats, meshes) {
    resetBlendshapes(meshes)
    resetRotations(headBones, defaultHeadQuats)
}

export function resetBody(bodyBones, defaultBodyQuats) {
    resetRotations(bodyBones, defaultBodyQuats)
}

export function resetLegs(legBones, defaultLegQuats) {
    resetRotations(legBones, defaultLegQuats)
}

export function resetHands(lHandBones, rHandBones, defaultLHandQuats, defaultRHandQuats) {
    resetRotations(lHandBones, defaultLHandQuats)
    resetRotations(rHandBones, defaultRHandQuats)
}


export default function Avatar({ avatarUrl, userFace, userBody, userLHand, userRHand, legsVisible, trackLegs }) {
    const avatarRef = useRef(null)
    const { nodes, _ } = useGLTF(avatarUrl)

    const headBones = useRef([nodes.Head, nodes.Neck, nodes.Spine2])
    const bodyBones = useRef([
        nodes.Spine, nodes.Spine1, 
        nodes.RightArm, nodes.RightForeArm, nodes.RightHand, 
        nodes.LeftArm, nodes.LeftForeArm, nodes.LeftHand
    ])
    const legBones = useRef([
        nodes.RightUpLeg, nodes.RightLeg, nodes.RightFoot,
        nodes.LeftUpLeg, nodes.LeftLeg, nodes.LeftFoot
    ])
    const lHandBonesRef = useRef([])
    const rHandBonesRef = useRef([])
    const meshesRef = useRef([nodes.EyeLeft, nodes.EyeRight, nodes.Wolf3D_Head, nodes.Wolf3D_Teeth])

    const defaultHeadQuats = useRef([])
    const defaultBodyQuats = useRef([])
    const defaultLHandQuats = useRef([])
    const defaultRHandQuats = useRef([])
    const defaultLegQuats = useRef([])

    useEffect(() => {
        headBones.current = [nodes.Head, nodes.Neck, nodes.Spine2]
        bodyBones.current = [
            nodes.Spine, nodes.Spine1, 
            nodes.RightArm, nodes.RightForeArm, nodes.RightHand, 
            nodes.LeftArm, nodes.LeftForeArm, nodes.LeftHand
        ]
        legBones.current = [
            nodes.RightUpLeg, nodes.RightLeg, nodes.RightFoot,
            nodes.LeftUpLeg, nodes.LeftLeg, nodes.LeftFoot
        ]
        lHandBonesRef.current = []
        rHandBonesRef.current = []

        const getHandBones = (bone, handBones) => {
            for (const child of bone.children) {
                handBones.push(child)
                getHandBones(child, handBones)
            }
        }

        getHandBones(nodes.LeftHand, lHandBonesRef.current)
        getHandBones(nodes.RightHand, rHandBonesRef.current)

        if (defaultHeadQuats.current.length === 0) {
            defaultHeadQuats.current = headBones.current.map(bone => bone.quaternion.clone())
        }

        if (defaultBodyQuats.current.length === 0) {
            defaultBodyQuats.current = bodyBones.current.map(bone => bone.quaternion.clone())
        }

        if (defaultLHandQuats.current.length === 0) {
            const getDefaultHandQuats = (bone, defaultHandQuats) => {
                for (const child of bone.children) {
                    defaultHandQuats.push(child.quaternion.clone())
                    getDefaultHandQuats(child, defaultHandQuats)
                }
            }
            getDefaultHandQuats(nodes.LeftHand, defaultLHandQuats.current)
        }

        if (defaultRHandQuats.current.length === 0) {
            const getDefaultHandQuats = (bone, defaultHandQuats) => {
                for (const child of bone.children) {
                    defaultHandQuats.push(child.quaternion.clone())
                    getDefaultHandQuats(child, defaultHandQuats)
                }
            }
            getDefaultHandQuats(nodes.RightHand, defaultRHandQuats.current)
        }

        if (defaultLegQuats.current.length === 0) {
            defaultLegQuats.current = legBones.current.map(bone => bone.quaternion.clone())
        }
    }, [nodes])

    useEffect(() => {
        if (userFace) {
            if (userFace.faceBlendshapes && userFace.faceBlendshapes.length > 0) {
                animateFace(meshesRef.current, userFace.faceBlendshapes[0].categories)
            }

            if (userFace.facialTransformationMatrixes && userFace.facialTransformationMatrixes.length > 0) {
                rotateHead(headBones.current, userFace.facialTransformationMatrixes[0].data)
            }
        }

        if (userBody) {
            animateBody(bodyBones.current, legBones.current, userBody, legsVisible, trackLegs, defaultLegQuats.current)
        }

        if (userLHand) {
            animateHand(nodes.RightHand, userLHand, 'Left')
        }

        if (userRHand) {
            animateHand(nodes.LeftHand, userRHand, 'Right')
        }
    }, [userFace, userBody, userLHand, userRHand, nodes, legsVisible, trackLegs])

    return (
        <primitive object={nodes.Scene} />
    )
}
