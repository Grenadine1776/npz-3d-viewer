import * as THREE from 'three'
import { getRow } from './npz.js'

const JOINT_NAMES = [
  'pelvis',
  'left_hip',
  'right_hip',
  'spine1',
  'left_knee',
  'right_knee',
  'spine2',
  'left_ankle',
  'right_ankle',
  'spine3',
  'left_foot',
  'right_foot',
  'neck',
  'left_collar',
  'right_collar',
  'head',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
]

const PARENTS = [
  -1,
  0,
  0,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  12,
  12,
  12,
  13,
  14,
  16,
  17,
  18,
  19,
]

const OFFSETS = [
  [0, 0, 0],
  [-0.0788, -0.0899, -0.0031],
  [0.0824, -0.0899, -0.0031],
  [0.0018, 0.0942, 0.0035],
  [0.0193, -0.3773, -0.0105],
  [-0.0173, -0.3774, -0.0105],
  [0, 0.1226, -0.0025],
  [0.0012, -0.3981, -0.0521],
  [0.0009, -0.3981, -0.0521],
  [0, 0.0803, -0.0242],
  [0.0126, -0.0716, 0.1427],
  [-0.0122, -0.0717, 0.1427],
  [0, 0.1958, -0.02],
  [0.0547, 0.1188, -0.0252],
  [-0.0547, 0.1188, -0.0252],
  [0, 0.0956, -0.0015],
  [0.1107, 0.0124, 0.0034],
  [-0.1107, 0.0124, 0.0034],
  [0.2681, 0.0119, -0.0127],
  [-0.2681, 0.0119, -0.0127],
  [0.269, 0.004, -0.0132],
  [-0.269, 0.004, -0.0132],
].map(([x, y, z]) => new THREE.Vector3(x, y, z))

const HEAD_INDEX = JOINT_NAMES.indexOf('head')
const HEAD_TOP_OFFSET = new THREE.Vector3(0, 0.11, 0)

function axisAngleToQuaternion(x, y, z) {
  const quaternion = new THREE.Quaternion()
  const angle = Math.hypot(x, y, z)

  if (angle < 1e-8) {
    return quaternion.identity()
  }

  const axis = new THREE.Vector3(x / angle, y / angle, z / angle)
  return quaternion.setFromAxisAngle(axis, angle)
}

export function createMotion(npzData) {
  const poses = npzData.poses
  const trans = npzData.trans
  const rootRotation = npzData.Rh

  if (!poses || !trans) {
    throw new Error('Expected at least "poses" and "trans" arrays')
  }

  if (poses.shape.length !== 2 || poses.shape[1] < 66) {
    throw new Error('Expected "poses" to be a 2D array with at least 66 values per frame')
  }

  if (trans.shape.length !== 2 || trans.shape[1] !== 3) {
    throw new Error('Expected "trans" to be shaped [frames, 3]')
  }

  if (rootRotation && (rootRotation.shape.length !== 2 || rootRotation.shape[1] !== 3)) {
    throw new Error('Expected "Rh" to be shaped [frames, 3]')
  }

  if (poses.shape[0] !== trans.shape[0]) {
    throw new Error('"poses" and "trans" must have the same frame count')
  }

  if (rootRotation && rootRotation.shape[0] !== poses.shape[0]) {
    throw new Error('"Rh" and "poses" must have the same frame count')
  }

  return {
    frameCount: poses.shape[0],
    fps: 30,
    jointNames: JOINT_NAMES,
    parents: PARENTS,
    npzData,
  }
}

export function getTrajectoryPoints(motion) {
  const points = []
  const trans = motion.npzData.trans

  for (let frame = 0; frame < motion.frameCount; frame += 1) {
    const row = getRow(trans, frame)
    points.push(new THREE.Vector3(row[0], row[1], row[2]))
  }

  return points
}

export function getFramePose(motion, frameIndex) {
  const { npzData, jointNames, parents } = motion
  const poses = getRow(npzData.poses, frameIndex)
  const translation = getRow(npzData.trans, frameIndex)
  const rootAxisAngle = npzData.Rh ? getRow(npzData.Rh, frameIndex) : poses.slice(0, 3)

  const worldPositions = Array.from({ length: jointNames.length }, () => new THREE.Vector3())
  const worldRotations = Array.from({ length: jointNames.length }, () => new THREE.Quaternion())

  worldPositions[0].set(translation[0], translation[1], translation[2])
  worldRotations[0].copy(
    axisAngleToQuaternion(rootAxisAngle[0], rootAxisAngle[1], rootAxisAngle[2]),
  )

  for (let joint = 1; joint < jointNames.length; joint += 1) {
    const parent = parents[joint]
    const start = joint * 3
    const localRotation = axisAngleToQuaternion(poses[start], poses[start + 1], poses[start + 2])
    const parentRotation = worldRotations[parent]

    worldRotations[joint].copy(parentRotation).multiply(localRotation)
    worldPositions[joint]
      .copy(OFFSETS[joint])
      .applyQuaternion(parentRotation)
      .add(worldPositions[parent])
  }

  const displayJointNames = [...jointNames]
  const displayParents = [...parents]
  const displayPositions = [...worldPositions]

  // The FBX/SMPL-family head joint sits near the base of the skull.
  // Add a synthetic head-top endpoint so the skeleton reads clearly in preview.
  const headTopPosition = HEAD_TOP_OFFSET.clone()
    .applyQuaternion(worldRotations[HEAD_INDEX])
    .add(worldPositions[HEAD_INDEX])

  displayJointNames.push('head_top')
  displayParents.push(HEAD_INDEX)
  displayPositions.push(headTopPosition)

  return {
    jointNames: displayJointNames,
    parents: displayParents,
    positions: displayPositions,
  }
}

export function describeNpz(npzData) {
  return Object.entries(npzData).map(([key, value]) => ({
    key,
    shape: value.shape,
    dtype: value.dtype,
    preview: Array.from(value.data).slice(0, 6),
  }))
}
