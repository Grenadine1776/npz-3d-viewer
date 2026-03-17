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
    const { positions, parents } = framePose
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
