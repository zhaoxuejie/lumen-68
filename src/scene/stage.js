/**
 * Studio stage: renderer, camera, lighting, environment reflections, soft
 * floor shadow and orbit controls with an animated "reset view".
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createContactShadowTexture } from './legend.js';

const HOME_TARGET = new THREE.Vector3(0, 1.02, 0);
const HOME_AZIMUTH = THREE.MathUtils.degToRad(16);
const HOME_ELEVATION = THREE.MathUtils.degToRad(33);
const FIT_MARGIN = 1.1;
// Conservative half-extents of the assembled + exploded product so that the
// whole keyboard always stays inside the viewport, in every state.
const FIT_HALF_WIDTH = 9.25;
const FIT_HALF_HEIGHT = 4.1;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Stage {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;
    this.userMoved = false;
    this.tween = null;
    this.autoRotate = false;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 220);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

    const canvas = this.renderer.domElement;
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-label', 'LUMEN 68 机械键盘三维预览，可拖拽旋转、滚轮缩放');
    canvas.tabIndex = 0;
    container.appendChild(canvas);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.62;
    this.controls.zoomSpeed = 0.85;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(8);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    this.controls.target.copy(HOME_TARGET);
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.userMoved = true;
    });
    canvas.addEventListener('wheel', () => {
      this.userMoved = true;
    }, { passive: true });

    this.#setupEnvironment();
    this.#setupLights();
    this.#setupFloor();

    this.resize();
    this.applyHome();
  }

  #setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTexture = pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = this.environmentTexture;
    this.scene.environmentIntensity = 0.62;
    pmrem.dispose();
    if (typeof room.dispose === 'function') room.dispose();
  }

  #setupLights() {
    const key = new THREE.DirectionalLight(0xfff0dd, 2.35);
    key.position.set(7.5, 12.5, 9.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -13;
    key.shadow.camera.right = 13;
    key.shadow.camera.top = 13;
    key.shadow.camera.bottom = -13;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 46;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.028;
    key.shadow.radius = 2.5;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa8c4de, 0.5);
    fill.position.set(-10, 6.5, -2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffb274, 1.05);
    rim.position.set(-1.5, 5.5, -12);
    this.scene.add(rim);

    const hemi = new THREE.HemisphereLight(0xe4ecf6, 0x1a120b, 0.24);
    this.scene.add(hemi);
  }

  #setupFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(19.5, 8.4),
      new THREE.MeshBasicMaterial({
        map: createContactShadowTexture(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(0, 0.0015, 0.55);
    contact.renderOrder = 1;
    this.scene.add(contact);
    this.contactShadow = contact;
  }

  #computeHome() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const compact = aspect < 1.04;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const halfWidth = compact ? 8.8 : FIT_HALF_WIDTH;
    const halfHeight = compact ? 3.15 : FIT_HALF_HEIGHT;
    const explode = this.explodeProgress ?? 0;
    const target = new THREE.Vector3(
      0,
      HOME_TARGET.y + (compact ? 0.12 : 0) + explode * 1.12,
      0,
    );
    const distance =
      Math.max(halfWidth / Math.tan(hFov / 2), halfHeight / Math.tan(vFov / 2)) *
      (FIT_MARGIN + explode * 0.07);
    const azimuth = compact ? THREE.MathUtils.degToRad(9) : HOME_AZIMUTH;
    const elevation = compact ? THREE.MathUtils.degToRad(50) : HOME_ELEVATION;
    const direction = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    );
    return {
      target,
      position: target.clone().addScaledVector(direction, distance),
      distance,
    };
  }

  /** Update the camera framing amount used by the exploded view. */
  setExplodeProgress(progress) {
    this.explodeProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  }

  applyHome() {
    const home = this.#computeHome();
    this.home = home;
    this.camera.position.copy(home.position);
    this.controls.target.copy(home.target);
    this.controls.minDistance = home.distance * 0.48;
    this.controls.maxDistance = home.distance * 1.85;
    this.controls.update();
  }

  /**
   * Smoothly fly the camera back to the default product angle.
   * @param {number} [duration] milliseconds
   */
  resetView(duration = 720) {
    const home = this.#computeHome();
    this.home = home;
    this.tween = {
      start: performance.now(),
      duration: Math.max(1, duration),
      fromPosition: this.camera.position.clone(),
      toPosition: home.position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: home.target.clone(),
    };
    this.userMoved = false;
  }

  setAutoRotate(enabled) {
    this.autoRotate = Boolean(enabled);
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.85;
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) {
      const home = this.#computeHome();
      this.home = home;
      this.controls.minDistance = home.distance * 0.48;
      this.controls.maxDistance = home.distance * 1.85;
      this.camera.position.copy(home.position);
      this.controls.target.copy(home.target);
      this.controls.update();
    }
  }

  update(dt) {
    if (this.tween) {
      const progress = Math.min(1, (performance.now() - this.tween.start) / this.tween.duration);
      const eased = easeInOutCubic(progress);
      this.camera.position.lerpVectors(this.tween.fromPosition, this.tween.toPosition, eased);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);
      if (progress >= 1) this.tween = null;
    }

    // Automatic framing for the exploded view (and for responsive resizes):
    // gently pull back / raise the target while the user has not taken control
    // of the camera themselves.
    const autoFrame = !this.userMoved && !this.controls.autoRotate && !this.tween;
    this.framingPending = false;
    if (autoFrame) {
      const home = this.#computeHome();
      this.home = home;
      this.controls.minDistance = home.distance * 0.48;
      this.controls.maxDistance = home.distance * 1.85;
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
      this.camera.position.lerp(home.position, k);
      this.controls.target.lerp(home.target, k);
      const positionGap = this.camera.position.distanceTo(home.position);
      const targetGap = this.controls.target.distanceTo(home.target);
      if (positionGap < 0.02 && targetGap < 0.01) {
        this.camera.position.copy(home.position);
        this.controls.target.copy(home.target);
      } else {
        this.framingPending = true;
      }
    }

    this.controls.update();
    this.camera.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  isCameraSettled() {
    return !this.tween && !this.framingPending;
  }

  /**
   * Project a world position to page CSS pixels.
   * @param {THREE.Vector3} world
   * @param {THREE.Vector3} [out] Optional vector to write NDC into.
   * @returns {{x: number, y: number, visible: boolean}}
   */
  projectToPage(world, out) {
    const ndc = out ?? new THREE.Vector3();
    ndc.copy(world).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height,
      visible: ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= 1.05 && Math.abs(ndc.y) <= 1.05,
    };
  }

  getCameraState() {
    return {
      position: [
        Number(this.camera.position.x.toFixed(4)),
        Number(this.camera.position.y.toFixed(4)),
        Number(this.camera.position.z.toFixed(4)),
      ],
      target: [
        Number(this.controls.target.x.toFixed(4)),
        Number(this.controls.target.y.toFixed(4)),
        Number(this.controls.target.z.toFixed(4)),
      ],
      distance: Number(this.camera.position.distanceTo(this.controls.target).toFixed(4)),
    };
  }
}
