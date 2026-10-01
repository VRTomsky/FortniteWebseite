// 3D-Sammelkarte mit Three.js: drehbar, zoombar, Holo-Lack bei besonderen Seltenheiten, schwarze Bühne.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { drawFront, drawBack, firstImg, loadImg, fontsReady } from './cardfaces.js';

const HOLO = new Set(['legendary', 'mythic', 'icon', 'marvel', 'dc', 'starwars', 'gaminglegends', 'dark', 'lava', 'frozen', 'shadow', 'slurp', 'exotic', 'transcendent']);

function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function planarUV(geo, w, h) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  uv.needsUpdate = true;
}

function glowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, color + 'cc');
  grd.addColorStop(0.45, color + '33');
  grd.addColorStop(1, color + '00');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * spec: { title, subtitle, colors, images:[...], pattern, rarity, priceVb, footer, rows, id }
 * Rückgabe: { dispose, setAuto(bool), reset(), flip() }
 */
export async function mountCard(container, spec) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('webgl');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const size = () => [Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)];
  renderer.setSize(...size());
  renderer.domElement.setAttribute('aria-label', `3D-Karte: ${spec.title}. Ziehen zum Drehen.`);
  renderer.domElement.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const [w0, h0] = size();
  const FOV = 30;
  const camera = new THREE.PerspectiveCamera(FOV, w0 / h0, 0.1, 100);
  // Abstand, bei dem die Karte ~70 % der Höhe bzw. ~75 % der Breite füllt
  // Auf schmalen Bühnen (Handy) kleiner und etwas höher, damit die Bedienleiste frei bleibt
  const narrow = (aspect) => aspect < 1;
  const fitDistance = (aspect) => {
    const k = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fill = narrow(aspect) ? 0.6 : 0.7;
    return Math.max(3.5 / fill / k, 2.5 / 0.72 / (k * aspect));
  };
  const lift = (aspect) => (narrow(aspect) ? -0.32 : 0);
  const home = new THREE.Vector3(0, 0.05, fitDistance(w0 / h0));
  camera.position.copy(home);

  // Texturen
  await fontsReady();
  const [img, pattern, vbIcon] = await Promise.all([
    firstImg(spec.images || []),
    loadImg(spec.pattern),
    spec.priceVb != null ? loadImg('https://fortnite-api.com/images/vbuck.png') : Promise.resolve(null),
  ]);
  const frontCanvas = drawFront(document.createElement('canvas'), spec, { img, pattern, vbIcon });
  const backCanvas = drawBack(document.createElement('canvas'), spec);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const mkTex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso); return t; };
  const frontTex = mkTex(frontCanvas);
  const backTex = mkTex(backCanvas);

  // Karte: Vorder- und Rückseite als eigene Flächen, Kante als Extrusion
  const CW = 2.5, CH = 3.5, D = 0.05, R = 0.12;
  const shape = roundedShape(CW, CH, R);
  const holo = HOLO.has(spec.rarity);
  const c1 = new THREE.Color(spec.colors[0]);

  const frontGeo = new THREE.ShapeGeometry(shape, 12);
  planarUV(frontGeo, CW, CH);
  const backGeo = frontGeo.clone();
  frontGeo.translate(0, 0, D / 2 + 0.001);
  backGeo.rotateY(Math.PI);
  backGeo.translate(0, 0, -D / 2 - 0.001);
  const edgeGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 12 });
  edgeGeo.translate(0, 0, -D / 2);

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: frontTex, roughness: 0.34, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12,
    iridescence: holo ? 0.55 : 0, iridescenceIOR: 1.35, iridescenceThicknessRange: [120, 420], envMapIntensity: 0.85,
  });
  const backMat = new THREE.MeshPhysicalMaterial({ map: backTex, roughness: 0.5, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6 });
  const edgeMat = [new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshStandardMaterial({ color: c1, metalness: 0.75, roughness: 0.28 })];

  const card = new THREE.Group();
  card.add(new THREE.Mesh(frontGeo, frontMat), new THREE.Mesh(backGeo, backMat), new THREE.Mesh(edgeGeo, edgeMat));
  scene.add(card);

  // Licht: neutraler Hauptstrahler + farbige Kantenlichter
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 3, 5);
  scene.add(key);
  const rimA = new THREE.PointLight(c1, 28, 14, 2);
  rimA.position.set(-3.2, 1.5, -2.2);
  const rimB = new THREE.PointLight(new THREE.Color(spec.colors[1]), 18, 14, 2);
  rimB.position.set(3.2, -1.2, -2);
  scene.add(rimA, rimB);

  // Bühnenlicht unter der Karte
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: glowTexture(spec.colors[0]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -2.25;
  scene.add(glow);

  // Schwebende Partikel in Seltenheitsfarbe
  const N = reduce ? 0 : 260;
  const pGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), speed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = 2.2 + Math.random() * 3.2, a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = -2.4 + Math.random() * 5.4; pos[i * 3 + 2] = Math.sin(a) * r - 1;
    speed[i] = 0.08 + Math.random() * 0.22;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: c1, size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(particles);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.75;
  controls.minDistance = 3.6;
  controls.maxDistance = home.z * 1.7;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.82;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 1.8;
  let auto = !reduce;
  let idleTimer = null;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { clearTimeout(idleTimer); if (auto) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 4000); });

  controls.target.set(0, lift(w0 / h0), 0);
  home.y = 0.05 + lift(w0 / h0);
  controls.update();
  container.append(renderer.domElement);
  const ro = new ResizeObserver(() => {
    const [w, h] = size();
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    home.z = fitDistance(w / h);
    home.y = 0.05 + lift(w / h);
    controls.maxDistance = home.z * 1.7;
  });
  ro.observe(container);

  const reset = () => { const [w, h] = size(); camera.position.copy(home); controls.target.set(0, lift(w / h), 0); controls.update(); };
  renderer.domElement.addEventListener('dblclick', reset);

  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!reduce) card.position.y = Math.sin(t * 1.1) * 0.05;
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] += speed[i] * dt;
      if (pos[i * 3 + 1] > 3) pos[i * 3 + 1] = -2.4;
    }
    if (N) pGeo.attributes.position.needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    canvas: renderer.domElement,
    setAuto(on) { auto = on && !reduce; controls.autoRotate = auto; },
    get auto() { return auto; },
    reset,
    flip() {
      const off = camera.position.clone().sub(controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      camera.position.copy(controls.target).add(off);
      controls.update();
    },
    dispose() {
      cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
