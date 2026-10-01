/* ============================================================
   Hero scene — a cross made of light.
   Several thousand points gather into a cross when the page opens,
   breathe and twinkle, turn a few degrees with the mouse (or phone tilt),
   and drift apart again as you scroll past. Warm ivory on deep blue.
   ============================================================ */
(function () {
  "use strict";
  const THREE = window.THREE;
  if (!THREE) return;

const canvas = document.getElementById("scene");
const hero = canvas?.parentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch { return false; }
}
if (canvas && hero && hasWebGL()) start();

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(0, 0.3, 10);

  // Soft round sprite
  const sprite = (() => {
    const s = 64, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d").createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,0.65)"); g.addColorStop(1, "rgba(255,255,255,0)");
    const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  /* ---- The cross ---- */
  const group = new THREE.Group();
  scene.add(group);

  const N = 4600;
  const H = 4.6, W = 3.0, T = 0.46, D = 0.46, ARM_Y = 1.05;
  const pos = new Float32Array(N * 3), far = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const vertical = Math.random() < (H * T) / (H * T + W * T);
    let x, y, z;
    if (vertical) { x = (Math.random() - 0.5) * T; y = (Math.random() - 0.5) * H; z = (Math.random() - 0.5) * D; }
    else { x = (Math.random() - 0.5) * W; y = ARM_Y + (Math.random() - 0.5) * T; z = (Math.random() - 0.5) * D; }
    // bias toward the surface so the silhouette stays crisp
    if (Math.random() < 0.4) {
      if (vertical) x = Math.sign(x || 1) * T * 0.5 * (0.9 + Math.random() * 0.1);
      else y = ARM_Y + Math.sign(y - ARM_Y || 1) * T * 0.5 * (0.9 + Math.random() * 0.1);
    }
    pos.set([x, y, z], i * 3);
    // where this point lives when scattered: a loose sphere around the cross
    const r = 4 + Math.random() * 6, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    far.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.7, r * Math.cos(ph)], i * 3);
    size[i] = 0.6 + Math.random() * 1.1;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aFar", new THREE.BufferAttribute(far, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uTex: { value: sprite }, uPixelRatio: { value: renderer.getPixelRatio() },
      uScatter: { value: 1 },                                  // 1 = scattered, 0 = assembled
      uWarm: { value: new THREE.Color(0xfff6df) },             // warm white
      uGold: { value: new THREE.Color(0xd9bc74) },             // quiet gold
      uFade: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aFar; attribute float aSize; attribute float aPhase;
      uniform float uTime, uPixelRatio, uScatter;
      varying float vTw;
      void main() {
        float tw = sin(uTime * 1.5 + aPhase);
        vec3 home = position + 0.025 * vec3(sin(uTime*0.7+aPhase), cos(uTime*0.9+aPhase*1.3), sin(uTime*0.5+aPhase*0.7));
        // ease each point on its own schedule so the gathering feels organic
        float k = smoothstep(0.0, 1.0, clamp(uScatter * 1.25 - fract(aPhase * 0.159) * 0.25, 0.0, 1.0));
        vec3 p = mix(home, aFar, k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (1.0 + 0.25 * tw) * 30.0 * uPixelRatio / -mv.z;
        gl_Position = projectionMatrix * mv;
        vTw = tw;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uWarm, uGold; uniform float uFade;
      varying float vTw;
      void main() {
        float a = texture2D(uTex, gl_PointCoord).a;
        vec3 col = mix(uGold, uWarm, 0.5 + 0.5 * vTw);
        gl_FragColor = vec4(col, a * (0.5 + 0.4 * vTw) * uFade);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(geo, mat));

  // a faint solid core so the cross reads as a form, not just dust
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xd9bc74, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Group();
  core.add(new THREE.Mesh(new THREE.BoxGeometry(T * 0.85, H * 0.97, D * 0.85), coreMat));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(W * 0.97, T * 0.85, D * 0.85), coreMat); arm.position.y = ARM_Y; core.add(arm);
  group.add(core);

  /* ---- Sparse, very faint stars for depth ---- */
  const SN = 500, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    const r = 14 + Math.random() * 20, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.6, r * Math.cos(ph) - 8], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.09, map: sprite, color: 0xbfd0ee, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(stars);

  /* ---- Slow rising motes in the foreground ---- */
  const MN = 110, mp = new Float32Array(MN * 3), mv = [];
  for (let i = 0; i < MN; i++) {
    mp.set([(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 9, Math.random() * 5 - 1], i * 3);
    mv.push((Math.random() - 0.5) * 0.003, 0.0015 + Math.random() * 0.004, 0);
  }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.06, map: sprite, color: 0xfff1cc, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(motes);

  /* ---- Layout: cross on the right 5/12 of the hero when wide ---- */
  function layout() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    mat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    const wide = window.innerWidth > 800;
    group.position.x = wide ? 3.1 * Math.min(1, w / 1200) : 0;
    camera.position.z = wide ? 10 : 11.5;
  }
  new ResizeObserver(layout).observe(canvas);
  layout();

  /* ---- Input ---- */
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => { target.x = (e.clientX / window.innerWidth - 0.5) * 2; target.y = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });
  window.addEventListener("deviceorientation", (e) => { if (e.gamma == null) return; target.x = THREE.MathUtils.clamp(e.gamma / 35, -1, 1); target.y = THREE.MathUtils.clamp((e.beta - 50) / 35, -1, 1); }, { passive: true });
  let scroll = 0;
  const onScroll = () => { scroll = Math.min(1, window.scrollY / Math.max(1, hero.clientHeight * 0.9)); };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  let visible = true, raf = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) frame(); }).observe(hero);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) frame(); });

  /* ---- Loop ---- */
  const clock = new THREE.Clock();
  const motePos = moteGeo.attributes.position.array;
  function frame() {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, clock.getDelta());
    const t = clock.getElapsedTime();
    cur.x += (target.x - cur.x) * 0.045; cur.y += (target.y - cur.y) * 0.045;

    // opening moment: points gather into the cross over ~2.5 s (time-based, so slow devices still finish)
    const gather = reduced ? 0 : Math.exp(-t * 1.4);
    const want = Math.max(gather, scroll * 1.1);
    mat.uniforms.uScatter.value += (want - mat.uniforms.uScatter.value) * (1 - Math.exp(-dt * 6));
    mat.uniforms.uTime.value = t;
    mat.uniforms.uFade.value = 1 - scroll * 0.5;
    coreMat.opacity = 0.05 * (1 - mat.uniforms.uScatter.value);

    group.rotation.y = (reduced ? 0 : Math.sin(t * 0.25) * 0.25) + cur.x * 0.3 - 0.25 - scroll * 0.5;
    group.rotation.x = cur.y * 0.1;
    group.position.y = (reduced ? 0 : Math.sin(t * 0.7) * 0.06) + scroll * 1.2;
    stars.rotation.y = t * 0.006 + cur.x * 0.03;

    for (let i = 0; i < MN; i++) {
      motePos[i * 3] += mv[i * 3]; motePos[i * 3 + 1] += mv[i * 3 + 1];
      if (motePos[i * 3 + 1] > 5) motePos[i * 3 + 1] = -5;
    }
    moteGeo.attributes.position.needsUpdate = true;

    camera.lookAt(group.position.x * 0.55, 0.3, 0);
    renderer.render(scene, camera);
  }
  frame();
}
})();
