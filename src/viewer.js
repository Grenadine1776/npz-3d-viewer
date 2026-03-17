import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const COLORS = {
  background: 0x101113,
  surface: 0x1a1c20,
  text: 0xd2d7dd,
}

export function createViewer(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.001,
    100,
  )
  camera.position.set(1.8, 1.3, 2.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 0.9, 0)
  controls.minDistance = 1.4
  controls.maxDistance = 12

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.4)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
  directionalLight.position.set(2, 4, 3)
  scene.add(ambientLight, directionalLight)

  const grid = new THREE.GridHelper(10, 20, COLORS.text, COLORS.surface)
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const material of gridMaterials) {
    material.transparent = true
    material.opacity = 0.18
  }
  grid.position.y = 0
  scene.add(grid)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 64),
    new THREE.MeshBasicMaterial({
      color: COLORS.surface,
      transparent: true,
      opacity: 0.85,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.001
  scene.add(floor)

  const lineMaterial = new THREE.LineBasicMaterial({ color: COLORS.text })
  const jointMaterial = new THREE.PointsMaterial({
    color: COLORS.text,
    size: 0.045,
    sizeAttenuation: true,
  })
  const trajectoryMaterial = new THREE.LineBasicMaterial({
    color: COLORS.text,
    transparent: true,
    opacity: 0.45,
  })

  const skeletonGeometry = new THREE.BufferGeometry()
  const jointGeometry = new THREE.BufferGeometry()
  const trajectoryGeometry = new THREE.BufferGeometry()

  const skeletonLine = new THREE.LineSegments(skeletonGeometry, lineMaterial)
  const joints = new THREE.Points(jointGeometry, jointMaterial)
  const trajectory = new THREE.Line(trajectoryGeometry, trajectoryMaterial)
  skeletonLine.frustumCulled = false
  joints.frustumCulled = false
  trajectory.frustumCulled = false

  const sillyHead = new THREE.Group()
  sillyHead.frustumCulled = false

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 24, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.text }),
  )

  const eyeGeometry = new THREE.SphereGeometry(0.011, 14, 14)
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.background })
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
  leftEye.position.set(-0.028, 0.018, 0.087)
  rightEye.position.set(0.028, 0.018, 0.087)

  const mouthGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.03, -0.018, 0.088),
    new THREE.Vector3(-0.022, -0.031, 0.088),
    new THREE.Vector3(-0.01, -0.034, 0.088),
    new THREE.Vector3(0, -0.022, 0.088),
    new THREE.Vector3(0.01, -0.034, 0.088),
    new THREE.Vector3(0.022, -0.031, 0.088),
    new THREE.Vector3(0.03, -0.018, 0.088),
  ])
  const mouth = new THREE.Line(
    mouthGeometry,
    new THREE.LineBasicMaterial({ color: COLORS.background }),
  )

  sillyHead.add(headMesh, leftEye, rightEye, mouth)
  scene.add(sillyHead)

  scene.add(skeletonLine, joints, trajectory)

  let animationFrameId = null

  function render() {
    controls.update()
    renderer.render(scene, camera)
    animationFrameId = window.requestAnimationFrame(render)
  }

  function resize() {
    const width = container.clientWidth
    const height = container.clientHeight

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }

  function setTrajectory(points) {
    trajectoryGeometry.setFromPoints(points)
    trajectoryGeometry.computeBoundingSphere()
    trajectoryGeometry.computeBoundingBox()
  }

  function setFrame(framePose) {
    const { positions, parents, jointNames } = framePose
    const segmentVertices = []
    const jointVertices = []

    for (let joint = 0; joint < positions.length; joint += 1) {
      const jointPosition = positions[joint]
      jointVertices.push(jointPosition.x, jointPosition.y, jointPosition.z)

      const parent = parents[joint]
      if (parent >= 0) {
        const parentPosition = positions[parent]
        segmentVertices.push(
          parentPosition.x,
          parentPosition.y,
          parentPosition.z,
          jointPosition.x,
          jointPosition.y,
          jointPosition.z,
        )
      }
    }

    skeletonGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(segmentVertices, 3),
    )
    jointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(jointVertices, 3))
    skeletonGeometry.computeBoundingSphere()
    skeletonGeometry.computeBoundingBox()
    jointGeometry.computeBoundingSphere()
    jointGeometry.computeBoundingBox()

    const neckIndex = jointNames.indexOf('neck')
    const headIndex = jointNames.indexOf('head')
    const headTopIndex = jointNames.indexOf('head_top')
    const leftShoulderIndex = jointNames.indexOf('left_shoulder')
    const rightShoulderIndex = jointNames.indexOf('right_shoulder')

    if (
      neckIndex >= 0 &&
      headIndex >= 0 &&
      headTopIndex >= 0 &&
      leftShoulderIndex >= 0 &&
      rightShoulderIndex >= 0
    ) {
      const neck = positions[neckIndex]
      const head = positions[headIndex]
      const headTop = positions[headTopIndex]
      const leftShoulder = positions[leftShoulderIndex]
      const rightShoulder = positions[rightShoulderIndex]

      const up = headTop.clone().sub(neck).normalize()
      const side = leftShoulder.clone().sub(rightShoulder).normalize()
      const forward = new THREE.Vector3().crossVectors(side, up).normalize()
      const orthogonalSide = new THREE.Vector3().crossVectors(up, forward).normalize()

      const basis = new THREE.Matrix4().makeBasis(orthogonalSide, up, forward)
      sillyHead.quaternion.setFromRotationMatrix(basis)

      const headHeight = headTop.distanceTo(neck)
      const radius = Math.max(headHeight * 0.28, 0.055)
      sillyHead.position.copy(head).lerp(headTop, 0.58).addScaledVector(up, radius * 0.18)
      sillyHead.scale.setScalar(radius / 0.08)
      sillyHead.visible = true
    } else {
      sillyHead.visible = false
    }
  }

  function fitToPoints(points) {
    if (!points.length) {
      return
    }

    const box = new THREE.Box3().setFromPoints(points)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.length() * 0.5, 0.8)

    const direction = camera.position.clone().sub(controls.target)
    if (direction.lengthSq() < 1e-6) {
      direction.set(1.8, 1.3, 2.2)
    }
    direction.normalize()

    const distance = Math.max(radius * 2.2, 2.8)
    camera.position.copy(center).addScaledVector(direction, distance)
    camera.near = Math.max(radius / 500, 0.001)
    camera.far = Math.max(radius * 30, 100)
    camera.updateProjectionMatrix()

    controls.target.copy(center)
    controls.minDistance = Math.max(radius * 1.05, 1.4)
    controls.maxDistance = Math.max(distance * 6, 12)
    controls.update()
  }

  function clear() {
    skeletonGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    jointGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    skeletonGeometry.computeBoundingSphere()
    skeletonGeometry.computeBoundingBox()
    jointGeometry.computeBoundingSphere()
    jointGeometry.computeBoundingBox()
    trajectoryGeometry.computeBoundingSphere()
    trajectoryGeometry.computeBoundingBox()
    sillyHead.visible = false
  }

  window.addEventListener('resize', resize)
  render()

  return {
    resize,
    setFrame,
    setTrajectory,
    fitToPoints,
    clear,
    dispose() {
      window.removeEventListener('resize', resize)
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
