import * as THREE from 'three'
import type { NormalizedLandmark, NormalizedLandmarkList, Results } from '@mediapipe/holistic'

// ─── Types ─────────────────────────────────────────────────────────────────
export type BoneMap = Map<string, THREE.Bone>

export interface RestInfo {
  /** Unit direction from bone to child, expressed in the bone's OWN local frame. */
  restDirBoneLocal: THREE.Vector3
  /** Bone's world quaternion at bind time. Needed by basis-aim helpers. */
  bindWorldQuat: THREE.Quaternion
}

export type RestMap = Map<string, RestInfo>

export interface ApplyPoseOptions {
  slerp: number
  visibilityThreshold: number
}

// ─── Bone relationships (child used to define rest direction) ──────────────
// For a bone B, childBoneName[B] is the bone whose origin defines B's "forward"
// direction in bind pose. We rotate B so that that forward direction points at
// the target landmark.
const CHILD_BONE: Record<string, string> = {
  Hips: 'Spine',
  Spine: 'Spine1',
  Spine1: 'Spine2',
  Spine2: 'Neck',
  Neck: 'Head',

  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',

  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',

  // Fingers — left hand
  LeftHandThumb1: 'LeftHandThumb2',
  LeftHandThumb2: 'LeftHandThumb3',
  LeftHandThumb3: 'LeftHandThumb4',
  LeftHandIndex1: 'LeftHandIndex2',
  LeftHandIndex2: 'LeftHandIndex3',
  LeftHandIndex3: 'LeftHandIndex4',
  LeftHandMiddle1: 'LeftHandMiddle2',
  LeftHandMiddle2: 'LeftHandMiddle3',
  LeftHandMiddle3: 'LeftHandMiddle4',
  LeftHandRing1: 'LeftHandRing2',
  LeftHandRing2: 'LeftHandRing3',
  LeftHandRing3: 'LeftHandRing4',
  LeftHandPinky1: 'LeftHandPinky2',
  LeftHandPinky2: 'LeftHandPinky3',
  LeftHandPinky3: 'LeftHandPinky4',

  // Fingers — right hand
  RightHandThumb1: 'RightHandThumb2',
  RightHandThumb2: 'RightHandThumb3',
  RightHandThumb3: 'RightHandThumb4',
  RightHandIndex1: 'RightHandIndex2',
  RightHandIndex2: 'RightHandIndex3',
  RightHandIndex3: 'RightHandIndex4',
  RightHandMiddle1: 'RightHandMiddle2',
  RightHandMiddle2: 'RightHandMiddle3',
  RightHandMiddle3: 'RightHandMiddle4',
  RightHandRing1: 'RightHandRing2',
  RightHandRing2: 'RightHandRing3',
  RightHandRing3: 'RightHandRing4',
  RightHandPinky1: 'RightHandPinky2',
  RightHandPinky2: 'RightHandPinky3',
  RightHandPinky3: 'RightHandPinky4',
}

// ─── MediaPipe landmark indices ────────────────────────────────────────────
// Pose (world landmarks)
const P = {
  NOSE: 0,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const

// Finger chains per hand: MediaPipe landmark indices that correspond to
// consecutive joints along a finger, and the corresponding Mixamo bones.
// The chain [a,b,c,d] means bone1 is rotated to point at b-a, bone2 at c-b,
// bone3 at d-c. Tip bones (…4) are left identity.
interface FingerChain {
  boneNames: [string, string, string]
  landmarks: [number, number, number, number]
}

function makeFingerChains(side: 'Left' | 'Right'): FingerChain[] {
  return [
    {
      boneNames: [`${side}HandThumb1`, `${side}HandThumb2`, `${side}HandThumb3`],
      landmarks: [1, 2, 3, 4],
    },
    {
      boneNames: [`${side}HandIndex1`, `${side}HandIndex2`, `${side}HandIndex3`],
      landmarks: [5, 6, 7, 8],
    },
    {
      boneNames: [`${side}HandMiddle1`, `${side}HandMiddle2`, `${side}HandMiddle3`],
      landmarks: [9, 10, 11, 12],
    },
    {
      boneNames: [`${side}HandRing1`, `${side}HandRing2`, `${side}HandRing3`],
      landmarks: [13, 14, 15, 16],
    },
    {
      boneNames: [`${side}HandPinky1`, `${side}HandPinky2`, `${side}HandPinky3`],
      landmarks: [17, 18, 19, 20],
    },
  ]
}

const LEFT_FINGER_CHAINS = makeFingerChains('Left')
const RIGHT_FINGER_CHAINS = makeFingerChains('Right')

// ─── Coordinate conversion ─────────────────────────────────────────────────
// NOTE: @mediapipe/holistic's bundled runtime does NOT populate
// poseWorldLandmarks despite what the docs say — only poseLandmarks
// (normalized image-space coords, x/y in [0,1], origin top-left, y-down, and
// a z that's roughly the same scale as x). For retargeting via direction
// vectors, only relative positions matter, so these work fine.
//
// Transform to Three.js convention with FULL SELFIE MIRROR:
//   +x = viewer-right (we flip MediaPipe's image-x so the user's motion
//        appears on the same side of the screen as a mirror would show)
//   +y = up (flip MediaPipe's y-down)
//   +z = toward viewer (flip MediaPipe's camera-away)
//
// The x-flip is paired with an L/R bone-name swap at the call sites:
//   user's LEFT landmarks → Y-Bot's RIGHT bones, and vice versa.
// Both transformations together produce a true mirror: user moves right arm
// right → Y-Bot (facing viewer) raises its LEFT arm toward the same viewer-
// right side of the display.
function mpToThree(lm: NormalizedLandmark, out: THREE.Vector3): THREE.Vector3 {
  return out.set(-(lm.x - 0.5), -(lm.y - 0.5), -lm.z)
}

// Hand landmarks share the same normalized space; fingers only use deltas
// between neighbouring joints so the 0.5 offset cancels. Same conversion.

function midpoint(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(a).add(b).multiplyScalar(0.5)
}
// Kept for future re-enable of torso logic.
void midpoint

// ─── Public API ────────────────────────────────────────────────────────────

function stripMixamoPrefix(raw: string): string {
  if (raw.startsWith('mixamorig:')) return raw.slice('mixamorig:'.length)
  if (raw.startsWith('mixamorig_')) return raw.slice('mixamorig_'.length)
  if (raw.startsWith('mixamorig')) return raw.slice('mixamorig'.length)
  return raw
}

/**
 * Walk an FBX root and build a name → bone map, stripping any "mixamorig:"
 * prefix so we can key by the short name (e.g. "LeftArm").
 *
 * Mixamo FBX exports contain each bone TWICE:
 *   - OUTER: reference/hierarchy copy. These form the actual scene-graph
 *     parent-child chain that propagates transforms.
 *   - INNER: the deformer skeleton (SkinnedMesh.skeleton.bones). Each inner
 *     bone is a LEAF child of its identically-named outer bone, and they
 *     do NOT form a chain among themselves — rotating one inner bone does
 *     not move other inner bones.
 *
 * For animation we must drive the OUTER hierarchy bones. The inner skinning
 * bones will follow automatically because they're parented to outer bones.
 *
 * Heuristic to identify OUTER bones: a bone is "outer" if its parent has a
 * DIFFERENT short name (or is not a Bone). Inner bones have a parent with
 * the same short name.
 */
export function indexBones(root: THREE.Object3D): BoneMap {
  const bones: BoneMap = new Map()

  root.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return
    const shortName = stripMixamoPrefix(obj.name)

    // Determine if this bone is "outer" (hierarchy) vs "inner" (skinning leaf).
    // Outer: parent is non-bone, or a bone with a different short name.
    const parent = obj.parent
    const parentShort = parent && (parent as THREE.Bone).isBone
      ? stripMixamoPrefix(parent.name)
      : null
    const isInnerSkinBone = parentShort === shortName
    if (isInnerSkinBone) return

    bones.set(shortName, obj as THREE.Bone)
  })

  return bones
}

/**
 * Capture each driven bone's "forward" direction (toward its child) expressed
 * in the bone's OWN local frame. This is a fixed bind-time value that doesn't
 * change as the bone rotates.
 *
 * Implementation: compute the world-space delta to the child, then transform
 * it by the bone's inverse world-quaternion at bind to get it into bone-local.
 * We use world positions because Mixamo FBX exports bake skeletal offsets
 * into bind matrices, leaving `bone.position` near zero for limb bones.
 */
export function captureRestDirections(bones: BoneMap): RestMap {
  const rest: RestMap = new Map()

  // Ensure world matrices reflect the current bind pose.
  for (const bone of bones.values()) bone.updateWorldMatrix(true, false)

  const boneWorld = new THREE.Vector3()
  const childWorld = new THREE.Vector3()
  const boneWorldQuat = new THREE.Quaternion()

  for (const [boneName, childName] of Object.entries(CHILD_BONE)) {
    const bone = bones.get(boneName)
    const child = bones.get(childName)
    if (!bone || !child || !bone.parent) continue

    bone.getWorldPosition(boneWorld)
    child.getWorldPosition(childWorld)
    const deltaWorld = new THREE.Vector3().subVectors(childWorld, boneWorld)
    if (deltaWorld.lengthSq() < 1e-10) continue

    // Capture bind world quaternion before mutating boneWorldQuat.
    const bindWorldQuat = new THREE.Quaternion()
    bone.getWorldQuaternion(bindWorldQuat)

    // Bring delta into bone-local frame.
    boneWorldQuat.copy(bindWorldQuat).invert()
    deltaWorld.applyQuaternion(boneWorldQuat).normalize()

    rest.set(boneName, { restDirBoneLocal: deltaWorld, bindWorldQuat })
  }
  return rest
}

// ─── Per-frame retargeting ─────────────────────────────────────────────────

// Reused scratch objects (avoid per-frame allocation).
const _v = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  e: new THREE.Vector3(),
  f: new THREE.Vector3(),
  g: new THREE.Vector3(),
  h: new THREE.Vector3(),
  i: new THREE.Vector3(),
  worldDir: new THREE.Vector3(),
  localDir: new THREE.Vector3(),
}
const _q = {
  parentWorldInv: new THREE.Quaternion(),
  target: new THREE.Quaternion(),
  basis: new THREE.Quaternion(),
}
const _m = {
  basis: new THREE.Matrix4(),
}

/**
 * Rotate `bone` so that, in world space, its bind-time forward direction
 * ends up pointing along `targetWorldDir`.
 *
 * Math: let R = restDirBoneLocal (bind direction in bone-local). The world
 * direction after rotation is parent.worldQuat · bone.quaternion · R. Setting
 * that equal to targetWorldDir and solving gives
 *   bone.quaternion = setFromUnitVectors(R, parent.worldQuat⁻¹ · targetWorldDir)
 */
function aimBone(
  bone: THREE.Bone,
  info: RestInfo,
  targetWorldDir: THREE.Vector3,
  slerp: number,
) {
  if (targetWorldDir.lengthSq() < 1e-10) return
  const parent = bone.parent
  if (!parent) return

  // Bring target into parent-local frame.
  parent.getWorldQuaternion(_q.parentWorldInv).invert()
  const targetParentLocal = _v.localDir
    .copy(targetWorldDir)
    .applyQuaternion(_q.parentWorldInv)
    .normalize()

  _q.target.setFromUnitVectors(info.restDirBoneLocal, targetParentLocal)
  bone.quaternion.slerp(_q.target, slerp)
}

/**
 * Aim a bone using a FULL orientation: two world-space axes (up and forward).
 * Unlike `aimBone` which only constrains one axis (giving ambiguous roll),
 * this constrains pitch + yaw + roll simultaneously.
 *
 * Convention: the bone's bind world basis has its y-axis = "bind up" and
 * z-axis = "bind forward". We build a new world basis using the supplied
 * `upWorld` and `forwardWorld`, then assign the bone a local rotation that
 * puts the bone's world quaternion at this new basis.
 */
function aimBoneBasis(
  bone: THREE.Bone,
  info: RestInfo,
  upWorld: THREE.Vector3,
  forwardWorld: THREE.Vector3,
  slerp: number,
) {
  const parent = bone.parent
  if (!parent) return

  // Bind-time world axes (columns of bind basis).
  const bindX = _v.a.set(1, 0, 0).applyQuaternion(info.bindWorldQuat)
  const bindY = _v.b.set(0, 1, 0).applyQuaternion(info.bindWorldQuat)
  const bindZ = _v.c.set(0, 0, 1).applyQuaternion(info.bindWorldQuat)

  // Build target Y (up) from supplied upWorld, falling back to bindY if zero.
  const tY = _v.d.copy(upWorld)
  if (tY.lengthSq() < 1e-10) tY.copy(bindY)
  tY.normalize()

  // Target Z (forward) from supplied forwardWorld; fall back to bindZ.
  const tZ = _v.e.copy(forwardWorld)
  if (tZ.lengthSq() < 1e-10) tZ.copy(bindZ)
  // Re-orthogonalize: tX = tY × tZ, then tZ = tX × tY.
  const tX = _v.f.crossVectors(tY, tZ)
  if (tX.lengthSq() < 1e-10) {
    // up and forward parallel; fall back to bind right.
    tX.copy(bindX)
  }
  tX.normalize()
  tZ.crossVectors(tX, tY).normalize()

  // Target world quaternion from basis.
  _m.basis.makeBasis(tX, tY, tZ)
  _q.basis.setFromRotationMatrix(_m.basis)

  // Convert world quaternion to parent-local.
  parent.getWorldQuaternion(_q.parentWorldInv).invert()
  _q.target.multiplyQuaternions(_q.parentWorldInv, _q.basis)

  bone.quaternion.slerp(_q.target, slerp)
}

/**
 * Apply MediaPipe holistic results to the Y-Bot skeleton.
 * Safe to call every frame; bones not confidently detected are left as-is.
 */
let _diagLogged = false

export function applyPose(
  bones: BoneMap,
  rest: RestMap,
  results: Results,
  opts: ApplyPoseOptions,
): void {
  // @mediapipe/holistic's legacy runtime only populates poseLandmarks (2D
  // normalized image-space). That is sufficient for direction-based
  // retargeting.
  const pose = results.poseLandmarks
  if (!pose || pose.length < 33) return

  const { slerp, visibilityThreshold: vt } = opts

  const vis = (idx: number) => (pose[idx].visibility ?? 1) >= vt

  // Cache converted pose positions in Three coords (scratch Vector3s).
  const pos = (idx: number, out: THREE.Vector3) => mpToThree(pose[idx], out)
  void pos

  // One-shot sanity check: ensure outer-hierarchy bones are properly chained.
  if (!_diagLogged) {
    _diagLogged = true
    const leftArm = bones.get('LeftArm')
    const leftForeArm = bones.get('LeftForeArm')
    const leftHand = bones.get('LeftHand')
    console.log('[mesekai/diag] outer-bone chain check:',
      'bones=', bones.size, 'rest=', rest.size,
      'LeftForeArm parent === LeftArm?', leftForeArm?.parent === leftArm,
      'LeftHand parent === LeftForeArm?', leftHand?.parent === leftForeArm)

    // Verify rotating LeftArm moves LeftForeArm.
    if (leftArm && leftForeArm) {
      const fp = new THREE.Vector3()
      leftForeArm.getWorldPosition(fp)
      const before = fp.clone()
      const saved = leftArm.quaternion.clone()
      leftArm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
      leftArm.updateWorldMatrix(false, true)
      leftForeArm.getWorldPosition(fp)
      console.log('[mesekai/diag] LeftForeArm worldPos before 90°Z:', before.toArray().map(v => v.toFixed(2)),
        'after:', fp.toArray().map(v => v.toFixed(2)),
        'moved:', before.distanceTo(fp).toFixed(3))
      leftArm.quaternion.copy(saved)
      leftArm.updateWorldMatrix(false, true)
    }
  }

  // ─── Torso / hips / spine ──────────────────────────────────────────────
  // We only require shoulders; if hips are out of frame we fall back to a
  // vertical spine.
  const shouldersOk = vis(P.L_SHOULDER) && vis(P.R_SHOULDER)
  if (shouldersOk) {
    // Shoulder center (user's, in Three world frame).
    const lSh = pos(P.L_SHOULDER, _v.c)
    const rSh = pos(P.R_SHOULDER, _v.d)
    const shCenter = midpoint(lSh, rSh, _v.f)

    let spineUp: THREE.Vector3
    if (vis(P.L_HIP) && vis(P.R_HIP)) {
      const lHip = pos(P.L_HIP, _v.a)
      const rHip = pos(P.R_HIP, _v.b)
      const hipCenter = midpoint(lHip, rHip, _v.e)
      spineUp = _v.g.copy(shCenter).sub(hipCenter)
    } else {
      spineUp = _v.g.set(0, 1, 0)
    }

    // Hips rotation is intentionally NOT driven — keep the root bone at its
    // bind orientation so the avatar stays upright and facing the viewer.

    for (const name of ['Spine', 'Spine1', 'Spine2'] as const) {
      const bone = bones.get(name)
      const ri = rest.get(name)
      if (bone && ri) aimBone(bone, ri, spineUp, slerp)
    }

    // Head aim: use a full orientation (up + forward) to control pitch,
    // yaw, and roll independently. Single-axis aim cannot disambiguate
    // yaw from roll when the target lies near the bind "up" axis.
    //
    //   Up axis    = (nose − shoulder_center), with a pitch-up bias so
    //                neutral gaze produces a level head.  Provides pitch
    //                and roll.
    //   Forward axis = (nose − earMid), image-plane only (x, z).  Provides
    //                yaw from the nose's sideways offset relative to the
    //                ear midpoint when the user turns their head.
    if (vis(P.NOSE)) {
      const nose = pos(P.NOSE, _v.i)
      const upWorld = _v.worldDir.copy(nose).sub(shCenter)
      upWorld.z = 0
      upWorld.y += 0.25

      const forwardWorld = _v.g.set(0, 0, 1) // default: Y-Bot forward
      if (vis(P.L_EAR) && vis(P.R_EAR)) {
        const lEar = pos(P.L_EAR, _v.a)
        const rEar = pos(P.R_EAR, _v.b)
        const earMid = midpoint(lEar, rEar, _v.c)
        // nose.x − earMid.x yaws the forward vector sideways; scale up.
        forwardWorld.x += (nose.x - earMid.x) * 4.0
      }

      const neck = bones.get('Neck')
      const ri = rest.get('Neck')
      if (neck && ri) aimBoneBasis(neck, ri, upWorld, forwardWorld, slerp)
    }
  }

  // ─── Limbs with L/R swap for viewer-mirror ─────────────────────────────
  // User faces camera; Y-Bot faces viewer. To produce a mirror effect, the
  // user's LEFT body-part (MediaPipe L_*) drives Y-Bot's RIGHT bone, and
  // vice versa. Coordinate mirroring is NOT done in mpToThree — only the
  // L/R landmark indices are swapped here.
  aimLimb(bones, rest, pose, P.L_SHOULDER, P.L_ELBOW, P.L_WRIST, 'RightArm', 'RightForeArm', vt, slerp, false)
  aimLimb(bones, rest, pose, P.R_SHOULDER, P.R_ELBOW, P.R_WRIST, 'LeftArm', 'LeftForeArm', vt, slerp, false)
  // Legs: pose Z for leg landmarks in poseLandmarks is noisy and frequently
  // signs-wrong (yields yaw-180 where feet point away from the viewer).
  // Discard Z and rely on the x/y image-plane projection. Knee/ankle motion
  // still tracks correctly; legs just don't twist forward/back.
  aimLimb(bones, rest, pose, P.L_HIP, P.L_KNEE, P.L_ANKLE, 'RightUpLeg', 'RightLeg', vt, slerp, true)
  aimLimb(bones, rest, pose, P.R_HIP, P.R_KNEE, P.R_ANKLE, 'LeftUpLeg', 'LeftLeg', vt, slerp, true)

  // ─── Hands (fingers). Left-hand landmarks drive Y-Bot's RIGHT hand bones.
  applyHand(bones, rest, results.leftHandLandmarks, 'RightHand', RIGHT_FINGER_CHAINS, slerp)
  applyHand(bones, rest, results.rightHandLandmarks, 'LeftHand', LEFT_FINGER_CHAINS, slerp)
}

function aimLimb(
  bones: BoneMap,
  rest: RestMap,
  pose: NormalizedLandmarkList,
  rootIdx: number,
  midIdx: number,
  tipIdx: number,
  upperBoneName: string,
  lowerBoneName: string,
  visThreshold: number,
  slerp: number,
  zeroZ: boolean,
) {
  const v = (i: number) => (pose[i].visibility ?? 1) >= visThreshold
  if (!v(rootIdx) || !v(midIdx)) return

  const root = mpToThree(pose[rootIdx], _v.a)
  const mid = mpToThree(pose[midIdx], _v.b)
  const upperDir = _v.c.copy(mid).sub(root)
  if (zeroZ) upperDir.z = 0
  const upper = bones.get(upperBoneName)
  const upperRest = rest.get(upperBoneName)
  if (upper && upperRest) aimBone(upper, upperRest, upperDir, slerp)

  if (!v(tipIdx)) return
  const tip = mpToThree(pose[tipIdx], _v.d)
  const lowerDir = _v.e.copy(tip).sub(mid)
  if (zeroZ) lowerDir.z = 0
  const lower = bones.get(lowerBoneName)
  const lowerRest = rest.get(lowerBoneName)
  if (lower && lowerRest) aimBone(lower, lowerRest, lowerDir, slerp)
}

function applyHand(
  bones: BoneMap,
  rest: RestMap,
  handLandmarks: NormalizedLandmarkList | undefined,
  wristBoneName: string,
  chains: FingerChain[],
  slerp: number,
) {
  if (!handLandmarks || handLandmarks.length < 21) return

  // Convert all 21 landmarks to Three coords up front.
  const pts: THREE.Vector3[] = new Array(21)
  for (let i = 0; i < 21; i++) pts[i] = mpToThree(handLandmarks[i], new THREE.Vector3())

  // Wrist orientation: build a basis from wrist→middle MCP (forward) and
  // wrist→index MCP (side). Use aimBone along forward for a simpler,
  // more stable result than full-basis snapping.
  const wristBone = bones.get(wristBoneName)
  const wristRest = rest.get(wristBoneName)
  // Note: CHILD_BONE doesn't include LeftHand / RightHand, so we skip rest
  // lookup and infer a simple forward aim only if we ever add those.
  void wristBone
  void wristRest

  // Finger chains.
  for (const chain of chains) {
    for (let seg = 0; seg < 3; seg++) {
      const boneName = chain.boneNames[seg]
      const bone = bones.get(boneName)
      const ri = rest.get(boneName)
      if (!bone || !ri) continue
      const a = pts[chain.landmarks[seg]]
      const b = pts[chain.landmarks[seg + 1]]
      const dir = _v.worldDir.copy(b).sub(a)
      aimBone(bone, ri, dir, slerp)
    }
  }

}
